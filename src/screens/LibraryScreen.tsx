import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import * as repo from '@/database/repository';
import { useSettings } from '@/hooks/useSettings';
import {
  LIBRARY_EXERCISES,
  LIBRARY_GROUPS,
  libraryExerciseInput,
  type LibraryExercise,
} from '@/library/catalog';
import { LIBRARY_PROGRAMS, exercisesForProgram } from '@/library/programs';
import { formatLoad } from '@/utils/load';

export function LibraryScreen() {
  const settings = useSettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const programId = params.get('program');
  const [tab, setTab] = useState<'exercises' | 'programs'>('exercises');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<LibraryExercise | null>(null);
  const [load, setLoad] = useState(0);
  const [busy, setBusy] = useState(false);
  const unit = settings?.weightUnit ?? 'lb';

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return LIBRARY_EXERCISES.filter((entry) => {
      if (!needle) return true;
      return (
        entry.name.toLowerCase().includes(needle) ||
        entry.group.toLowerCase().includes(needle) ||
        entry.equipment.toLowerCase().includes(needle)
      );
    });
  }, [query]);

  const openExercise = (entry: LibraryExercise) => {
    const input = libraryExerciseInput(entry, unit);
    setPicked(entry);
    setLoad(input.load ?? 0);
  };

  const addExercise = async () => {
    if (!picked || !programId || busy) return;
    setBusy(true);
    const input = libraryExerciseInput(picked, unit);
    await repo.addExerciseToProgram(programId, {
      ...input,
      load: input.loadKind === 'bodyweight' ? null : load,
    });
    navigate('/configure', { state: { programId } });
  };

  const addProgram = async (id: string) => {
    if (busy) return;
    const template = LIBRARY_PROGRAMS.find((item) => item.id === id);
    if (!template) return;
    setBusy(true);
    const program = await repo.createProgram(template.name);
    for (const entry of exercisesForProgram(template)) {
      await repo.addExerciseToProgram(program.id, libraryExerciseInput(entry, unit));
    }
    navigate('/configure', { state: { programId: program.id } });
  };

  return (
    <main>
      <Link to="/configure" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]">
        <Icon name="chevron-down" size={16} className="rotate-90" /> Program
      </Link>
      <p className="mt-4 text-xs tracking-[0.25em] text-[var(--muted)]">LIBRARY</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Gym library</h1>
      <p className="mt-3 text-[var(--muted)]">
        Pick a movement or a whole program. Heavy barbell and machine work is self-paced. Curls, raises, and bodyweight stay on the metronome.
      </p>

      <div className="mt-6">
        <Segmented<'exercises' | 'programs'>
          label="Library"
          value={tab}
          options={[
            { value: 'exercises', label: 'Exercises' },
            { value: 'programs', label: 'Programs' },
          ]}
          onChange={(next) => {
            setTab(next);
            setPicked(null);
          }}
        />
      </div>

      {tab === 'exercises' ? (
        <>
          <label className="mt-4 block text-sm text-[var(--muted)]">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Squat, dumbbell, pull"
              className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3 text-lg text-[var(--fg)]"
            />
          </label>
          {picked ? (
            <ConfirmExercise
              entry={picked}
              unit={unit}
              load={load}
              canAdd={Boolean(programId)}
              busy={busy}
              onLoad={setLoad}
              onCancel={() => setPicked(null)}
              onAdd={() => void addExercise()}
            />
          ) : (
            <div className="mt-6 space-y-6">
              {LIBRARY_GROUPS.map((group) => {
                const rows = visible.filter((entry) => entry.group === group);
                if (rows.length === 0) return null;
                return (
                  <section key={group}>
                    <SectionLabel>{group}</SectionLabel>
                    <div className="mt-3 space-y-2">
                      {rows.map((entry) => {
                        const preview = libraryExerciseInput(entry, unit);
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => openExercise(entry)}
                            className="flex w-full items-center justify-between gap-3 rounded-3xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-left"
                          >
                            <span>
                              <span className="block font-medium">{entry.name}</span>
                              <span className="mt-0.5 block text-sm text-[var(--muted)]">
                                {entry.equipment} · {preview.sets} × {preview.minReps}–{preview.maxReps}
                                {preview.measure === 'seconds' ? 's' : ''} · {preview.cueMode === 'open' ? 'open' : 'tempo'}
                                {preview.loadKind === 'bodyweight' ? '' : ` · ${preview.resistanceLabel}`}
                              </span>
                            </span>
                            <Icon name="chevron-right" size={16} className="shrink-0 text-[var(--muted)]" />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 space-y-3">
          {LIBRARY_PROGRAMS.map((program) => (
            <Card key={program.id} tone="plain">
              <h2 className="text-2xl font-semibold">{program.name}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{program.summary}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {exercisesForProgram(program).map((entry) => (
                  <li key={entry.id}>{entry.name}</li>
                ))}
              </ul>
              <Button className="mt-4 w-full" variant="accent" disabled={busy} onClick={() => void addProgram(program.id)}>
                Add program
              </Button>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

function ConfirmExercise({
  entry,
  unit,
  load,
  canAdd,
  busy,
  onLoad,
  onCancel,
  onAdd,
}: {
  entry: LibraryExercise;
  unit: 'lb' | 'kg';
  load: number;
  canAdd: boolean;
  busy: boolean;
  onLoad: (value: number) => void;
  onCancel: () => void;
  onAdd: () => void;
}) {
  const preview = libraryExerciseInput(entry, unit);
  const loaded = preview.loadKind !== 'bodyweight';
  const label = loaded
    ? formatLoad({ ...preview, load })
    : 'Bodyweight';
  return (
    <Card className="mt-4" tone="plain">
      <SectionLabel>Add {entry.name}</SectionLabel>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {preview.sets} × {preview.minReps}–{preview.maxReps}
        {preview.measure === 'seconds' ? 's' : ''} · rest {preview.restAfterSetSeconds}s ·{' '}
        {preview.cueMode === 'open' ? 'you log the reps' : 'tempo metronome'}
      </p>
      {loaded ? (
        <div className="mt-4">
          <Stepper
            label={`Load (${unit}${preview.loadPer === 'side' ? ' / side' : ''})`}
            value={load}
            min={0}
            max={unit === 'kg' ? 500 : 1000}
            step={preview.loadStep}
            suffix={unit}
            onChange={onLoad}
          />
          <p className="mt-2 text-sm text-[var(--muted)]">Starts at {label}. You can change it later on Program.</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">Bodyweight. Add a belt or vest later on Program.</p>
      )}
      {!canAdd ? (
        <p className="mt-3 text-sm text-[var(--warn)]">Open the library from a program to add this exercise.</p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <Button type="button" variant="accent" disabled={!canAdd || busy} onClick={onAdd}>
          Add
        </Button>
      </div>
    </Card>
  );
}
