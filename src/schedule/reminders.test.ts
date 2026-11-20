import { describe, expect, it } from 'vitest';
import { defaultRoutine } from '@/database/seed';
import { upcomingReminders } from '@/schedule/reminders';
import type { ScheduleProgram, ScheduleSession } from '@/schedule/resolve';
import type { Routine } from '@/types';

const programs: ScheduleProgram[] = [
  { id: 'a', name: 'Push', order: 0 },
  { id: 'b', name: 'Pull', order: 1 },
];

function routine(patch: Partial<Routine>): Routine {
  return { ...defaultRoutine(), reminderEnabled: true, ...patch, id: patch.id ?? 'r' };
}

describe('reminders', () => {
  it('rings on assigned weekdays only', () => {
    const row = routine({
      name: 'Morning',
      mode: 'weekdays',
      weekdays: [null, 'a', null, null, null, null, null],
      reminderHour: 7,
      reminderMinute: 30,
    });
    const friday = new Date(2026, 10, 20, 12, 0, 0);
    const alerts = upcomingReminders({ routines: [row], programs, sessions: [], now: friday });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].at.getDay()).toBe(1);
    expect(alerts[0].title).toBe('Morning');
    expect(alerts[0].body).toBe('Push is up.');
  });

  it('stays quiet for the rest of a finished week', () => {
    const monday = new Date(2026, 10, 16, 6, 0, 0);
    const sessions: ScheduleSession[] = [
      { programId: 'a', startedAt: new Date(2026, 10, 16, 5, 0, 0).toISOString(), status: 'completed' },
    ];
    const row = routine({ mode: 'weekly_count', weeklyCount: 1, programIds: ['a'], reminderHour: 7, reminderMinute: 30 });
    const alerts = upcomingReminders({ routines: [row], programs, sessions, now: monday });
    expect(alerts).toHaveLength(0);
  });

  it('reminds every day for a rotation', () => {
    const monday = new Date(2026, 10, 16, 6, 0, 0);
    const row = routine({ mode: 'rotation', programIds: ['a', 'b'], reminderHour: 7, reminderMinute: 0 });
    const alerts = upcomingReminders({ routines: [row], programs, sessions: [], now: monday });
    expect(alerts).toHaveLength(7);
    expect(alerts[0].at.getHours()).toBe(7);
  });
});
