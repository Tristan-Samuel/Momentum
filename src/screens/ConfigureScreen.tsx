import { useState } from 'react';
import { usePreparedWorkout } from '@/hooks/usePreparedWorkout';
import { Button } from '@/components/Button';
import * as repo from '@/database/repository';
import { formatTodayPlan, targetsForExercise } from '@/utils/prescription';
import { formatTempo } from '@/utils/tempo';
import type { ExerciseConfiguration, Laterality, ProgramExercise, UnilateralOrder } from '@/types';

export function ConfigureScreen() {
  const prepared = usePreparedWorkout();
  const [adding, setAdding] = useState(false);
  if (!prepared) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">PROGRAM</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Configuration</h1>
      <label className="mt-6 block text-sm text-[var(--muted)]">
        Program name
        <input
          className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-xl text-[var(--fg)]"
          defaultValue={prepared.program.name}
          onBlur={(event) => void repo.updateProgramName(prepared.program.id, event.target.value)}
        />
      </label>
      <div className="mt-8 space-y-6">
        {prepared.exercises.map((item) => (
          <ExerciseEditor key={item.id} item={item} />
        ))}
      </div>
      {adding ? (
        <AddExerciseForm
          programId={prepared.program.id}
          onDone={() => setAdding(false)}
        />
      ) : (
        <Button className="mt-8 w-full" variant="ghost" onClick={() => setAdding(true)}>
          Add exercise
        </Button>
      )}
      <Glossary />
    </main>
  );
}

function ExerciseEditor({ item }: { item: ProgramExercise }) {
  const patch = (partial: Partial<ExerciseConfiguration>) =>
    repo.updateExerciseConfiguration(item.id, partial);
  const today = targetsForExercise(item);

  return (
    <section className="rounded-3xl border border-[var(--line)] p-5">
      <input
        className="w-full bg-transparent text-2xl font-semibold text-[var(--fg)] outline-none"
        defaultValue={item.exercise.name}
        onBlur={(event) => void repo.updateExerciseName(item.exerciseId, event.target.value)}
      />
      <p className="mt-2 text-sm text-[var(--muted)]">{formatTodayPlan(item)}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberField label="Sets" value={item.sets} onChange={(sets) => void patch({ sets })} />
        <TextField
          label="Resistance"
          value={item.resistanceLabel}
          onChange={(resistanceLabel) => void patch({ resistanceLabel })}
        />
        <NumberField
          label="Min reps (range floor)"
          value={item.minReps}
          onChange={(minReps) => void patch({ minReps })}
        />
        <NumberField
          label="Max reps (range ceiling)"
          value={item.maxReps}
          onChange={(maxReps) => void patch({ maxReps })}
        />
        <NumberField
          label="Rest between sets (sec)"
          value={item.restAfterSetSeconds}
          onChange={(restAfterSetSeconds) => void patch({ restAfterSetSeconds })}
        />
        <NumberField
          label="Transition to next exercise (sec)"
          value={item.transitionAfterExerciseSeconds}
          onChange={(transitionAfterExerciseSeconds) => void patch({ transitionAfterExerciseSeconds })}
        />
        <NumberField
          label="Target RIR min"
          value={item.targetRirMin}
          onChange={(targetRirMin) => void patch({ targetRirMin })}
        />
        <NumberField
          label="Target RIR max"
          value={item.targetRirMax}
          onChange={(targetRirMax) => void patch({ targetRirMax })}
        />
      </div>
      <p className="mt-5 text-xs tracking-[0.18em] text-[var(--muted)]">TODAY&apos;S TARGETS</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        This is how many reps the next workout will ask for. Change a number to bump it now. After a
        workout the app usually adds 1 if you hit the target.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {today.map((reps, index) => (
          <NumberField
            key={`${item.id}-target-${index}`}
            label={`Set ${index + 1} reps`}
            value={reps}
            onChange={(value) => {
              const next = today.slice();
              next[index] = value;
              void repo.updateCurrentTargets(item.exerciseId, next);
            }}
          />
        ))}
      </div>
      <p className="mt-5 text-sm text-[var(--muted)]">
        Tempo {formatTempo(item.tempo)} — seconds to lower, pause at the bottom, lift, then pause at
        the top
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField
          label="Lower / eccentric (sec)"
          value={item.tempo.eccentric}
          onChange={(eccentric) => void patch({ tempo: { ...item.tempo, eccentric } })}
        />
        <NumberField
          label="Bottom pause (sec)"
          value={item.tempo.bottomPause}
          onChange={(bottomPause) => void patch({ tempo: { ...item.tempo, bottomPause } })}
        />
        <NumberField
          label="Lift / concentric (sec)"
          value={item.tempo.concentric}
          onChange={(concentric) => void patch({ tempo: { ...item.tempo, concentric } })}
        />
        <NumberField
          label="Top hold (sec)"
          value={item.tempo.topPause}
          onChange={(topPause) => void patch({ tempo: { ...item.tempo, topPause } })}
        />
      </div>
      <label className="mt-4 block text-sm text-[var(--muted)]">
        Laterality
        <select
          className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-[var(--fg)]"
          value={item.laterality}
          onChange={(event) => void patch({ laterality: event.target.value as Laterality })}
        >
          <option value="bilateral">Bilateral (both sides together)</option>
          <option value="unilateral">Unilateral (one side at a time)</option>
        </select>
      </label>
      {item.laterality === 'unilateral' ? (
        <label className="mt-3 block text-sm text-[var(--muted)]">
          Side order
          <select
            className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-[var(--fg)]"
            value={item.unilateralOrder}
            onChange={(event) =>
              void patch({ unilateralOrder: event.target.value as UnilateralOrder })
            }
          >
            <option value="right-then-left">Right then left</option>
            <option value="left-then-right">Left then right</option>
            <option value="alternating">Alternating</option>
          </select>
        </label>
      ) : null}
      <p className="mt-4 text-sm text-[var(--muted)]">Progression: rep-range</p>
      <Button
        variant="ghost"
        className="mt-4 w-full"
        onClick={() => void repo.removeExerciseFromProgram(item.id)}
      >
        Remove
      </Button>
    </section>
  );
}

function Glossary() {
  return (
    <section className="mt-12 pb-4">
      <p className="text-xs tracking-[0.22em] text-[var(--muted)]">WHAT THE NUMBERS MEAN</p>
      <dl className="mt-4 space-y-4 text-sm leading-relaxed text-[var(--muted)]">
        <div>
          <dt className="text-[var(--fg)]">Min / max reps</dt>
          <dd className="mt-1">
            The training range, not today&apos;s count. Today starts near the middle. The app adds a
            rep after you hit a target, up to max. When every set hits max with the target RIR, it
            asks you to make the move harder and resets toward the bottom of the range.
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg)]">RIR — reps in reserve</dt>
          <dd className="mt-1">
            How many more reps you could have done with good form. Target 1–2 means stop 1 or 2
            reps before failure. Rate this after each exercise. RIR 0 (failure) holds the current
            targets.
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg)]">Ecc / Bottom / Con / Top</dt>
          <dd className="mt-1">
            Tempo in seconds: eccentric (lowering), pause at the bottom, concentric (lifting), pause
            at the top. 3-0-1-0 is 3 seconds down, no pause, 1 second up, no hold.
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg)]">Transition time</dt>
          <dd className="mt-1">
            Countdown after this exercise finishes, before the next exercise starts. Rest between
            sets of the same exercise is the separate rest field.
          </dd>
        </div>
      </dl>
    </section>
  );
}

function AddExerciseForm({ programId, onDone }: { programId: string; onDone: () => void }) {
  const [name, setName] = useState('New exercise');
  return (
    <form
      className="mt-8 rounded-3xl border border-[var(--line)] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void repo
          .addExerciseToProgram(programId, {
            name,
            sets: 2,
            minReps: 6,
            maxReps: 10,
            tempo: { eccentric: 3, bottomPause: 0, concentric: 1, topPause: 0 },
            restAfterSetSeconds: 120,
            transitionAfterExerciseSeconds: 30,
            targetRirMin: 1,
            targetRirMax: 2,
            laterality: 'bilateral',
            unilateralOrder: 'right-then-left',
            resistanceLabel: 'Bodyweight',
          })
          .then(onDone);
      }}
    >
      <TextField label="Name" value={name} onChange={setName} />
      <Button className="mt-4 w-full">Save exercise</Button>
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm text-[var(--muted)]">
      {label}
      <input
        type="number"
        className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-lg text-[var(--fg)]"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm text-[var(--muted)]">
      {label}
      <input
        className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-lg text-[var(--fg)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
