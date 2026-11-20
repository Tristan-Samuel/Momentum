import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import { Switch } from '@/components/ui/Switch';
import { createRoutine, deleteRoutine, listPrograms, listRoutines, updateRoutine } from '@/database/repository';
import { programsForRoutine } from '@/schedule/resolve';
import { dayKey } from '@/utils/streak';
import type { Routine, RoutineMode, WorkoutProgram } from '@/types';

const MODES: Array<{ value: RoutineMode; label: string }> = [
  { value: 'rotation', label: 'Rotation' },
  { value: 'weekdays', label: 'Days' },
  { value: 'shift', label: 'Shift' },
  { value: 'weekly_count', label: 'Per week' },
];

const WEEKDAYS = [
  { index: 1, label: 'Monday' },
  { index: 2, label: 'Tuesday' },
  { index: 3, label: 'Wednesday' },
  { index: 4, label: 'Thursday' },
  { index: 5, label: 'Friday' },
  { index: 6, label: 'Saturday' },
  { index: 0, label: 'Sunday' },
];

function timeValue(routine: Routine): string {
  return `${String(routine.reminderHour).padStart(2, '0')}:${String(routine.reminderMinute).padStart(2, '0')}`;
}

export function ScheduleScreen() {
  const routines = useLiveQuery(() => listRoutines(), []);
  const programs = useLiveQuery(() => listPrograms(), []);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (!routines || !programs) return <p className="text-[var(--muted)]">Loading…</p>;

  const add = (name: string, patch: Partial<Routine> = {}) => {
    void createRoutine(name, patch);
  };

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">SCHEDULE</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Routines</h1>
      <p className="mt-3 text-[var(--muted)]">
        Each routine has its own days and its own time. Morning and night are just two routines.
        Reminders ring on the iPhone app. A computer can change the time, and the phone picks it up
        the next time it syncs.
      </p>

      <div className="mt-8 space-y-4">
        {routines.map((routine, index) => (
          <RoutineEditor
            key={routine.id}
            routine={routine}
            programs={programs}
            canMoveUp={index > 0}
            canMoveDown={index < routines.length - 1}
            onMove={(direction) => {
              const swap = routines[index + direction];
              if (!swap) return;
              void updateRoutine(routine.id, { order: swap.order });
              void updateRoutine(swap.id, { order: routine.order });
            }}
            onDelete={() => setConfirmId(routine.id)}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
          onClick={() => add('Morning', { reminderHour: 7, reminderMinute: 30 })}
        >
          Morning
        </button>
        <button
          type="button"
          className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
          onClick={() => add('Night', { reminderHour: 20, reminderMinute: 0 })}
        >
          Night
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--accent)]"
          onClick={() => add(`Routine ${routines.length + 1}`)}
        >
          <Icon name="plus" size={16} /> Add routine
        </button>
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        eyebrow="ROUTINE"
        title="Remove this routine?"
        body="The programs stay. Only this schedule is removed."
        confirmLabel="Remove"
        danger
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) void deleteRoutine(confirmId);
          setConfirmId(null);
        }}
      />
    </main>
  );
}

function RoutineEditor({
  routine,
  programs,
  canMoveUp,
  canMoveDown,
  onMove,
  onDelete,
}: {
  routine: Routine;
  programs: WorkoutProgram[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const included = new Set(programsForRoutine(routine, programs.map((program) => ({
    id: program.id,
    name: program.name,
    order: program.order ?? 0,
  }))).map((program) => program.id));

  const setMode = (mode: RoutineMode) => {
    if (mode === 'shift' && routine.shift.length === 0) {
      const ids = routine.programIds.length > 0 ? routine.programIds : programs.map((program) => program.id);
      void updateRoutine(routine.id, { mode, shift: ids, anchorDate: dayKey(new Date()) });
      return;
    }
    void updateRoutine(routine.id, { mode });
  };

  const toggleProgram = (id: string) => {
    const next = new Set(included);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return;
    const ids = programs.filter((program) => next.has(program.id)).map((program) => program.id);
    void updateRoutine(routine.id, { programIds: ids.length === programs.length ? [] : ids });
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <label className="block min-w-0 flex-1 text-sm text-[var(--muted)]">
          Name
          <input
            key={routine.name}
            className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-xl text-[var(--fg)]"
            defaultValue={routine.name}
            onBlur={(event) => void updateRoutine(routine.id, { name: event.target.value.trim() || routine.name })}
          />
        </label>
        <div className="mt-7 flex gap-1">
          <button type="button" aria-label="Move routine up" disabled={!canMoveUp} onClick={() => onMove(-1)} className="rounded-full p-2 text-[var(--muted)] disabled:opacity-30">
            <Icon name="arrow-up" size={16} />
          </button>
          <button type="button" aria-label="Move routine down" disabled={!canMoveDown} onClick={() => onMove(1)} className="rounded-full p-2 text-[var(--muted)] disabled:opacity-30">
            <Icon name="arrow-down" size={16} />
          </button>
        </div>
      </div>

      <Switch
        label="Enabled"
        checked={routine.enabled}
        onChange={(enabled) => void updateRoutine(routine.id, { enabled })}
      />

      <div className="mt-3">
        <Segmented label="Schedule" value={routine.mode} options={MODES} onChange={setMode} />
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">{modeHelp(routine.mode)}</p>

      {routine.mode === 'rotation' || routine.mode === 'weekly_count' ? (
        <div className="mt-4">
          <SectionLabel>Programs</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {programs.map((program) => {
              const on = included.has(program.id);
              return (
                <button
                  key={program.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleProgram(program.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    on ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]' : 'border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  {program.name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {routine.programIds.length === 0
              ? 'Every program is included, including ones you add later.'
              : 'Only the selected programs, in this order.'}
          </p>
        </div>
      ) : null}

      {routine.mode === 'weekly_count' ? (
        <div className="mt-4">
          <Stepper
            label="Days this week"
            value={routine.weeklyCount}
            min={1}
            max={7}
            suffix={routine.weeklyCount === 1 ? 'day' : 'days'}
            onChange={(weeklyCount) => void updateRoutine(routine.id, { weeklyCount })}
          />
        </div>
      ) : null}

      {routine.mode === 'weekdays' ? (
        <div className="mt-4 space-y-2">
          {WEEKDAYS.map((day) => (
            <label key={day.index} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-[var(--muted)]">{day.label}</span>
              <select
                className="max-w-[14rem] flex-1 rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[var(--fg)]"
                value={routine.weekdays[day.index] ?? ''}
                onChange={(event) => {
                  const weekdays = routine.weekdays.length === 7 ? [...routine.weekdays] : [null, null, null, null, null, null, null];
                  weekdays[day.index] = event.target.value || null;
                  void updateRoutine(routine.id, { weekdays });
                }}
              >
                <option value="">Rest</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className="text-sm text-[var(--muted)]">Monday stays Monday. Skipping a day does not move the others.</p>
        </div>
      ) : null}

      {routine.mode === 'shift' ? (
        <ShiftEditor routine={routine} programs={programs} />
      ) : null}

      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <SectionLabel>Reminder</SectionLabel>
        <Switch
          label="Remind me"
          description="Rings on the iPhone app."
          checked={routine.reminderEnabled}
          onChange={(reminderEnabled) => void updateRoutine(routine.id, { reminderEnabled })}
        />
        <label className="mt-2 block text-sm text-[var(--muted)]">
          Time
          <input
            type="time"
            className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-lg text-[var(--fg)]"
            value={timeValue(routine)}
            onChange={(event) => {
              const [hour, minute] = event.target.value.split(':').map(Number);
              if (Number.isFinite(hour) && Number.isFinite(minute)) {
                void updateRoutine(routine.id, { reminderHour: hour, reminderMinute: minute });
              }
            }}
          />
        </label>
      </div>

      <button type="button" className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--muted)]" onClick={onDelete}>
        <Icon name="trash" size={16} /> Remove routine
      </button>
    </Card>
  );
}

function ShiftEditor({ routine, programs }: { routine: Routine; programs: WorkoutProgram[] }) {
  const pattern = routine.shift;
  const set = (shift: Array<string | null>) => void updateRoutine(routine.id, { shift });

  return (
    <div className="mt-4">
      <SectionLabel>Pattern</SectionLabel>
      <ol className="mt-2 space-y-2">
        {pattern.map((slot, index) => (
          <li key={`${index}-${slot ?? 'rest'}`} className="flex items-center gap-2">
            <span className="w-5 text-sm tabular-nums text-[var(--muted)]">{index + 1}</span>
            <select
              className="min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[var(--fg)]"
              value={slot ?? ''}
              onChange={(event) => {
                const next = [...pattern];
                next[index] = event.target.value || null;
                set(next);
              }}
            >
              <option value="">Rest</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
            <button type="button" aria-label="Move slot up" disabled={index === 0} className="text-[var(--muted)] disabled:opacity-30" onClick={() => {
              const next = [...pattern];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              set(next);
            }}>
              <Icon name="arrow-up" size={16} />
            </button>
            <button type="button" aria-label="Move slot down" disabled={index === pattern.length - 1} className="text-[var(--muted)] disabled:opacity-30" onClick={() => {
              const next = [...pattern];
              [next[index + 1], next[index]] = [next[index], next[index + 1]];
              set(next);
            }}>
              <Icon name="arrow-down" size={16} />
            </button>
            <button type="button" aria-label="Remove slot" className="text-[var(--muted)]" onClick={() => set(pattern.filter((_, item) => item !== index))}>
              <Icon name="trash" size={16} />
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]"
          onClick={() => set([...pattern, programs[0]?.id ?? null])}
        >
          Add day
        </button>
        <button
          type="button"
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]"
          onClick={() => set([...pattern, null])}
        >
          Add rest
        </button>
      </div>
      <div className="mt-2">
        <Switch
          label="Shift when I skip"
          description="A missed training day stays next until you do it. Off follows the calendar and skips that day."
          checked={routine.skipMissed}
          onChange={(skipMissed) => void updateRoutine(routine.id, { skipMissed })}
        />
      </div>
    </div>
  );
}

function modeHelp(mode: RoutineMode): string {
  if (mode === 'weekdays') return 'Pick a program for each day. Empty days are rest.';
  if (mode === 'shift') return 'A repeating pattern that is not locked to Monday.';
  if (mode === 'weekly_count') return 'Any days. The next program comes from the rotation until the count is met.';
  return 'Any day. The next program is the one after your last session. A missed day is not made up.';
}
