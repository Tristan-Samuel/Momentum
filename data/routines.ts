import type { NoteTag, ReminderConfig, RoutineDefinition, RoutineId } from '../types/routine';

export const NOTE_TAGS: NoteTag[] = ['difficult', 'easy', 'tired'];

export const DEFAULT_REMINDERS: ReminderConfig[] = [
  {
    id: 'morning-reminder',
    title: 'Momentum morning routine',
    body: 'Warm up and start your day with your guided routine.',
    hour: 7,
    minute: 0,
  },
  {
    id: 'night-reminder',
    title: 'Momentum night routine',
    body: 'Wind down and finish the day with your evening reset.',
    hour: 21,
    minute: 0,
  },
];

export const ROUTINES: Record<RoutineId, RoutineDefinition> = {
  morning: {
    id: 'morning',
    title: 'Morning routine',
    description: 'Open the app, complete each movement, and keep your momentum.',
    sections: [
      {
        id: 'warmup',
        title: 'Warmup',
        exercises: [
          { id: 'arm-circles', title: 'Arm circles', baseTarget: 10, incrementPerWeek: 0, unit: 'reps' },
          { id: 'shoulder-rolls', title: 'Shoulder rolls', baseTarget: 10, incrementPerWeek: 0, unit: 'reps' },
          { id: 'body-twists', title: 'Body twists', baseTarget: 10, incrementPerWeek: 0, unit: 'reps' },
        ],
      },
      {
        id: 'round-1',
        title: 'Round 1',
        exercises: [
          { id: 'pull-ups-round-1', title: 'Pull-ups', baseTarget: 6, incrementPerWeek: 1, unit: 'reps' },
          { id: 'push-ups-round-1', title: 'Push-ups', baseTarget: 15, incrementPerWeek: 2, unit: 'reps' },
          { id: 'squats-round-1', title: 'Squats', baseTarget: 20, incrementPerWeek: 3, unit: 'reps' },
          { id: 'plank-round-1', title: 'Plank', baseTarget: 30, incrementPerWeek: 10, unit: 'seconds' },
        ],
      },
      {
        id: 'round-2',
        title: 'Round 2',
        exercises: [
          { id: 'pull-ups-round-2', title: 'Pull-ups', baseTarget: 6, incrementPerWeek: 1, unit: 'reps' },
          { id: 'push-ups-round-2', title: 'Push-ups', baseTarget: 15, incrementPerWeek: 2, unit: 'reps' },
          { id: 'squats-round-2', title: 'Squats', baseTarget: 20, incrementPerWeek: 3, unit: 'reps' },
          { id: 'plank-round-2', title: 'Plank', baseTarget: 30, incrementPerWeek: 10, unit: 'seconds' },
        ],
      },
      {
        id: 'finish',
        title: 'Finish',
        exercises: [
          { id: 'dead-hang-finish', title: 'Dead hang', baseTarget: 30, incrementPerWeek: 0, unit: 'seconds' },
        ],
      },
    ],
  },
  night: {
    id: 'night',
    title: 'Night routine',
    description: 'Reset your posture and recover before the next morning.',
    sections: [
      {
        id: 'night-reset',
        title: 'Night reset',
        exercises: [
          { id: 'dead-hang-night', title: 'Dead hang', baseTarget: 30, incrementPerWeek: 0, unit: 'seconds' },
          { id: 'side-plank-left', title: 'Side plank (left)', baseTarget: 20, incrementPerWeek: 0, unit: 'seconds' },
          { id: 'side-plank-right', title: 'Side plank (right)', baseTarget: 20, incrementPerWeek: 0, unit: 'seconds' },
          { id: 'child-pose', title: 'Child pose', baseTarget: 30, incrementPerWeek: 0, unit: 'seconds' },
          { id: 'hamstring-left', title: 'Hamstring stretch (left)', baseTarget: 20, incrementPerWeek: 0, unit: 'seconds' },
          { id: 'hamstring-right', title: 'Hamstring stretch (right)', baseTarget: 20, incrementPerWeek: 0, unit: 'seconds' },
          { id: 'cat-cow', title: 'Cat-cow', baseTarget: 8, incrementPerWeek: 0, unit: 'reps' },
        ],
      },
    ],
  },
};
