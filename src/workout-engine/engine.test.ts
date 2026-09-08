import { describe, expect, it } from 'vitest';
import { ManualClock } from '@/timing-engine/clock';
import { WorkoutEngine } from '@/workout-engine/engine';
import { SET_START_DELAY } from '@/timing-engine/cues';
import type { PreparedWorkout } from '@/types';

function prepared(): PreparedWorkout {
  const stamp = '2026-01-01T00:00:00.000Z';
  const tempo = { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 };
  const make = (
    id: string,
    name: string,
    order: number,
    sets: number,
    min: number,
    max: number,
    laterality: 'bilateral' | 'unilateral',
    rest: number,
    targets: number[],
  ) => ({
    id: `config-${id}`,
    programId: 'p1',
    exerciseId: id,
    order,
    sets,
    minReps: min,
    maxReps: max,
    tempo: laterality === 'unilateral' ? { ...tempo, bottomPause: 1 } : tempo,
    restAfterSetSeconds: rest,
    transitionAfterExerciseSeconds: 30,
    targetRirMin: 1,
    targetRirMax: 2,
    progressionType: 'rep-range' as const,
    laterality,
    unilateralOrder: 'right-then-left' as const,
    resistanceLabel: 'Bodyweight',
    createdAt: stamp,
    updatedAt: stamp,
    syncStatus: 'local' as const,
    exercise: { id, name, createdAt: stamp, updatedAt: stamp, syncStatus: 'local' as const },
    progression: {
      id: `prog-${id}`,
      exerciseId: id,
      resistanceLabel: 'Bodyweight',
      currentTargets: targets,
      lastCompletedReps: [],
      lastRir: null,
      lastDifficultyRating: null,
      lastFormQuality: null,
      recommendedNextTargets: targets,
      recommendedResistanceChange: null,
      personalBestReps: 0,
      personalBestDate: null,
      lastWorkoutDate: null,
      lifetimeReps: 0,
      lifetimeSets: 0,
      createdAt: stamp,
      updatedAt: stamp,
      syncStatus: 'local' as const,
    },
  });

  return {
    program: {
      id: 'p1',
      name: 'Minimalist Strength',
      createdAt: stamp,
      updatedAt: stamp,
      syncStatus: 'local',
    },
    exercises: [
      make('ex1', 'L-Sit Chin-Up', 0, 2, 6, 10, 'bilateral', 150, [8, 8]),
      make('ex2', 'Pull-Up', 1, 1, 6, 12, 'bilateral', 150, [9]),
      make('ex3', 'Push-Up', 2, 2, 6, 12, 'bilateral', 120, [9, 9]),
      make('ex4', 'Pistol Squat', 3, 2, 5, 8, 'unilateral', 150, [6, 6]),
    ],
  };
}

function engineWithClock() {
  const clock = new ManualClock();
  const engine = new WorkoutEngine({
    clock,
    audio: null,
    nowWall: () => 1_000_000,
    createId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
    nowIso: () => '2026-09-07T00:00:00.000Z',
  });
  engine.start(prepared(), 'session-1');
  return { clock, engine };
}

describe('workout engine', () => {
  it('starts in a pre-set countdown', () => {
    const { engine } = engineWithClock();
    const view = engine.getView();
    expect(view.kind).toBe('pre_set_countdown');
    expect(view.exerciseName).toBe('L-Sit Chin-Up');
    expect(view.countdown).toBe(3);
    expect(view.targetRepsPerSet).toEqual([8, 8]);
    expect(view.minReps).toBe(6);
    expect(view.maxReps).toBe(10);
  });

  it('enters the set after countdown and counts reps from tempo', () => {
    const { clock, engine } = engineWithClock();
    clock.advance(3);
    engine.sync();
    expect(engine.getView().kind).toBe('set_active');
    clock.advance(SET_START_DELAY + 0.01);
    engine.sync();
    expect(engine.getView().currentRep).toBe(1);
    clock.advance(4);
    engine.sync();
    expect(engine.getView().currentRep).toBe(2);
  });

  it('completes a set and starts rest automatically', () => {
    const { clock, engine } = engineWithClock();
    clock.advance(3);
    engine.sync();
    clock.advance(SET_START_DELAY + 8 * 4);
    engine.sync();
    expect(engine.getView().kind).toBe('set_complete');
    clock.advance(2);
    engine.sync();
    expect(engine.getView().kind).toBe('resting');
    expect(engine.getView().nextSetIndex).toBe(1);
    expect(Math.round(engine.getView().restRemaining)).toBe(150);
  });

  it('moves to the next exercise after the last set', () => {
    const { clock, engine } = engineWithClock();
    engine.skipSet();
    engine.sync();
    expect(engine.getView().kind).toBe('resting');
    engine.skipSet();
    engine.sync();
    expect(engine.getView().kind).toBe('exercise_complete');
    clock.advance(2.5);
    engine.sync();
    expect(engine.getView().kind).toBe('exercise_transition');
    expect(engine.getView().exerciseName).toBe('Pull-Up');
  });

  it('runs both pistol squat legs before completing the set', () => {
    const { clock, engine } = engineWithClock();
    engine.skipExercise();
    clock.advance(2.5);
    engine.sync();
    engine.skipExercise();
    clock.advance(2.5);
    engine.sync();
    engine.skipExercise();
    clock.advance(2.5);
    engine.sync();
    expect(engine.getView().exerciseName).toBe('Pistol Squat');
    clock.advance(30);
    engine.sync();
    clock.advance(3);
    engine.sync();
    expect(engine.getView().kind).toBe('set_active');
    clock.advance(SET_START_DELAY + 0.1);
    engine.sync();
    expect(engine.getView().side).toBe('right');
    clock.advance(6 * 5);
    engine.sync();
    expect(engine.getView().side).toBe('left');
    clock.advance(6 * 5);
    engine.sync();
    expect(engine.getView().kind).toBe('set_complete');
  });

  it('pauses and resumes remaining rest', () => {
    const { clock, engine } = engineWithClock();
    engine.skipSet();
    expect(engine.getView().kind).toBe('resting');
    clock.advance(20);
    engine.pause();
    expect(engine.getView().kind).toBe('paused');
    clock.advance(50);
    engine.resume();
    expect(engine.getView().kind).toBe('resting');
    expect(engine.getView().restRemaining).toBeCloseTo(130, 0);
  });

  it('extends rest', () => {
    const { clock, engine } = engineWithClock();
    engine.skipSet();
    engine.extendRest(30);
    expect(engine.getView().restTotal).toBe(180);
    void clock;
  });

  it('records a reduced target without rewriting the prescription', () => {
    const { engine } = engineWithClock();
    engine.setTargetForCurrent(6);
    const view = engine.getView();
    expect(view.actualTarget).toBe(6);
    expect(view.prescribedTarget).toBe(8);
  });

  it('can add and remove reps', () => {
    const { engine } = engineWithClock();
    engine.removeRep();
    expect(engine.getView().actualTarget).toBe(7);
    engine.addRep();
    engine.addRep();
    expect(engine.getView().actualTarget).toBe(9);
  });

  it('restores from a snapshot', () => {
    const { clock, engine } = engineWithClock();
    clock.advance(3);
    engine.sync();
    const snapshot = engine.getSnapshot();
    const clock2 = new ManualClock();
    clock2.set(clock.now());
    const restored = new WorkoutEngine({ clock: clock2, audio: null, nowWall: () => 1_000_000 });
    restored.hydrate(prepared(), snapshot);
    expect(restored.getView().kind).toBe('set_active');
    expect(restored.getView().exerciseName).toBe('L-Sit Chin-Up');
  });

  it('finishes the workout after the last exercise', () => {
    const { clock, engine } = engineWithClock();
    for (let i = 0; i < 4; i++) {
      engine.skipExercise();
      clock.advance(3);
      engine.sync();
    }
    expect(engine.getView().kind).toBe('workout_complete');
    const finished = engine.drainEvents().filter((event) => event.type === 'workout_finished');
    expect(finished).toHaveLength(1);
  });
});
