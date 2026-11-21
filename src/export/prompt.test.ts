import { describe, expect, it } from 'vitest';
import type { BackupEnvelope } from '@/database/backup';
import { buildAiPrompt } from '@/export/prompt';

function envelope(patch: Partial<BackupEnvelope['tables']> = {}): BackupEnvelope {
  return {
    format: 'momentum-backup',
    version: 1,
    exportedAt: '2026-11-20T12:00:00.000Z',
    tables: {
      workoutPrograms: [],
      exercises: [],
      exerciseConfigurations: [],
      progressionStates: [],
      workoutSessions: [],
      exerciseSessions: [],
      setSessions: [],
      personalRecords: [],
      appSettings: [{ id: 'app', weeklyGoal: 4, theme: 'dark', volume: 0.2 }],
      routines: [],
      ...patch,
    },
  };
}

describe('AI prompt export', () => {
  it('writes programs, sessions, and records for another model', () => {
    const text = buildAiPrompt(
      envelope({
        workoutPrograms: [{ id: 'p', name: 'Pull', order: 0 }],
        exercises: [{ id: 'e', name: 'Pull-Up' }],
        exerciseConfigurations: [
          {
            id: 'c',
            programId: 'p',
            exerciseId: 'e',
            order: 0,
            sets: 2,
            minReps: 6,
            maxReps: 12,
            measure: 'reps',
            tempo: { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 },
            startPosition: 'bottom',
            restAfterSetSeconds: 150,
            transitionAfterExerciseSeconds: 30,
            targetRirMin: 1,
            targetRirMax: 2,
            laterality: 'bilateral',
            resistanceLabel: 'Bodyweight',
          },
        ],
        progressionStates: [
          {
            exerciseId: 'e',
            currentTargets: [8, 8],
            lastCompletedReps: [8, 7],
            lastRir: 2,
            lastDifficultyRating: 'good',
            lastFormQuality: 'good',
            recommendedNextTargets: [8, 8],
            recommendedResistanceChange: { type: 'hold', suggestion: 'Stay at bodyweight.' },
            personalBestReps: 10,
            personalBestDate: '2026-11-01T15:00:00.000Z',
            lifetimeReps: 40,
            lifetimeSets: 6,
          },
        ],
        workoutSessions: [
          {
            id: 's',
            programNameSnapshot: 'Pull',
            status: 'completed',
            startedAt: '2026-11-18T14:02:00.000Z',
            durationMs: 28 * 60 * 1000,
          },
          { id: 'gone', status: 'discarded', startedAt: '2026-11-19T00:00:00.000Z', programNameSnapshot: 'Secret' },
        ],
        exerciseSessions: [
          {
            id: 'es',
            workoutSessionId: 's',
            order: 0,
            nameSnapshot: 'Pull-Up',
            targetRepsPerSet: [8, 8],
            difficultyRating: 'good',
            rir: 2,
            formQuality: 'good',
            configSnapshot: {
              sets: 2,
              minReps: 6,
              maxReps: 12,
              tempo: { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 },
              startPosition: 'bottom',
              restAfterSetSeconds: 150,
              transitionAfterExerciseSeconds: 30,
              targetRirMin: 1,
              targetRirMax: 2,
              laterality: 'bilateral',
              resistanceLabel: 'Bodyweight',
            },
          },
        ],
        setSessions: [
          {
            exerciseSessionId: 'es',
            setIndex: 0,
            completedReps: 8,
            actualTarget: 8,
            prescribedTarget: 8,
            skipped: false,
            restSecondsPlanned: 150,
            restSecondsActual: 140,
          },
          {
            exerciseSessionId: 'es',
            setIndex: 1,
            completedReps: 0,
            actualTarget: 8,
            prescribedTarget: 8,
            skipped: true,
          },
        ],
        personalRecords: [
          {
            exerciseId: 'e',
            kind: 'best_set_reps',
            value: 10,
            resistanceLabel: 'Bodyweight',
            achievedAt: '2026-11-01T15:00:00.000Z',
          },
        ],
      }),
    );

    expect(text).toContain('Answer only from this log');
    expect(text).toContain('Weekly goal: 4 completed workouts');
    expect(text).not.toContain('dark');
    expect(text).toContain('Pull-Up (Bodyweight)');
    expect(text).toContain('starts at the bottom');
    expect(text).toContain('Today 8, 8');
    expect(text).toContain('Stay at bodyweight.');
    expect(text).toContain('2026-11-18 14:02 UTC — Pull — completed — 28m');
    expect(text).toContain('Set 1: 8 (target 8), rest 140s of 150s');
    expect(text).toContain('Set 2: skipped');
    expect(text).toContain('rating good, RIR 2, form good');
    expect(text).toContain('Pull-Up: best set 10 reps, Bodyweight');
    expect(text).not.toContain('Secret');
  });

  it('keeps left and right reps for one-sided work', () => {
    const text = buildAiPrompt(
      envelope({
        workoutSessions: [{ id: 's', status: 'aborted', startedAt: '2026-11-18T14:02:00.000Z', programNameSnapshot: 'Legs' }],
        exerciseSessions: [{ id: 'es', workoutSessionId: 's', order: 0, nameSnapshot: 'Pistol Squat', targetRepsPerSet: [5] }],
        setSessions: [
          {
            exerciseSessionId: 'es',
            setIndex: 0,
            completedReps: 4,
            leftReps: 4,
            rightReps: 5,
            actualTarget: 5,
            prescribedTarget: 6,
            targetReduced: true,
            skipped: false,
          },
        ],
      }),
    );
    expect(text).toContain('aborted');
    expect(text).toContain('Set 1: left 4, right 5 (target 5, target reduced from 6)');
    expect(text).toContain('No routines.');
  });

  it('includes the schedule, how the app works, and the exercise settings', () => {
    const text = buildAiPrompt(
      envelope({
        appSettings: [{ id: 'app', weeklyGoal: 4, theme: 'dark', weightUnit: 'kg' }],
        workoutPrograms: [
          { id: 'p', name: 'Pull', order: 0 },
          { id: 'l', name: 'Legs', order: 1 },
        ],
        exercises: [{ id: 'e', name: 'Squat' }],
        exerciseConfigurations: [
          {
            id: 'c',
            programId: 'l',
            exerciseId: 'e',
            order: 0,
            sets: 3,
            minReps: 5,
            maxReps: 8,
            measure: 'reps',
            tempo: { eccentric: 3, bottomPause: 1, concentric: 1, topPause: 0 },
            startPosition: 'top',
            restAfterSetSeconds: 180,
            transitionAfterExerciseSeconds: 30,
            targetRirMin: 1,
            targetRirMax: 2,
            laterality: 'bilateral',
            cueMode: 'open',
            loadKind: 'external',
            load: 100,
            loadUnit: 'kg',
            loadStep: 2.5,
            loadPer: 'total',
            progressionStep: 1,
            resistanceLabel: '100 kg',
          },
        ],
        routines: [
          {
            id: 'morning',
            name: 'Morning',
            order: 0,
            enabled: true,
            mode: 'weekdays',
            programIds: [],
            weekdays: [null, 'p', 'p', null, 'p', null, null],
            shift: [],
            anchorDate: '2026-01-01',
            skipMissed: false,
            weeklyCount: 3,
            reminderEnabled: true,
            reminderHour: 6,
            reminderMinute: 15,
          },
          {
            id: 'night',
            name: 'Night',
            order: 1,
            enabled: false,
            mode: 'shift',
            programIds: ['p'],
            weekdays: [null, null, null, null, null, null, null],
            shift: ['p', null],
            anchorDate: '2026-11-16',
            skipMissed: true,
            weeklyCount: 3,
            reminderEnabled: false,
            reminderHour: 18,
            reminderMinute: 0,
          },
        ],
      }),
    );

    expect(text).toContain('A question is not limited to one program.');
    expect(text).toContain('# How the app works');
    expect(text).toContain('Rest is only the timer between sets');
    expect(text).toContain('Per week: no fixed days.');
    expect(text).toContain('# Adding an exercise');
    expect(text).toContain('sets: 1 to 10');
    expect(text).toContain('cueMode, reps only');
    expect(text).toContain('loadKind: "bodyweight", "added", or "external"');
    expect(text).toContain('This person’s new exercises use kg');
    expect(text).toContain('default step is 2.5 kg');
    expect(text).not.toContain('dark');
    expect(text).toContain('## Morning — on — Days');
    expect(text).toContain(
      'Days: Sunday rest, Monday Pull, Tuesday Pull, Wednesday rest, Thursday Pull, Friday rest, Saturday rest.',
    );
    expect(text).toContain('Reminder 6:15 am.');
    expect(text).toContain('## Night — off — Shift');
    expect(text).toContain('Pattern: Pull, rest. Starts 2026-11-16. A missed training day stays next until it is done.');
    expect(text).toContain('Reminder off (6:00 pm is saved).');
    expect(text).toContain('Home skips this routine.');
    expect(text).toContain('Squat (100 kg)');
    expect(text).toContain('open set');
    expect(text).toContain('external load 100 kg');
    expect(text).toContain('load step 2.5 kg');
    expect(text).toContain('progression step 1');

    const night = text.slice(text.indexOf('## Night'), text.indexOf('# Programs'));
    expect(night).not.toContain('Today:');
    const day = new Date('2026-11-20T12:00:00.000Z').getDay();
    const training = [null, 'p', 'p', null, 'p', null, null][day];
    expect(text).toContain(training ? 'Today: Pull. Set for' : 'Today: rest. Rest day.');
  });
});
