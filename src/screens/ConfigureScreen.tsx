import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import { usePreparedWorkout } from '@/hooks/usePreparedWorkout';
import * as repo from '@/database/repository';
import { formatTodayPlan, targetsForExercise, unitSuffix } from '@/utils/prescription';
import { formatTempo } from '@/utils/tempo';
import type {
  ExerciseConfiguration,
  Laterality,
  Measure,
  ProgramExercise,
  UnilateralOrder,
  WorkoutProgram,
} from '@/types';

export function ConfigureScreen() {
  const programs = useLiveQuery(() => repo.listPrograms(), []);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const selectedId =
    programs?.find((row) => row.id === chosenId)?.id ?? programs?.[0]?.id ?? null;
  const prepared = usePreparedWorkout(selectedId);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!prepared || !programs || prepared.program.id !== selectedId) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  const program = prepared.program;
  const index = programs.findIndex((row) => row.id === program.id);

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">PROGRAM</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Configuration</h1>

      <section className="mt-6">
        <SectionLabel
          action={
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-[var(--accent)]"
              onClick={() =>
                void repo.createProgram(`Day ${String.fromCharCode(65 + programs.length)}`).then((row) => {
                  setChosenId(row.id);
                  setOpenId(null);
                })
              }
            >
              <Icon name="plus" size={16} /> New program
            </button>
          }
        >
          Programs · rotate in this order
        </SectionLabel>
        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist">
          {programs.map((row: WorkoutProgram, i) => (
            <button
              key={row.id}
              type="button"
              role="tab"
              aria-selected={row.id === program.id}
              onClick={() => {
                setChosenId(row.id);
                setOpenId(null);
                setError(null);
              }}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
                row.id === program.id
                  ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                  : 'border-[var(--line)] text-[var(--muted)]'
              }`}
            >
              <span className="mr-1.5 tabular-nums opacity-60">{i + 1}</span>
              {row.name}
            </button>
          ))}
        </div>
      </section>

      <Card className="mt-4">
        <label className="block text-sm text-[var(--muted)]">
          Program name
          <input
            key={program.id}
            className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-xl text-[var(--fg)]"
            defaultValue={program.name}
            onBlur={(event) => void repo.updateProgramName(program.id, event.target.value.trim() || program.name)}
          />
        </label>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <IconButton
            label="Move earlier"
            icon="arrow-up"
            disabled={index <= 0}
            onClick={() => void movePrograms(programs, index, -1)}
          />
          <IconButton
            label="Move later"
            icon="arrow-down"
            disabled={index >= programs.length - 1}
            onClick={() => void movePrograms(programs, index, 1)}
          />
          <IconButton
            label="Duplicate"
            icon="copy"
            onClick={() =>
              void repo.duplicateProgram(program.id).then((row) => row && setChosenId(row.id))
            }
          />
          <IconButton
            label="Delete"
            icon="trash"
            disabled={programs.length <= 1}
            onClick={() => setConfirmDelete(true)}
          />
        </div>
        {error ? <p className="mt-3 text-sm text-[var(--warn)]">{error}</p> : null}
      </Card>

      <SectionLabel className="mt-8">
        {prepared.exercises.length} exercise{prepared.exercises.length === 1 ? '' : 's'}
      </SectionLabel>
      <div className="mt-3 space-y-3">
        {prepared.exercises.map((item, i) => (
          <ExerciseEditor
            key={item.id}
            item={item}
            open={openId === item.id}
            onToggle={() => setOpenId(openId === item.id ? null : item.id)}
            first={i === 0}
            last={i === prepared.exercises.length - 1}
          />
        ))}
      </div>
      {adding ? (
        <AddExerciseForm programId={program.id} onDone={() => setAdding(false)} />
      ) : (
        <Button
          className="mt-4 flex w-full items-center justify-center gap-2"
          variant="ghost"
          onClick={() => setAdding(true)}
        >
          <Icon name="plus" size={18} /> Add exercise
        </Button>
      )}
      <Glossary />
      <ConfirmDialog
        open={confirmDelete}
        eyebrow="DELETE PROGRAM"
        title={`Delete ${program.name}?`}
        body="Its exercises leave the rotation. Past workouts stay in History and Progress."
        confirmLabel="Delete program"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void repo
            .deleteProgram(program.id)
            .then(() => setChosenId(null))
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not delete.'));
        }}
      />
    </main>
  );
}

async function movePrograms(programs: WorkoutProgram[], index: number, direction: -1 | 1) {
  const ids = programs.map((row) => row.id);
  const target = index + direction;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  await repo.reorderPrograms(ids);
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: 'arrow-up' | 'arrow-down' | 'copy' | 'trash';
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--line)] py-2.5 text-xs text-[var(--muted)] disabled:opacity-30"
    >
      <Icon name={icon} size={18} className="text-[var(--fg)]" />
      {label}
    </button>
  );
}

function ExerciseEditor({
  item,
  open,
  onToggle,
  first,
  last,
}: {
  item: ProgramExercise;
  open: boolean;
  onToggle: () => void;
  first: boolean;
  last: boolean;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const patch = (partial: Partial<ExerciseConfiguration>) =>
    repo.updateExerciseConfiguration(item.id, partial);
  const today = targetsForExercise(item);
  const hold = item.measure === 'seconds';
  const unit = hold ? 'sec' : undefined;
  const step = hold ? 5 : 1;

  return (
    <section className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex items-stretch">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
        >
          <Icon
            name="chevron-down"
            size={18}
            className={`shrink-0 text-[var(--muted)] transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-lg font-semibold">
              <span className="truncate">{item.exercise.name}</span>
              {hold ? <Icon name="timer" size={15} className="shrink-0 text-[var(--accent)]" /> : null}
            </span>
            <span className="block truncate text-sm text-[var(--muted)]">{formatTodayPlan(item)}</span>
          </span>
        </button>
        <div className="flex flex-col justify-center border-l border-[var(--line)]">
          <button
            type="button"
            aria-label={`Move ${item.exercise.name} up`}
            disabled={first}
            onClick={() => void repo.moveExercise(item.id, -1)}
            className="flex-1 px-3 text-[var(--muted)] disabled:opacity-25"
          >
            <Icon name="arrow-up" size={16} />
          </button>
          <button
            type="button"
            aria-label={`Move ${item.exercise.name} down`}
            disabled={last}
            onClick={() => void repo.moveExercise(item.id, 1)}
            className="flex-1 border-t border-[var(--line)] px-3 text-[var(--muted)] disabled:opacity-25"
          >
            <Icon name="arrow-down" size={16} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="animate-fade-up border-t border-[var(--line)] p-4">
          <label className="block text-sm text-[var(--muted)]">
            Name
            <input
              className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3 text-lg text-[var(--fg)]"
              defaultValue={item.exercise.name}
              onBlur={(event) =>
                void repo.updateExerciseName(item.exerciseId, event.target.value.trim() || item.exercise.name)
              }
            />
          </label>

          <div className="mt-4">
            <Segmented<Measure>
              label="Measure"
              value={item.measure}
              options={[
                { value: 'reps', label: 'Reps with tempo' },
                { value: 'seconds', label: 'Timed hold' },
              ]}
              onChange={(measure) => {
                if (measure === item.measure) return;
                void patch(
                  measure === 'seconds'
                    ? { measure, minReps: 15, maxReps: 60, progressionStep: 5 }
                    : { measure, minReps: 6, maxReps: 12, progressionStep: 1 },
                );
              }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stepper label="Sets" value={item.sets} min={1} max={10} onChange={(sets) => void patch({ sets })} />
            <TextField
              label="Resistance"
              value={item.resistanceLabel}
              onChange={(resistanceLabel) => void patch({ resistanceLabel })}
            />
            <Stepper
              label={hold ? 'Shortest hold' : 'Min reps'}
              value={item.minReps}
              min={1}
              max={item.maxReps}
              step={step}
              suffix={unit}
              onChange={(minReps) => void patch({ minReps })}
            />
            <Stepper
              label={hold ? 'Longest hold' : 'Max reps'}
              value={item.maxReps}
              min={item.minReps}
              max={hold ? 600 : 100}
              step={step}
              suffix={unit}
              onChange={(maxReps) => void patch({ maxReps })}
            />
            <Stepper
              label="Rest between sets"
              value={item.restAfterSetSeconds}
              min={0}
              max={900}
              step={15}
              suffix="sec"
              onChange={(restAfterSetSeconds) => void patch({ restAfterSetSeconds })}
            />
            <Stepper
              label="Transition after"
              value={item.transitionAfterExerciseSeconds}
              min={0}
              max={600}
              step={15}
              suffix="sec"
              onChange={(transitionAfterExerciseSeconds) => void patch({ transitionAfterExerciseSeconds })}
            />
            <Stepper
              label="Target RIR min"
              value={item.targetRirMin}
              min={0}
              max={item.targetRirMax}
              onChange={(targetRirMin) => void patch({ targetRirMin })}
            />
            <Stepper
              label="Target RIR max"
              value={item.targetRirMax}
              min={item.targetRirMin}
              max={5}
              onChange={(targetRirMax) => void patch({ targetRirMax })}
            />
            <Stepper
              label="Progression step"
              value={item.progressionStep}
              min={1}
              max={hold ? 30 : 5}
              suffix={hold ? 'sec' : 'rep'}
              onChange={(progressionStep) => void patch({ progressionStep })}
            />
          </div>

          <SectionLabel className="mt-6">Today&apos;s targets</SectionLabel>
          <p className="mt-1 text-sm text-[var(--muted)]">
            What the next workout will ask for. After a workout the app adds {item.progressionStep}
            {unitSuffix(item.measure) || ' rep'} to each set you hit.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {today.map((reps, index) => (
              <Stepper
                key={`${item.id}-target-${index}`}
                label={`Set ${index + 1}`}
                value={reps}
                min={1}
                step={step}
                suffix={unit}
                onChange={(value) => {
                  const next = today.slice();
                  next[index] = value;
                  void repo.updateCurrentTargets(item.exerciseId, next);
                }}
              />
            ))}
          </div>

          {!hold ? (
            <>
              <SectionLabel className="mt-6">Tempo {formatTempo(item.tempo)}</SectionLabel>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Seconds to lower, pause at the bottom, lift, then hold at the top.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stepper
                  label="Lower"
                  value={item.tempo.eccentric}
                  max={10}
                  suffix="sec"
                  onChange={(eccentric) => void patch({ tempo: { ...item.tempo, eccentric } })}
                />
                <Stepper
                  label="Bottom pause"
                  value={item.tempo.bottomPause}
                  max={10}
                  suffix="sec"
                  onChange={(bottomPause) => void patch({ tempo: { ...item.tempo, bottomPause } })}
                />
                <Stepper
                  label="Lift"
                  value={item.tempo.concentric}
                  max={10}
                  suffix="sec"
                  onChange={(concentric) => void patch({ tempo: { ...item.tempo, concentric } })}
                />
                <Stepper
                  label="Top hold"
                  value={item.tempo.topPause}
                  max={10}
                  suffix="sec"
                  onChange={(topPause) => void patch({ tempo: { ...item.tempo, topPause } })}
                />
              </div>
            </>
          ) : null}

          <div className="mt-6">
            <Segmented<Laterality>
              label="Laterality"
              value={item.laterality}
              options={[
                { value: 'bilateral', label: 'Both sides together' },
                { value: 'unilateral', label: 'One side at a time' },
              ]}
              onChange={(laterality) => void patch({ laterality })}
            />
          </div>
          {item.laterality === 'unilateral' ? (
            <div className="mt-3">
              <Segmented<UnilateralOrder>
                label="Side order"
                value={item.unilateralOrder}
                options={[
                  { value: 'right-then-left', label: 'Right first' },
                  { value: 'left-then-right', label: 'Left first' },
                  ...(hold ? [] : [{ value: 'alternating' as const, label: 'Alternate' }]),
                ]}
                onChange={(unilateralOrder) => void patch({ unilateralOrder })}
              />
            </div>
          ) : null}

          <Button
            variant="ghost"
            className="mt-6 flex w-full items-center justify-center gap-2 text-base text-[var(--warn)]"
            onClick={() => setConfirmRemove(true)}
          >
            <Icon name="trash" size={18} /> Remove exercise
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmRemove}
        eyebrow="REMOVE EXERCISE"
        title={`Remove ${item.exercise.name}?`}
        body="It leaves this program. Past workouts and records for it stay in History and Progress."
        confirmLabel="Remove"
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void repo.removeExerciseFromProgram(item.id);
        }}
      />
    </section>
  );
}

function Glossary() {
  return (
    <section className="mt-12 pb-4">
      <SectionLabel>What the numbers mean</SectionLabel>
      <dl className="mt-4 space-y-4 text-sm leading-relaxed text-[var(--muted)]">
        <div>
          <dt className="text-[var(--fg)]">Min / max</dt>
          <dd className="mt-1">
            The training range, not today&apos;s count. Today starts near the middle. The app adds the
            progression step after you hit a target, up to max. When every set hits max with the target
            RIR, it asks you to make the move harder and resets toward the bottom of the range.
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg)]">Timed hold</dt>
          <dd className="mt-1">
            For planks, L-sits, dead hangs and other isometrics. Targets are seconds instead of reps,
            and the runner counts the hold down with a 3-second warning. One-sided holds get a short
            switch countdown between sides.
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg)]">RIR — reps in reserve</dt>
          <dd className="mt-1">
            How many more reps you could have done with good form. Target 1–2 means stop 1 or 2 reps
            before failure. Rate this after each exercise. RIR 0 (failure) holds the current targets.
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg)]">Tempo</dt>
          <dd className="mt-1">
            Seconds per phase: lowering, pause at the bottom, lifting, pause at the top. 3-0-1-0 is 3
            seconds down, no pause, 1 second up, no hold.
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg)]">Programs</dt>
          <dd className="mt-1">
            Make several programs (for example an A/B split) and Home suggests the next one in this
            order after each workout. You can always pick a different one before you start.
          </dd>
        </div>
      </dl>
    </section>
  );
}

function AddExerciseForm({ programId, onDone }: { programId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [measure, setMeasure] = useState<Measure>('reps');
  return (
    <Card
      as="div"
      className="animate-fade-up mt-4"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const hold = measure === 'seconds';
          void repo
            .addExerciseToProgram(programId, {
              name: name.trim() || (hold ? 'New hold' : 'New exercise'),
              sets: 2,
              minReps: hold ? 15 : 6,
              maxReps: hold ? 60 : 10,
              tempo: { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 },
              restAfterSetSeconds: hold ? 60 : 120,
              transitionAfterExerciseSeconds: 30,
              targetRirMin: 1,
              targetRirMax: 2,
              laterality: 'bilateral',
              unilateralOrder: 'right-then-left',
              resistanceLabel: 'Bodyweight',
              measure,
            })
            .then(onDone);
        }}
      >
        <SectionLabel>New exercise</SectionLabel>
        <TextField label="Name" value={name} onChange={setName} placeholder="e.g. Dips or Plank" />
        <div className="mt-3">
          <Segmented<Measure>
            label="Measure"
            value={measure}
            options={[
              { value: 'reps', label: 'Reps with tempo' },
              { value: 'seconds', label: 'Timed hold' },
            ]}
            onChange={setMeasure}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="accent">
            Add
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="mt-1 block text-sm text-[var(--muted)]">
      {label}
      <input
        className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3 text-lg text-[var(--fg)]"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
