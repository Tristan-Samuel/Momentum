import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { audioEngine } from '@/audio-engine/engine';
import * as repo from '@/database/repository';
import { haptics, wakeLock } from '@/platform';
import {
  cancelRestCompleteAlert,
  notifyRestComplete,
  restAlertKey,
  scheduleRestCompleteAlert,
} from '@/platform/notifications';
import { PerformanceClock } from '@/timing-engine/clock';
import { WorkoutEngine } from '@/workout-engine/engine';
import { persistEngineEvents } from '@/workout-engine/persist';
import { measureNoun } from '@/utils/prescription';
import { parseSnapshot, type WorkoutView } from '@/workout-engine/types';
import type { DifficultyRating, FormQuality, PreparedWorkout } from '@/types';

export type WorkoutControls = {
  pause: () => void;
  resume: () => void;
  skipSet: () => void;
  skipExercise: () => void;
  restartSet: () => void;
  endWorkout: () => void;
  extendRest: (seconds: number) => void;
  addRep: () => void;
  removeRep: () => void;
  setTarget: (reps: number) => void;
  completeOpenSet: (reps: number, sides?: { left: number; right: number }) => void;
  rate: (input: {
    difficultyRating: DifficultyRating | null;
    rir: number | null;
    formQuality: FormQuality | null;
  }) => void;
};

export function useWorkoutRunner(resumeSessionId?: string | null, programId?: string | null) {
  const navigate = useNavigate();
  const engineRef = useRef<WorkoutEngine | null>(null);
  const [view, setView] = useState<WorkoutView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState<WorkoutControls | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let notificationsEnabled = false;
    let lastAlertKey: string | null = null;
    const clock = new PerformanceClock();

    const syncRestAlert = (next: WorkoutView) => {
      const key = restAlertKey({
        kind: next.kind === 'paused' ? next.pausedKind ?? next.kind : next.kind,
        exerciseIndex: next.exerciseIndex,
        setIndex: next.setIndex,
        restTotal: next.restTotal,
      });
      if (key === lastAlertKey) return;
      lastAlertKey = key;
      if (!key) {
        void cancelRestCompleteAlert();
        return;
      }
      const label =
        next.kind === 'exercise_transition' || next.pausedKind === 'exercise_transition'
          ? 'Transition is over. Next exercise.'
          : 'Rest is over. Next set.';
      void scheduleRestCompleteAlert({
        enabled: notificationsEnabled,
        title: 'Momentum',
        body: `${label} ${next.nextExerciseName ?? next.exerciseName} · ${next.nextTarget} ${measureNoun(next.measure)}`,
        inSeconds: next.restRemaining,
      });
    };

    const bindControls = (engine: WorkoutEngine): WorkoutControls => ({
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      skipSet: () => engine.skipSet(),
      skipExercise: () => engine.skipExercise(),
      restartSet: () => engine.restartSet(),
      endWorkout: () => engine.endWorkout(),
      extendRest: (seconds) => engine.extendRest(seconds),
      addRep: () => engine.addRep(),
      removeRep: () => engine.removeRep(),
      setTarget: (reps) => engine.setTargetForCurrent(reps),
      completeOpenSet: (reps, sides) => engine.completeOpenSet(reps, sides),
      rate: (input) => engine.rateCurrentExercise(input),
    });

    const flush = async (engine: WorkoutEngine) => {
      const events = engine.drainEvents();
      if (events.length === 0) return;
      await persistEngineEvents(events);
    };

    const boot = async () => {
      try {
        const settings = await repo.getSettings();
        notificationsEnabled = settings.notificationsEnabled;
        audioEngine.configure({
          profile: settings.soundsEnabled ? settings.soundProfile : 'silent',
          volume: settings.volume,
          enabled: settings.soundsEnabled,
        });
        haptics.setEnabled(settings.hapticsEnabled);
        wakeLock.setEnabled(settings.keepAwake);
        await audioEngine.unlock();
        await wakeLock.request();

        const resumeSession = resumeSessionId ? await repo.getSession(resumeSessionId) : undefined;
        const prepared: PreparedWorkout = await repo.getPreparedWorkout(
          resumeSession?.programId ?? programId ?? undefined,
        );
        const engine = new WorkoutEngine({
          clock,
          audio: audioEngine,
          haptics,
        });
        engineRef.current = engine;
        setControls(bindControls(engine));

        if (resumeSessionId) {
          const session = resumeSession;
          if (!session) {
            throw new Error('Nothing to resume');
          }
          const snapshot = session.engineSnapshot
            ? parseSnapshot(session.engineSnapshot)
            : null;
          if (snapshot) {
            engine.hydrate(prepared, snapshot);
          } else {
            engine.start(prepared, session.id);
          }
        } else {
          const session = await repo.createWorkoutSession(prepared);
          engine.start(prepared, session.id);
        }

        await flush(engine);
        if (cancelled) return;

        let lastStamp = '';
        let finished = false;
        const publish = (force = false) => {
          const current = engineRef.current;
          if (!current || cancelled || finished) return;
          const next = current.sync();
          const stamp = viewStamp(next);
          if (force || stamp !== lastStamp) {
            lastStamp = stamp;
            setView(next);
          }
          syncRestAlert(next);
          const events = current.drainEvents();
          if (next.kind === 'workout_complete') {
            finished = true;
            window.clearInterval(timer);
            void wakeLock.release();
            void persistEngineEvents(events).then(() => {
              navigate(`/review/${next.sessionId}`, { replace: true });
            });
            return;
          }
          if (events.length > 0) void persistEngineEvents(events);
        };
        publish(true);
        if (!finished) timer = window.setInterval(() => publish(), 100);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start workout');
      }
    };

    void boot();

    const onVisibility = () => {
      const engine = engineRef.current;
      if (!engine) return;
      if (document.visibilityState === 'hidden') {
        engine.handleVisibilityHidden();
        void flush(engine);
      } else {
        engine.handleVisibilityVisible();
        const current = engine.getView();
        setView(current);
        const liveKind = current.kind === 'paused' ? current.pausedKind : current.kind;
        if (
          current.kind !== 'paused' &&
          (liveKind === 'resting' || liveKind === 'exercise_transition') &&
          current.restRemaining <= 0
        ) {
          notifyRestComplete(
            'Momentum',
            liveKind === 'exercise_transition'
              ? 'Transition is over. Next exercise.'
              : 'Rest is over. Next set.',
          );
        }
        void audioEngine.unlock();
        void wakeLock.request();
        void flush(engine);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      audioEngine.cancel();
      void cancelRestCompleteAlert();
      void wakeLock.release();
    };
  }, [navigate, resumeSessionId, programId]);

  return { view, error, controls };
}

function viewStamp(view: WorkoutView): string {
  return [
    view.kind,
    view.pausedKind,
    view.exerciseIndex,
    view.setIndex,
    view.phase,
    view.currentRep,
    view.side,
    view.countdown,
    Math.ceil(view.restRemaining),
    Math.ceil(view.holdRemaining),
    Math.ceil(view.phaseRemaining),
    view.actualTarget,
    view.canRate,
    view.ratingExerciseName,
    view.rating.difficultyRating,
    view.rating.rir,
    view.rating.formQuality,
    view.ratingNote,
    Math.floor(view.elapsedWorkoutMs / 1000),
    view.switchingSides,
    view.workoutComplete,
    view.upcomingGap?.kind,
    view.upcomingGap?.seconds,
  ].join('|');
}
