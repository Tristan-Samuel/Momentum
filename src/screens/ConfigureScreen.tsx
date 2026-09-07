import { useState } from 'react';
import { usePreparedWorkout } from '@/hooks/usePreparedWorkout';
import { Button } from '@/components/Button';
import * as repo from '@/database/repository';
import { formatTempo } from '@/utils/tempo';
import type { ExerciseConfiguration, Laterality, UnilateralOrder } from '@/types';

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
          <ExerciseEditor key={item.id} config={item} name={item.exercise.name} />
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
    </main>
  );
}

function ExerciseEditor({
  config,
  name,
}: {
  config: ExerciseConfiguration;
  name: string;
}) {
  const patch = (partial: Partial<ExerciseConfiguration>) =>
    repo.updateExerciseConfiguration(config.id, partial);

  return (
    <section className="rounded-3xl border border-[var(--line)] p-5">
      <input
        className="w-full bg-transparent text-2xl font-semibold text-[var(--fg)] outline-none"
        defaultValue={name}
        onBlur={(event) => void repo.updateExerciseName(config.exerciseId, event.target.value)}
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberField label="Sets" value={config.sets} onChange={(sets) => void patch({ sets })} />
        <TextField
          label="Resistance"
          value={config.resistanceLabel}
          onChange={(resistanceLabel) => void patch({ resistanceLabel })}
        />
        <NumberField label="Min reps" value={config.minReps} onChange={(minReps) => void patch({ minReps })} />
        <NumberField label="Max reps" value={config.maxReps} onChange={(maxReps) => void patch({ maxReps })} />
        <NumberField
          label="Rest (sec)"
          value={config.restAfterSetSeconds}
          onChange={(restAfterSetSeconds) => void patch({ restAfterSetSeconds })}
        />
        <NumberField
          label="Transition (sec)"
          value={config.transitionAfterExerciseSeconds}
          onChange={(transitionAfterExerciseSeconds) => void patch({ transitionAfterExerciseSeconds })}
        />
        <NumberField
          label="Target RIR min"
          value={config.targetRirMin}
          onChange={(targetRirMin) => void patch({ targetRirMin })}
        />
        <NumberField
          label="Target RIR max"
          value={config.targetRirMax}
          onChange={(targetRirMax) => void patch({ targetRirMax })}
        />
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">Tempo {formatTempo(config.tempo)}</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <NumberField
          label="Ecc"
          value={config.tempo.eccentric}
          onChange={(eccentric) => void patch({ tempo: { ...config.tempo, eccentric } })}
        />
        <NumberField
          label="Bottom"
          value={config.tempo.bottomPause}
          onChange={(bottomPause) => void patch({ tempo: { ...config.tempo, bottomPause } })}
        />
        <NumberField
          label="Con"
          value={config.tempo.concentric}
          onChange={(concentric) => void patch({ tempo: { ...config.tempo, concentric } })}
        />
        <NumberField
          label="Top"
          value={config.tempo.topPause}
          onChange={(topPause) => void patch({ tempo: { ...config.tempo, topPause } })}
        />
      </div>
      <label className="mt-4 block text-sm text-[var(--muted)]">
        Laterality
        <select
          className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-[var(--fg)]"
          value={config.laterality}
          onChange={(event) => void patch({ laterality: event.target.value as Laterality })}
        >
          <option value="bilateral">Bilateral</option>
          <option value="unilateral">Unilateral</option>
        </select>
      </label>
      {config.laterality === 'unilateral' ? (
        <label className="mt-3 block text-sm text-[var(--muted)]">
          Leg order
          <select
            className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-[var(--fg)]"
            value={config.unilateralOrder}
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
        onClick={() => void repo.removeExerciseFromProgram(config.id)}
      >
        Remove
      </Button>
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
