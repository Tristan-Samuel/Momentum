import type { Routine, RoutineMode } from '@/types';
import { dayKey, startOfWeek } from '@/utils/streak';

export type ScheduleProgram = {
  id: string;
  name: string;
  order: number;
};

export type ScheduleSession = {
  programId: string;
  startedAt: string;
  status: string;
};

export type RoutineStatus = 'due' | 'rest' | 'done';

export type ResolvedRoutine = {
  routine: Routine;
  status: RoutineStatus;
  programId: string | null;
  detail: string;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffDays(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function counts(session: ScheduleSession): boolean {
  return session.status === 'completed' || session.status === 'aborted';
}

export function programsForRoutine(routine: Routine, programs: ScheduleProgram[]): ScheduleProgram[] {
  const ordered = [...programs].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  if (routine.programIds.length === 0) return ordered;
  const byId = new Map(ordered.map((program) => [program.id, program]));
  return routine.programIds.flatMap((id) => {
    const program = byId.get(id);
    return program ? [program] : [];
  });
}

function nextInRotation(list: ScheduleProgram[], sessions: ScheduleSession[]): string | null {
  if (list.length === 0) return null;
  const ids = new Set(list.map((program) => program.id));
  const done = sessions
    .filter((session) => counts(session) && ids.has(session.programId))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const last = done.at(-1);
  if (!last) return list[0].id;
  const index = list.findIndex((program) => program.id === last.programId);
  if (index < 0) return list[0].id;
  return list[(index + 1) % list.length].id;
}

function daysThisWeek(list: ScheduleProgram[], sessions: ScheduleSession[], now: Date): number {
  const start = startOfWeek(now).getTime();
  const end = addDays(startOfWeek(now), 7).getTime();
  const ids = new Set(list.map((program) => program.id));
  const days = new Set<string>();
  for (const session of sessions) {
    if (!counts(session) || !ids.has(session.programId)) continue;
    const time = new Date(session.startedAt).getTime();
    if (Number.isNaN(time) || time < start || time >= end) continue;
    days.add(dayKey(new Date(session.startedAt)));
  }
  return days.size;
}

function knownId(id: string | null, programs: ScheduleProgram[]): string | null {
  if (!id) return null;
  return programs.some((program) => program.id === id) ? id : null;
}

function shiftSlot(
  routine: Routine,
  list: ScheduleProgram[],
  sessions: ScheduleSession[],
  now: Date,
): { programId: string | null; rest: boolean } {
  const known = new Set(list.map((program) => program.id));
  const source = routine.shift.length > 0 ? routine.shift : list.map((program) => program.id);
  const pattern = source.map((id) => (id && known.has(id) ? id : null));
  if (!pattern.some((id) => id !== null)) return { programId: null, rest: true };
  const anchor = parseDay(routine.anchorDate) ?? startOfDay(now);
  const today = startOfDay(now);
  if (!routine.skipMissed || today < anchor) {
    const days = Math.max(0, diffDays(anchor, today));
    const slot = pattern[days % pattern.length];
    return slot ? { programId: slot, rest: false } : { programId: null, rest: true };
  }
  const trained = new Set(sessions.filter(counts).map((session) => dayKey(new Date(session.startedAt))));
  let index = 0;
  for (let cursor = anchor; cursor < today; cursor = addDays(cursor, 1)) {
    const slot = pattern[index % pattern.length];
    if (slot == null || trained.has(dayKey(cursor))) index += 1;
  }
  const slot = pattern[index % pattern.length];
  return slot ? { programId: slot, rest: false } : { programId: null, rest: true };
}

export function resolveRoutine(input: {
  routine: Routine;
  programs: ScheduleProgram[];
  sessions: ScheduleSession[];
  now: Date;
}): ResolvedRoutine {
  const { routine, programs, sessions, now } = input;
  const list = programsForRoutine(routine, programs);
  const rotation = nextInRotation(list.length > 0 ? list : programs, sessions);
  const base = { routine, programId: rotation };

  if (routine.mode === 'weekdays') {
    const assigned = knownId(routine.weekdays[now.getDay()] ?? null, programs);
    if (!assigned) return { ...base, status: 'rest', detail: 'Rest day' };
    return { routine, status: 'due', programId: assigned, detail: `Set for ${DAY_NAMES[now.getDay()]}` };
  }

  if (routine.mode === 'shift') {
    const slot = shiftSlot(routine, list.length > 0 ? list : programs, sessions, now);
    if (slot.rest || !slot.programId) return { ...base, status: 'rest', detail: 'Rest day' };
    return {
      routine,
      status: 'due',
      programId: slot.programId,
      detail: routine.skipMissed ? 'Next in the shift' : 'On the shift',
    };
  }

  if (routine.mode === 'weekly_count') {
    const goal = Math.max(1, Math.min(7, Math.round(routine.weeklyCount || 1)));
    const done = daysThisWeek(list, sessions, now);
    if (done >= goal) return { ...base, status: 'done', detail: 'Done for the week' };
    return { ...base, status: 'due', detail: `${done} of ${goal} days this week` };
  }

  return { ...base, status: 'due', detail: 'Next in the rotation' };
}

export function resolveDay(input: {
  routines: Routine[];
  programs: ScheduleProgram[];
  sessions: ScheduleSession[];
  now: Date;
}): ResolvedRoutine[] {
  return input.routines
    .filter((routine) => routine.enabled)
    .map((routine) => resolveRoutine({ ...input, routine }))
    .sort((a, b) => {
      const time = a.routine.reminderHour * 60 + a.routine.reminderMinute - (b.routine.reminderHour * 60 + b.routine.reminderMinute);
      return time || a.routine.order - b.routine.order;
    });
}

export function modeLabel(mode: RoutineMode): string {
  if (mode === 'weekdays') return 'Days';
  if (mode === 'shift') return 'Shift';
  if (mode === 'weekly_count') return 'Per week';
  return 'Rotation';
}
