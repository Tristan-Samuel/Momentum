import { afterEach, expect, it } from 'vitest';
import { buildCoachContext } from '@/coach/context';
import { db } from '@/database/db';
import { createProgram, ensureSeeded, updateRoutine } from '@/database/repository';
import { ROUTINE_ID } from '@/database/seed';

afterEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('sends every program and the AI export to the coach', async () => {
  await ensureSeeded();
  const legs = await createProgram('Legs');
  await updateRoutine(ROUTINE_ID, {
    name: 'Morning',
    mode: 'rotation',
    programIds: [],
    reminderEnabled: true,
    reminderHour: 6,
    reminderMinute: 15,
  });

  const context = await buildCoachContext(null, null);

  expect(context.focusProgramId).toBeNull();
  expect(context.focusExerciseConfigId).toBeNull();
  expect(context.programs.map((program) => program.name)).toEqual(['Minimalist Strength', 'Legs']);
  expect(context.programs[1].id).toBe(legs.id);
  expect(context.programs[0].exercises.length).toBeGreaterThan(0);
  expect(context.brief).toContain('# How the app works');
  expect(context.brief).toContain('# Adding an exercise');
  expect(context.brief).toContain('sets: 1 to 10');
  expect(context.brief).toContain('# Schedule');
  expect(context.brief).toContain('## Morning — on — Rotation');
  expect(context.brief).toContain('Programs: every program, in order (Minimalist Strength, Legs).');
  expect(context.brief).toContain('Reminder 6:15 am.');
  expect(context.brief).toContain('## Legs');
  expect(context.brief).toContain('## Minimalist Strength');
});
