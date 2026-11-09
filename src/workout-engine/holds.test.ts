import { describe, expect, it } from 'vitest';
import { ManualClock } from '@/timing-engine/clock';
import {
  buildHoldCues,
  HOLD_SWITCH_SECONDS,
  holdDurationSeconds,
  holdProgressAt,
  holdSides,
  SET_START_DELAY,
} from '@/timing-engine/cues';
import { WorkoutEngine } from '@/workout-engine/engine';
import { evaluateProgression } from '@/progression/algorithm';
import type { Laterality, PreparedWorkout } from '@/types';
import type { EngineEvent } from '@/workout-engine/events';

const stamp = '2026-01-01T00:00:00.000Z';

function holdWorkout(laterality: Laterality, target = 20): PreparedWorkout {
  return {
    program: { id: 'p1', name: 'Core', order: 0, createdAt: stamp, updatedAt: stamp, syncStatus: 'local' },
    exercises: [
      {
        id: 'config-plank',
        programId: 'p1',
        exerciseId: 'plank',
        order: 0,
        sets: 2,
        minReps: 15,
        maxReps: 45,
        tempo: { eccentric: 0, bottomPause: 0, concentric: 0, topPause: 0 },
        restAfterSetSeconds: 60,
        transitionAfterExerciseSeconds: 30,
        targetRirMin: 1,
        targetRirMax: 2,
        progressionType: 'rep-range',
        measure: 'seconds',
        progressionStep: 5,
        laterality,
        unilateralOrder: 'right-then-left',
        resistanceLabel: 'Bodyweight',
        createdAt: stamp,
        updatedAt: stamp,
        syncStatus: 'local',
        exercise: { id: 'plank', name: 'Side Plank', createdAt: stamp, updatedAt: stamp, syncStatus: 'local' },
        progression: {
          id: 'prog-plank',
          exerciseId: 'plank',
          resistanceLabel: 'Bodyweight',
          currentTargets: [target, target],
          lastCompletedReps: [],
          lastRir: null,
          lastDifficultyRating: null,
          lastFormQuality: null,
          recommendedNextTargets: [target, target],
          recommendedResistanceChange: null,
          personalBestReps: 0,
          personalBestDate: null,
          lastWorkoutDate: null,
          lifetimeReps: 0,
          lifetimeSets: 0,
          createdAt: stamp,
          updatedAt: stamp,
          syncStatus: 'local',
        },
      },
    ],
  };
}

function start(laterality: Laterality) {
  const clock = new ManualClock();
  const engine = new WorkoutEngine({ clock, audio: null, nowWall: () => 0, nowIso: () => stamp });
  engine.start(holdWorkout(laterality), 's1');
  clock.advance(3);
  engine.sync();
  return { clock, engine };
}

function setEvents(events: EngineEvent[]) {
  return events.flatMap((event) => (event.type === 'set_session' ? [event.record] : []));
}

describe('hold cues', () => {
  it('times one side per set for bilateral holds', () => {
    expect(holdDurationSeconds(30, holdSides('bilateral', 'right-then-left'))).toBe(30);
  });

  it('adds a switch gap between sides', () => {
    const sides = holdSides('unilateral', 'left-then-right');
    expect(sides).toEqual(['left', 'right']);
    expect(holdDurationSeconds(20, sides)).toBe(40 + HOLD_SWITCH_SECONDS);
    const mid = holdProgressAt(21, 20, sides);
    expect(mid.switching).toBe(true);
    expect(mid.side).toBe('right');
    expect(holdProgressAt(25, 20, sides).secondsIntoSide).toBe(2);
  });

  it('counts down the last three seconds and ends with set complete', () => {
    const cues = buildHoldCues(10, [undefined], 0);
    expect(cues.filter((cue) => cue.kind === 'rest_countdown').map((cue) => cue.count)).toEqual([3, 2, 1]);
    expect(cues.at(-1)).toEqual({ at: 10, kind: 'set_complete' });
  });
});

describe('engine with timed holds', () => {
  it('shows seconds held and the time remaining', () => {
    const { clock, engine } = start('bilateral');
    clock.advance(SET_START_DELAY + 5.5);
    const view = engine.sync();
    expect(view.kind).toBe('set_active');
    expect(view.measure).toBe('seconds');
    expect(view.currentRep).toBe(5);
    expect(Math.round(view.holdRemaining)).toBe(15);
  });

  it('logs the full hold when the timer completes', () => {
    const { clock, engine } = start('bilateral');
    engine.drainEvents();
    clock.advance(SET_START_DELAY + 20);
    engine.sync();
    expect(engine.getView().kind).toBe('set_complete');
    const [record] = setEvents(engine.drainEvents());
    expect(record.completedReps).toBe(20);
  });

  it('holds both sides for unilateral exercises', () => {
    const { clock, engine } = start('unilateral');
    engine.drainEvents();
    clock.advance(SET_START_DELAY + 22);
    const switching = engine.sync();
    expect(switching.switchingSides).toBe(true);
    expect(switching.side).toBe('left');
    clock.advance(21 + 0.1);
    engine.sync();
    expect(engine.getView().kind).toBe('set_complete');
    const [record] = setEvents(engine.drainEvents());
    expect(record.leftReps).toBe(20);
    expect(record.rightReps).toBe(20);
  });

  it('adjusts hold targets by the progression step', () => {
    const { engine } = start('bilateral');
    engine.addRep();
    expect(engine.getView().actualTarget).toBe(25);
  });
});

describe('hold progression', () => {
  it('adds the progression step instead of one', () => {
    const result = evaluateProgression({
      sets: 2,
      minReps: 15,
      maxReps: 45,
      targetRirMin: 1,
      targetRirMax: 2,
      currentTargets: [20, 20],
      completedReps: [20, 20],
      previousCompletedReps: [],
      rating: 'good',
      rir: 2,
      formQuality: 'good',
      targetReduced: false,
      resistanceLabel: 'Bodyweight',
      step: 5,
    });
    expect(result.nextTargets).toEqual([25, 25]);
  });
});
