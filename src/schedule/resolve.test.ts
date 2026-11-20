import { describe, expect, it } from 'vitest';
import { defaultRoutine } from '@/database/seed';
import { resolveDay, resolveRoutine, type ScheduleProgram, type ScheduleSession } from '@/schedule/resolve';
import type { Routine } from '@/types';

const programs: ScheduleProgram[] = [
  { id: 'a', name: 'Push', order: 0 },
  { id: 'b', name: 'Pull', order: 1 },
  { id: 'c', name: 'Legs', order: 2 },
];

function routine(patch: Partial<Routine>): Routine {
  return { ...defaultRoutine(), ...patch, id: patch.id ?? 'r' };
}

function session(programId: string, when: Date): ScheduleSession {
  return { programId, startedAt: when.toISOString(), status: 'completed' };
}

const monday = new Date(2026, 10, 16, 12, 0, 0);
const tuesday = new Date(2026, 10, 17, 12, 0, 0);
const wednesday = new Date(2026, 10, 18, 12, 0, 0);

describe('routine resolver', () => {
  it('uses Monday 16 Nov 2026 as the fixture day', () => {
    expect(monday.getDay()).toBe(1);
  });

  it('rotates after the last session and does not make up a missed day', () => {
    const row = routine({ mode: 'rotation', programIds: ['a', 'b'] });
    expect(resolveRoutine({ routine: row, programs, sessions: [], now: monday }).programId).toBe('a');
    const after = resolveRoutine({
      routine: row,
      programs,
      sessions: [session('a', monday)],
      now: wednesday,
    });
    expect(after.programId).toBe('b');
    expect(after.status).toBe('due');
    expect(after.detail).toBe('Next in the rotation');
  });

  it('keeps weekday assignments on the calendar', () => {
    const row = routine({
      mode: 'weekdays',
      weekdays: [null, 'a', null, 'b', null, null, null],
    });
    const due = resolveRoutine({ routine: row, programs, sessions: [], now: monday });
    expect(due).toMatchObject({ status: 'due', programId: 'a', detail: 'Set for Monday' });
    const rest = resolveRoutine({ routine: row, programs, sessions: [], now: tuesday });
    expect(rest.status).toBe('rest');
    expect(rest.detail).toBe('Rest day');
    expect(rest.programId).toBe('a');
  });

  it('follows a shift on the calendar, and holds a missed day when asked', () => {
    const calendar = routine({
      mode: 'shift',
      programIds: ['a', 'b', 'c'],
      shift: ['a', 'b', null],
      anchorDate: '2026-11-16',
      skipMissed: false,
    });
    expect(resolveRoutine({ routine: calendar, programs, sessions: [], now: monday }).programId).toBe('a');
    expect(resolveRoutine({ routine: calendar, programs, sessions: [], now: tuesday }).programId).toBe('b');
    expect(resolveRoutine({ routine: calendar, programs, sessions: [], now: wednesday }).status).toBe('rest');

    const sliding = routine({ ...calendar, skipMissed: true });
    const held = resolveRoutine({ routine: sliding, programs, sessions: [], now: tuesday });
    expect(held.programId).toBe('a');
    expect(held.detail).toBe('Next in the shift');
    const advanced = resolveRoutine({
      routine: sliding,
      programs,
      sessions: [session('a', tuesday)],
      now: wednesday,
    });
    expect(advanced.programId).toBe('b');
  });

  it('counts distinct days toward a weekly target', () => {
    const row = routine({ mode: 'weekly_count', programIds: ['a', 'b'], weeklyCount: 2 });
    expect(resolveRoutine({ routine: row, programs, sessions: [], now: monday }).detail).toBe('0 of 2 days this week');
    const once = resolveRoutine({
      routine: row,
      programs,
      sessions: [session('a', monday), session('a', monday)],
      now: tuesday,
    });
    expect(once.status).toBe('due');
    expect(once.detail).toBe('1 of 2 days this week');
    const done = resolveRoutine({
      routine: row,
      programs,
      sessions: [session('a', monday), session('b', tuesday)],
      now: wednesday,
    });
    expect(done.status).toBe('done');
    expect(done.programId).toBe('a');
  });

  it('shows morning and night together, ordered by reminder time', () => {
    const morning = routine({
      id: 'am',
      name: 'Morning',
      mode: 'weekdays',
      weekdays: [null, 'a', 'a', 'a', 'a', 'a', null],
      reminderHour: 7,
      reminderMinute: 0,
      order: 1,
    });
    const night = routine({
      id: 'pm',
      name: 'Night',
      mode: 'rotation',
      programIds: ['b', 'c'],
      reminderHour: 20,
      reminderMinute: 30,
      order: 0,
    });
    const plans = resolveDay({ routines: [night, morning], programs, sessions: [], now: monday });
    expect(plans.map((plan) => plan.routine.name)).toEqual(['Morning', 'Night']);
    expect(plans.every((plan) => plan.status === 'due')).toBe(true);
  });
});
