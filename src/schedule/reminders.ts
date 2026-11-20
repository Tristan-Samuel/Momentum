import type { Routine } from '@/types';
import { resolveRoutine, type ScheduleProgram, type ScheduleSession } from '@/schedule/resolve';

export type ScheduledReminder = {
  title: string;
  body: string;
  at: Date;
};

/** The next week of reminders that are actually due. Rest days and a finished weekly count stay quiet. */
export function upcomingReminders(input: {
  routines: Routine[];
  programs: ScheduleProgram[];
  sessions: ScheduleSession[];
  now: Date;
  days?: number;
}): ScheduledReminder[] {
  const span = input.days ?? 7;
  const names = new Map(input.programs.map((program) => [program.id, program.name]));
  const alerts: ScheduledReminder[] = [];
  for (const routine of input.routines) {
    if (!routine.enabled || !routine.reminderEnabled) continue;
    for (let offset = 0; offset < span; offset += 1) {
      const at = new Date(input.now);
      at.setDate(at.getDate() + offset);
      at.setHours(routine.reminderHour, routine.reminderMinute, 0, 0);
      if (at.getTime() <= input.now.getTime()) continue;
      const resolved = resolveRoutine({
        routine,
        programs: input.programs,
        sessions: input.sessions,
        now: at,
      });
      if (resolved.status !== 'due' || !resolved.programId) continue;
      const name = names.get(resolved.programId);
      alerts.push({
        title: routine.name,
        body: name ? `${name} is up.` : 'Time to train.',
        at,
      });
    }
  }
  return alerts.sort((a, b) => a.at.getTime() - b.at.getTime());
}
