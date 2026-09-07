import type {
  DifficultyRating,
  ExerciseConfigSnapshot,
  ExerciseSession,
  FormQuality,
  PreparedWorkout,
  ProgramExercise,
  SetSession,
} from '@/types';
import type { AudioEngine } from '@/audio-engine/engine';
import type { HapticsPort } from '@/platform/haptics';
import {
  shouldCatchUpOnResume,
  shouldPauseForBackground,
} from '@/platform/background';
import {
  buildCountdownCues,
  buildRepPlan,
  buildRestCues,
  buildSetCues,
  progressAt,
  SET_START_DELAY,
  type CueKind,
  type RepSlot,
  type ScheduledCue,
} from '@/timing-engine/cues';
import type { Clock } from '@/timing-engine/clock';
import { formatTempo, formatTempoDisplay, phaseAt, tempoSeconds } from '@/utils/tempo';
import { createId, nowIso } from '@/utils/id';
import { weakerLegReps } from '@/progression/algorithm';
import type { EngineEvent } from '@/workout-engine/events';
import type {
  EngineSnapshotV1,
  StateKind,
  WorkoutView,
} from '@/workout-engine/types';
import { SNAPSHOT_VERSION } from '@/workout-engine/types';

const SET_COMPLETE_SECONDS = 2;
const EXERCISE_COMPLETE_SECONDS = 2.5;

type AudioPort = Pick<AudioEngine, 'schedule' | 'cancel' | 'unlock'>;

export type WorkoutEngineOptions = {
  clock: Clock;
  audio?: AudioPort | null;
  haptics?: HapticsPort | null;
  nowWall?: () => number;
  createId?: () => string;
  nowIso?: () => string;
};

export class WorkoutEngine {
  kind: StateKind = 'idle';
  pausedKind: StateKind | null = null;
  sessionId = '';
  exerciseIndex = 0;
  setIndex = 0;
  actualTargets: number[][] = [];
  prescribedTargets: number[][] = [];
  exerciseSessionIds: string[] = [];
  ratings: Array<{
    difficultyRating: DifficultyRating | null;
    rir: number | null;
    formQuality: FormQuality | null;
  }> = [];
  status: 'in_progress' | 'completed' | 'aborted' = 'in_progress';

  private prepared: PreparedWorkout | null = null;
  private segmentStartedAt = 0;
  private segmentDuration = 0;
  private elapsedAtPause = 0;
  private restPlanned = 0;
  private startedAtWall = 0;
  private lastLoggedSetKey = '';
  private events: EngineEvent[] = [];
  private lastSnapshotAt = 0;

  constructor(private readonly options: WorkoutEngineOptions) {}

  start(prepared: PreparedWorkout, sessionId: string): void {
    this.prepared = prepared;
    this.sessionId = sessionId;
    this.exerciseIndex = 0;
    this.setIndex = 0;
    this.prescribedTargets = prepared.exercises.map((item) => {
      const targets = item.progression.currentTargets.slice(0, item.sets);
      while (targets.length < item.sets) {
        targets.push(targets[0] ?? item.minReps);
      }
      return targets;
    });
    this.actualTargets = this.prescribedTargets.map((row) => row.slice());
    this.exerciseSessionIds = prepared.exercises.map(() => this.id());
    this.ratings = prepared.exercises.map(() => ({
      difficultyRating: null,
      rir: null,
      formQuality: null,
    }));
    this.status = 'in_progress';
    this.startedAtWall = this.wall();
    this.lastLoggedSetKey = '';
    this.pausedKind = null;
    this.emitExerciseSession(0);
    this.enter('pre_set_countdown', this.clock(), 3);
  }

  hydrate(prepared: PreparedWorkout, snapshot: EngineSnapshotV1): void {
    this.prepared = prepared;
    this.sessionId = snapshot.sessionId;
    this.exerciseIndex = snapshot.exerciseIndex;
    this.setIndex = snapshot.setIndex;
    this.actualTargets = snapshot.actualTargets.map((row) => row.slice());
    this.prescribedTargets = snapshot.prescribedTargets.map((row) => row.slice());
    this.exerciseSessionIds = snapshot.exerciseSessionIds.slice();
    this.ratings = snapshot.ratings.map((row) => ({ ...row }));
    this.lastLoggedSetKey = snapshot.lastLoggedSetKey ?? '';
    this.status = snapshot.status;
    this.startedAtWall = snapshot.startedAtWall;
    this.restPlanned = snapshot.restPlanned;
    const now = this.clock();
    let elapsed = snapshot.elapsedInSegment;
    if (shouldCatchUpOnResume(snapshot.kind) || (snapshot.kind === 'paused' && snapshot.pausedKind && shouldCatchUpOnResume(snapshot.pausedKind))) {
      elapsed += (this.wall() - snapshot.wallClockAt) / 1000;
    }
    const kind = snapshot.kind === 'paused' ? snapshot.pausedKind ?? 'paused' : snapshot.kind;
    this.pausedKind = null;
    this.kind = 'idle';
    if (kind === 'workout_complete' || snapshot.status !== 'in_progress') {
      this.kind = 'workout_complete';
      this.segmentDuration = 0;
      this.segmentStartedAt = now;
      return;
    }
    this.enter(kind, now - Math.max(0, elapsed), snapshot.segmentDuration, true);
    if (snapshot.kind === 'paused' && !shouldCatchUpOnResume(kind)) {
      this.pause();
    }
  }

  handleVisibilityHidden(): void {
    if (shouldPauseForBackground(this.kind)) {
      this.pause();
    }
    this.emitSnapshot();
  }

  handleVisibilityVisible(): void {
    if (this.kind === 'paused' && this.pausedKind && shouldCatchUpOnResume(this.pausedKind)) {
      this.resume();
    }
    this.sync();
  }

  sync(): WorkoutView {
    const now = this.clock();
    if (
      this.kind !== 'idle' &&
      this.kind !== 'paused' &&
      this.kind !== 'workout_complete' &&
      now - this.segmentStartedAt >= this.segmentDuration - 0.0001
    ) {
      this.finishSegment(now);
    }
    if (now - this.lastSnapshotAt >= 5) {
      this.emitSnapshot();
    }
    return this.getView();
  }

  pause(): void {
    if (this.kind === 'paused' || this.kind === 'idle' || this.kind === 'workout_complete') {
      return;
    }
    this.elapsedAtPause = Math.max(0, this.clock() - this.segmentStartedAt);
    this.pausedKind = this.kind;
    this.kind = 'paused';
    this.options.audio?.cancel();
    this.emitSnapshot();
  }

  resume(): void {
    if (this.kind !== 'paused' || !this.pausedKind) return;
    const now = this.clock();
    const resumeKind = this.pausedKind;
    this.pausedKind = null;
    this.enter(resumeKind, now - this.elapsedAtPause, this.segmentDuration, true);
  }

  skipSet(): void {
    if (this.kind === 'idle' || this.kind === 'workout_complete') return;
    if (this.kind === 'paused') this.unpauseForControl();
    this.logCurrentSet({ skipped: true, completedFromElapsed: false });
    this.advanceAfterSet(this.clock());
  }

  skipExercise(): void {
    if (this.kind === 'idle' || this.kind === 'workout_complete') return;
    if (this.kind === 'paused') this.unpauseForControl();
    const item = this.currentItem();
    if (!item) return;
    for (let i = this.setIndex; i < item.sets; i++) {
      this.setIndex = i;
      this.logCurrentSet({ skipped: true, completedFromElapsed: false });
    }
    this.enter('exercise_complete', this.clock(), EXERCISE_COMPLETE_SECONDS);
  }

  restartSet(): void {
    if (this.kind === 'idle' || this.kind === 'workout_complete') return;
    if (this.kind === 'paused') this.unpauseForControl();
    this.enter('pre_set_countdown', this.clock(), 3);
  }

  endWorkout(): void {
    if (this.kind === 'idle' || this.kind === 'workout_complete') return;
    this.options.audio?.cancel();
    this.status = 'aborted';
    this.kind = 'workout_complete';
    this.pausedKind = null;
    this.segmentDuration = 0;
    this.segmentStartedAt = this.clock();
    this.events.push({
      type: 'workout_finished',
      sessionId: this.sessionId,
      status: 'aborted',
      durationMs: this.wall() - this.startedAtWall,
    });
    this.emitSnapshot();
  }

  extendRest(seconds: number): void {
    const active = this.kind === 'paused' ? this.pausedKind : this.kind;
    if (active !== 'resting' && active !== 'exercise_transition') return;
    this.segmentDuration += seconds;
    this.restPlanned += seconds;
    if (this.kind === 'paused') return;
    this.rescheduleCurrent(this.clock());
    this.emitSnapshot();
  }

  addRep(): void {
    this.adjustReps(1);
  }

  removeRep(): void {
    this.adjustReps(-1);
  }

  setTargetForCurrent(reps: number): void {
    const item = this.currentItem();
    if (!item) return;
    const next = Math.max(1, Math.round(reps));
    this.actualTargets[this.exerciseIndex][this.setIndex] = next;
    if (this.kind === 'set_active' || (this.kind === 'paused' && this.pausedKind === 'set_active')) {
      this.rebuildActiveSet(this.clock());
    }
    this.emitSnapshot();
  }

  rateCurrentExercise(input: {
    difficultyRating: DifficultyRating | null;
    rir: number | null;
    formQuality: FormQuality | null;
  }): void {
    this.ratings[this.exerciseIndex] = input;
    const id = this.exerciseSessionIds[this.exerciseIndex];
    this.events.push({
      type: 'exercise_rated',
      exerciseSessionId: id,
      ...input,
    });
    this.emitSnapshot();
  }

  drainEvents(): EngineEvent[] {
    const batch = this.events;
    this.events = [];
    return batch;
  }

  getSnapshot(): EngineSnapshotV1 {
    const elapsed =
      this.kind === 'paused'
        ? this.elapsedAtPause
        : Math.max(0, this.clock() - this.segmentStartedAt);
    return {
      version: SNAPSHOT_VERSION,
      sessionId: this.sessionId,
      kind: this.kind,
      pausedKind: this.pausedKind,
      exerciseIndex: this.exerciseIndex,
      setIndex: this.setIndex,
      actualTargets: this.actualTargets.map((row) => row.slice()),
      prescribedTargets: this.prescribedTargets.map((row) => row.slice()),
      elapsedInSegment: elapsed,
      segmentDuration: this.segmentDuration,
      restPlanned: this.restPlanned,
      wallClockAt: this.wall(),
      startedAtWall: this.startedAtWall,
      exerciseSessionIds: this.exerciseSessionIds.slice(),
      ratings: this.ratings.map((row) => ({ ...row })),
      lastLoggedSetKey: this.lastLoggedSetKey,
      status: this.status,
    };
  }

  getView(): WorkoutView {
    const prepared = this.prepared;
    const fallback = emptyView(this);
    if (!prepared) return fallback;
    const item = prepared.exercises[this.exerciseIndex] ?? prepared.exercises[0];
    if (!item) return fallback;
    const elapsed = this.currentElapsed();
    const target = this.currentTarget();
    const prescribed = this.prescribedTargets[this.exerciseIndex][this.setIndex] ?? target;
    const plan = this.planFor(item, target);
    const kind = this.kind === 'paused' ? this.pausedKind ?? 'paused' : this.kind;
    let currentRep = 0;
    let phase = null as WorkoutView['phase'];
    let side: WorkoutView['side'];
    let countdown: number | null = null;
    let restRemaining = 0;
    let approaching = false;
    let setCompleteReps = target;

    if (kind === 'pre_set_countdown') {
      countdown = Math.max(1, Math.ceil(this.segmentDuration - elapsed));
    }
    if (kind === 'set_active') {
      const progress = progressAt(Math.max(0, elapsed - SET_START_DELAY), item.tempo, plan);
      if (progress.slot) {
        currentRep = progress.slot.repOnSide;
        side = progress.slot.side;
        const phaseInfo = phaseAt(item.tempo, progress.secondsIntoRep);
        phase = phaseInfo.phase;
      } else {
        currentRep = target;
      }
    }
    if (kind === 'set_complete') {
      currentRep = target;
      setCompleteReps = target;
    }
    if (kind === 'resting' || kind === 'exercise_transition') {
      restRemaining = Math.max(0, this.segmentDuration - elapsed);
      approaching = restRemaining <= 10;
      if (restRemaining <= 3 && restRemaining > 0) {
        countdown = Math.max(1, Math.ceil(restRemaining));
      }
    }

    const next = this.peekNext();
    const rating = this.ratings[this.exerciseIndex] ?? {
      difficultyRating: null,
      rir: null,
      formQuality: null,
    };

    return {
      kind: this.kind,
      pausedKind: this.pausedKind,
      sessionId: this.sessionId,
      programName: prepared.program.name,
      exerciseName: item.exercise.name,
      exerciseIndex: this.exerciseIndex,
      exerciseCount: prepared.exercises.length,
      setIndex: this.setIndex,
      setCount: item.sets,
      prescribedTarget: prescribed,
      actualTarget: target,
      currentRep,
      currentRepDisplay: currentRep,
      targetDisplay: target,
      phase,
      side,
      tempoLabel: formatTempoDisplay(item.tempo),
      tempoCompact: formatTempo(item.tempo),
      countdown,
      restRemaining,
      restTotal: this.restPlanned || this.segmentDuration,
      approaching,
      nextExerciseName: next.exerciseName,
      nextSetIndex: next.setIndex,
      nextTarget: next.target,
      elapsedWorkoutMs: Math.max(0, this.wall() - this.startedAtWall),
      canRate: kind === 'exercise_complete' || kind === 'exercise_transition',
      rating,
      resistanceLabel: item.progression.resistanceLabel,
      laterality: item.laterality,
      setCompleteReps,
      workoutComplete: this.kind === 'workout_complete',
    };
  }

  currentItem(): ProgramExercise | null {
    return this.prepared?.exercises[this.exerciseIndex] ?? null;
  }

  private unpauseForControl(): void {
    if (this.kind !== 'paused' || !this.pausedKind) return;
    this.kind = this.pausedKind;
    this.pausedKind = null;
    this.segmentStartedAt = this.clock() - this.elapsedAtPause;
  }

  private adjustReps(delta: number): void {
    const item = this.currentItem();
    if (!item) return;
    const current = this.currentTarget();
    const next = Math.max(1, current + delta);
    this.actualTargets[this.exerciseIndex][this.setIndex] = next;
    if (this.kind === 'set_active' || (this.kind === 'paused' && this.pausedKind === 'set_active')) {
      this.rebuildActiveSet(this.clock());
    }
    this.emitSnapshot();
  }

  private rebuildActiveSet(now: number): void {
    const item = this.currentItem();
    if (!item) return;
    const elapsed = this.kind === 'paused' ? this.elapsedAtPause : now - this.segmentStartedAt;
    const plan = this.planFor(item, this.currentTarget());
    const duration = SET_START_DELAY + plan.length * tempoSeconds(item.tempo);
    this.segmentDuration = duration;
    if (this.kind === 'paused') {
      this.elapsedAtPause = Math.min(elapsed, duration);
      return;
    }
    if (elapsed >= duration) {
      this.finishSegment(now);
      return;
    }
    this.rescheduleCurrent(now);
  }

  private finishSegment(now: number): void {
    switch (this.kind) {
      case 'pre_set_countdown':
        this.enter('set_active', now, this.setDuration());
        break;
      case 'set_active':
        this.logCurrentSet({ skipped: false, completedFromElapsed: true });
        this.enter('set_complete', now, SET_COMPLETE_SECONDS);
        break;
      case 'set_complete':
        this.advanceAfterSet(now);
        break;
      case 'resting':
        this.enter('set_active', now, this.setDuration());
        break;
      case 'exercise_complete':
        this.finishExercise(now);
        break;
      case 'exercise_transition':
        this.enter('pre_set_countdown', now, 3);
        break;
      default:
        break;
    }
  }

  private advanceAfterSet(now: number): void {
    const item = this.currentItem();
    if (!item) return;
    if (this.setIndex < item.sets - 1) {
      this.setIndex += 1;
      this.restPlanned = item.restAfterSetSeconds;
      this.enter('resting', now, item.restAfterSetSeconds);
      return;
    }
    this.enter('exercise_complete', now, EXERCISE_COMPLETE_SECONDS);
  }

  private finishExercise(now: number): void {
    const prepared = this.prepared;
    if (!prepared) return;
    const id = this.exerciseSessionIds[this.exerciseIndex];
    this.events.push({ type: 'exercise_complete', exerciseSessionId: id });
    if (this.exerciseIndex < prepared.exercises.length - 1) {
      this.exerciseIndex += 1;
      this.setIndex = 0;
      this.emitExerciseSession(this.exerciseIndex);
      const prev = prepared.exercises[this.exerciseIndex - 1];
      this.restPlanned = prev.transitionAfterExerciseSeconds;
      this.enter('exercise_transition', now, prev.transitionAfterExerciseSeconds);
      return;
    }
    this.status = 'completed';
    this.kind = 'workout_complete';
    this.options.audio?.cancel();
    this.events.push({
      type: 'workout_finished',
      sessionId: this.sessionId,
      status: 'completed',
      durationMs: this.wall() - this.startedAtWall,
    });
    this.emitSnapshot();
  }

  private enter(
    kind: StateKind,
    startedAt: number,
    duration: number,
    restoring = false,
  ): void {
    this.kind = kind;
    this.segmentStartedAt = startedAt;
    this.segmentDuration = duration;
    if (kind === 'resting' || kind === 'exercise_transition') {
      this.restPlanned = duration;
    }
    if (!restoring) {
      this.emitSnapshot();
    }
    this.rescheduleCurrent(this.clock());
  }

  private rescheduleCurrent(now: number): void {
    this.options.audio?.cancel();
    const cues = this.cuesFrom(now);
    if (cues.length > 0) {
      this.options.audio?.schedule(cues, now);
    }
    const hapticKind = this.hapticForKind(this.kind);
    if (hapticKind && now - this.segmentStartedAt < 0.05) {
      void this.options.haptics?.trigger(hapticKind);
    }
  }

  private cuesFrom(now: number): ScheduledCue[] {
    const item = this.currentItem();
    const start = this.segmentStartedAt;
    if (this.kind === 'pre_set_countdown') {
      return buildCountdownCues(start).cues.filter((cue) => cue.at >= now - 0.01);
    }
    if (this.kind === 'set_active' && item) {
      const plan = this.planFor(item, this.currentTarget());
      const { cues } = buildSetCues(item.tempo, plan, start + SET_START_DELAY);
      return cues.filter((cue) => cue.at >= now - 0.01);
    }
    if (this.kind === 'set_complete') {
      return [{ at: start, kind: 'set_complete' as const }].filter((cue) => cue.at >= now - 0.05);
    }
    if (this.kind === 'resting' || this.kind === 'exercise_transition') {
      return buildRestCues(start, this.segmentDuration).filter((cue) => cue.at >= now - 0.01);
    }
    return [];
  }

  private setDuration(): number {
    const item = this.currentItem();
    if (!item) return SET_START_DELAY;
    const plan = this.planFor(item, this.currentTarget());
    return SET_START_DELAY + plan.length * tempoSeconds(item.tempo);
  }

  private planFor(item: ProgramExercise, target: number): RepSlot[] {
    return buildRepPlan({
      laterality: item.laterality,
      unilateralOrder: item.unilateralOrder,
      target,
    });
  }

  private currentTarget(): number {
    return this.actualTargets[this.exerciseIndex]?.[this.setIndex] ?? 1;
  }

  private currentElapsed(): number {
    if (this.kind === 'paused') return this.elapsedAtPause;
    if (this.kind === 'idle') return 0;
    return Math.max(0, this.clock() - this.segmentStartedAt);
  }

  private peekNext(): { exerciseName: string | null; setIndex: number; target: number } {
    const prepared = this.prepared;
    if (!prepared) return { exerciseName: null, setIndex: 0, target: 0 };
    const liveKind = this.kind === 'paused' ? this.pausedKind : this.kind;
    const item = prepared.exercises[this.exerciseIndex];
    if (
      liveKind === 'resting' ||
      liveKind === 'exercise_transition' ||
      liveKind === 'pre_set_countdown'
    ) {
      return {
        exerciseName: item?.exercise.name ?? null,
        setIndex: this.setIndex,
        target: this.currentTarget(),
      };
    }
    if (item && this.setIndex < item.sets - 1) {
      return {
        exerciseName: item.exercise.name,
        setIndex: this.setIndex + 1,
        target: this.actualTargets[this.exerciseIndex][this.setIndex + 1],
      };
    }
    const next = prepared.exercises[this.exerciseIndex + 1];
    if (!next) return { exerciseName: null, setIndex: 0, target: 0 };
    return {
      exerciseName: next.exercise.name,
      setIndex: 0,
      target: this.actualTargets[this.exerciseIndex + 1]?.[0] ?? next.minReps,
    };
  }

  private logCurrentSet(input: { skipped: boolean; completedFromElapsed: boolean }): void {
    const item = this.currentItem();
    if (!item) return;
    const stamp = `${this.exerciseIndex}:${this.setIndex}`;
    if (this.lastLoggedSetKey === stamp) {
      return;
    }
    this.lastLoggedSetKey = stamp;
    const prescribed = this.prescribedTargets[this.exerciseIndex][this.setIndex];
    const actual = this.currentTarget();
    const plan = this.planFor(item, actual);
    let completedReps = 0;
    let leftReps: number | null = item.laterality === 'unilateral' ? 0 : null;
    let rightReps: number | null = item.laterality === 'unilateral' ? 0 : null;
    if (input.skipped) {
      completedReps = 0;
    } else if (input.completedFromElapsed) {
      if (item.laterality === 'unilateral') {
        leftReps = plan.filter((slot) => slot.side === 'left').length;
        rightReps = plan.filter((slot) => slot.side === 'right').length;
        completedReps = weakerLegReps(leftReps, rightReps);
      } else {
        completedReps = actual;
      }
    }
    const stampIso = this.iso();
    const record: SetSession = {
      id: this.id(),
      workoutSessionId: this.sessionId,
      exerciseSessionId: this.exerciseSessionIds[this.exerciseIndex],
      setIndex: this.setIndex,
      prescribedTarget: prescribed,
      actualTarget: actual,
      completedReps,
      leftReps,
      rightReps,
      skipped: input.skipped,
      targetReduced: actual < prescribed,
      tempoSnapshot: item.tempo,
      restSecondsPlanned:
        this.setIndex < item.sets - 1 ? item.restAfterSetSeconds : item.transitionAfterExerciseSeconds,
      restSecondsActual: null,
      startedAt: stampIso,
      completedAt: stampIso,
      createdAt: stampIso,
      updatedAt: stampIso,
      syncStatus: 'local',
    };
    this.events.push({ type: 'set_session', record });
  }

  private emitExerciseSession(index: number): void {
    const prepared = this.prepared;
    if (!prepared) return;
    const item = prepared.exercises[index];
    const stamp = this.iso();
    const config: ExerciseConfigSnapshot = {
      name: item.exercise.name,
      sets: item.sets,
      minReps: item.minReps,
      maxReps: item.maxReps,
      tempo: item.tempo,
      restAfterSetSeconds: item.restAfterSetSeconds,
      transitionAfterExerciseSeconds: item.transitionAfterExerciseSeconds,
      targetRirMin: item.targetRirMin,
      targetRirMax: item.targetRirMax,
      progressionType: item.progressionType,
      laterality: item.laterality,
      unilateralOrder: item.unilateralOrder,
      resistanceLabel: item.progression.resistanceLabel,
    };
    const record: ExerciseSession = {
      id: this.exerciseSessionIds[index],
      workoutSessionId: this.sessionId,
      exerciseId: item.exerciseId,
      order: item.order,
      nameSnapshot: item.exercise.name,
      configSnapshot: config,
      targetRepsPerSet: this.actualTargets[index].slice(),
      difficultyRating: this.ratings[index]?.difficultyRating ?? null,
      rir: this.ratings[index]?.rir ?? null,
      formQuality: this.ratings[index]?.formQuality ?? null,
      completedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
      syncStatus: 'local',
    };
    this.events.push({ type: 'exercise_session', record });
  }

  private emitSnapshot(): void {
    this.lastSnapshotAt = this.clock();
    this.events.push({ type: 'snapshot', json: JSON.stringify(this.getSnapshot()) });
  }

  private hapticForKind(kind: StateKind): 'start' | 'complete' | 'warning' | null {
    if (kind === 'set_active' || kind === 'pre_set_countdown') return 'start';
    if (kind === 'set_complete' || kind === 'exercise_complete') return 'complete';
    if (kind === 'resting') return null;
    return null;
  }

  private clock(): number {
    return this.options.clock.now();
  }

  private wall(): number {
    return this.options.nowWall?.() ?? Date.now();
  }

  private id(): string {
    return this.options.createId?.() ?? createId();
  }

  private iso(): string {
    return this.options.nowIso?.() ?? nowIso();
  }
}

function emptyView(engine: WorkoutEngine): WorkoutView {
  return {
    kind: engine.kind,
    pausedKind: engine.pausedKind,
    sessionId: engine.sessionId,
    programName: '',
    exerciseName: '',
    exerciseIndex: 0,
    exerciseCount: 0,
    setIndex: 0,
    setCount: 0,
    prescribedTarget: 0,
    actualTarget: 0,
    currentRep: 0,
    currentRepDisplay: 0,
    targetDisplay: 0,
    phase: null,
    side: undefined,
    tempoLabel: '',
    tempoCompact: '',
    countdown: null,
    restRemaining: 0,
    restTotal: 0,
    approaching: false,
    nextExerciseName: null,
    nextSetIndex: 0,
    nextTarget: 0,
    elapsedWorkoutMs: 0,
    canRate: false,
    rating: { difficultyRating: null, rir: null, formQuality: null },
    resistanceLabel: '',
    laterality: 'bilateral',
    setCompleteReps: 0,
    workoutComplete: engine.kind === 'workout_complete',
  };
}

export function cueHaptic(kind: CueKind): 'tick' | 'start' | 'warning' | 'complete' | 'countdown' | null {
  switch (kind) {
    case 'tick':
      return 'tick';
    case 'start':
      return 'start';
    case 'warning':
      return 'warning';
    case 'set_complete':
      return 'complete';
    case 'countdown':
    case 'rest_countdown':
      return 'countdown';
    default:
      return null;
  }
}
