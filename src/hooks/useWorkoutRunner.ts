import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { audioEngine } from '@/audio-engine/engine';
import * as repo from '@/database/repository';
import { haptics, wakeLock } from '@/platform';
import { notifyRestComplete } from '@/platform/notifications';
import { PerformanceClock } from '@/timing-engine/clock';
import { WorkoutEngine } from '@/workout-engine/engine';
import { persistEngineEvents } from '@/workout-engine/persist';
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
  rate: (input: {
    difficultyRating: DifficultyRating | null;
    rir: number | null;
    formQuality: FormQuality | null;
  }) => void;
};

export function useWorkoutRunner(resumeSessionId?: string | null) {
  const navigate = useNavigate();
  const engineRef = useRef<WorkoutEngine | null>(null);
  const [view, setView] = useState<WorkoutView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState<WorkoutControls | null>(null);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    const clock = new PerformanceClock();

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
        audioEngine.configure({
          profile: settings.soundsEnabled ? settings.soundProfile : 'silent',
          volume: settings.volume,
          enabled: settings.soundsEnabled,
        });
        haptics.setEnabled(settings.hapticsEnabled);
        wakeLock.setEnabled(settings.keepAwake);
        await audioEngine.unlock();
        await wakeLock.request();

        const prepared: PreparedWorkout = await repo.getPreparedWorkout();
        const engine = new WorkoutEngine({
          clock,
          audio: audioEngine,
          haptics,
        });
        engineRef.current = engine;
        setControls(bindControls(engine));

        if (resumeSessionId) {
          const session = await repo.getSession(resumeSessionId);
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
        setView(engine.getView());

        const loop = () => {
          if (cancelled || !engineRef.current) return;
          const next = engineRef.current.sync();
          setView({ ...next });
          const events = engineRef.current.drainEvents();
          if (next.kind === 'workout_complete') {
            void wakeLock.release();
            void persistEngineEvents(events).then(() => {
              navigate(`/review/${next.sessionId}`, { replace: true });
            });
            return;
          }
          if (events.length > 0) {
            void persistEngineEvents(events);
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
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
        if (current.kind === 'resting' && current.restRemaining <= 0) {
          notifyRestComplete('Momentum', 'Rest is over. Next set.');
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
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      audioEngine.cancel();
      void wakeLock.release();
    };
  }, [navigate, resumeSessionId]);

  return { view, error, controls };
}
