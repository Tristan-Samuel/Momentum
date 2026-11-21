import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Segmented } from '@/components/ui/Segmented';
import { applyCreatedProgram, applyExerciseEdit, applyRecommendation } from '@/coach/apply';
import { buildCoachContext } from '@/coach/context';
import {
  describeEdit,
  describeExercise,
  parseCoachReply,
  type CoachReply,
  type CoachTask,
} from '@/coach/schema';
import { listPrograms } from '@/database/repository';
import { usePreparedWorkout } from '@/hooks/usePreparedWorkout';
import { askCoach, SyncHttpError } from '@/sync/api';
import { isSignedIn, useSyncAccount } from '@/sync/auth';

const TASKS: Array<{ value: CoachTask; label: string }> = [
  { value: 'create_program', label: 'New' },
  { value: 'edit_exercise', label: 'Edit' },
  { value: 'analyze', label: 'Analyze' },
];

const PLACEHOLDER: Record<CoachTask, string> = {
  create_program: 'A 40-minute pull day. Pull-ups start with the lift. Pistol squats. About four exercises.',
  edit_exercise: 'Make the rest 2 minutes and start this one with the lift.',
  analyze: 'Optional. Ask about the week, a plateau, the schedule, or what to change.',
};

export function CoachScreen() {
  const [params] = useSearchParams();
  const programs = useLiveQuery(() => listPrograms(), []);
  const requested = params.get('program');
  const [chosenId, setChosenId] = useState<string | null>(requested);
  const selectedId = programs?.find((row) => row.id === chosenId)?.id ?? programs?.[0]?.id ?? null;
  const prepared = usePreparedWorkout(selectedId);
  const account = useSyncAccount();
  const [task, setTask] = useState<CoachTask>('create_program');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<CoachReply | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  if (!prepared || !programs || account === undefined) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  const focus = prepared.exercises.find((item) => item.id === focusId) ?? prepared.exercises[0];
  const signedIn = isSignedIn(account);

  const ask = async () => {
    if (!signedIn) return;
    const trimmed = note.trim();
    if (task !== 'analyze' && trimmed.length < 2) {
      setError('Say what you want changed.');
      return;
    }
    setBusy(true);
    setError(null);
    setApplied(null);
    try {
      const context = await buildCoachContext(
        task === 'edit_exercise' ? prepared.program.id : null,
        task === 'edit_exercise' ? focus?.id : null,
      );
      const raw = await askCoach(account.token, { task, note: trimmed, context });
      setReply(parseCoachReply(raw));
    } catch (err) {
      setReply(null);
      setError(err instanceof SyncHttpError ? err.message : 'Could not reach Gemini.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">GEMINI</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Coach</h1>
      <p className="mt-3 text-[var(--muted)]">
        Ask about the whole log: every program, the schedule, and past sessions. Draft a program or change one
        exercise. Sent to Gemini through tssamuel.com.
      </p>

      {!signedIn ? (
        <Card className="mt-6">
          <p>Sign in so this can use Gemini on tssamuel.com.</p>
          <Link to="/settings" className="mt-4 inline-block text-[var(--accent)]">
            Open Settings
          </Link>
        </Card>
      ) : (
        <>
          {task === 'edit_exercise' && programs.length > 1 ? (
            <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist" aria-label="Program">
              {programs.map((program) => (
                <button
                  key={program.id}
                  type="button"
                  role="tab"
                  aria-selected={program.id === prepared.program.id}
                  onClick={() => {
                    setChosenId(program.id);
                    setFocusId(null);
                    setReply(null);
                  }}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
                    program.id === prepared.program.id
                      ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                      : 'border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  {program.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-6">
            <Segmented
              label="Coach task"
              value={task}
              options={TASKS}
              onChange={(next) => {
                setTask(next);
                setReply(null);
                setApplied(null);
                setError(null);
              }}
            />
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">
            {task === 'edit_exercise'
              ? 'The change applies to the exercise you pick. Gemini still reads the other programs, the schedule, and the log.'
              : 'Gemini reads every program, the schedule, and the training log.'}
          </p>

          {task === 'edit_exercise' && focus ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {prepared.exercises.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFocusId(item.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    item.id === focus.id
                      ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                      : 'border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  {item.exercise.name}
                </button>
              ))}
            </div>
          ) : null}

          <label className="mt-4 block text-sm text-[var(--muted)]">
            {task === 'analyze' ? 'Note' : 'What should it do?'}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={PLACEHOLDER[task]}
              className="mt-2 w-full resize-none rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-base text-[var(--fg)]"
            />
          </label>
          {error ? <p className="mt-3 text-sm text-[var(--warn)]">{error}</p> : null}
          <Button className="mt-4 w-full" variant="accent" disabled={busy} onClick={() => void ask()}>
            {busy ? 'Asking…' : 'Ask Gemini'}
          </Button>
        </>
      )}

      {reply ? (
        <section className="mt-8 space-y-4">
          <p className="text-lg leading-relaxed">{reply.summary}</p>
          {reply.program ? (
            <Card tone="plain">
              <SectionLabel>{reply.program.name}</SectionLabel>
              <ul className="mt-3 space-y-3">
                {reply.program.exercises.map((item) => (
                  <li key={item.name}>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-[var(--muted)]">{describeExercise(item)}</p>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-4 w-full"
                variant="accent"
                onClick={() =>
                  void applyCreatedProgram(reply.program!.name, reply.program!.exercises)
                    .then(() => setApplied(`Added ${reply.program!.name}.`))
                    .catch((err: unknown) =>
                      setError(err instanceof Error ? err.message : 'Could not add the program.'),
                    )
                }
              >
                Add program
              </Button>
            </Card>
          ) : null}
          {reply.edit ? (
            <Card tone="plain">
              <SectionLabel>Change</SectionLabel>
              <ul className="mt-3 space-y-1 text-sm">
                {describeEdit(reply.edit).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <Button
                className="mt-4 w-full"
                variant="accent"
                onClick={() =>
                  void applyExerciseEdit(reply.edit!)
                    .then(() => setApplied('Updated the exercise.'))
                    .catch((err: unknown) =>
                      setError(err instanceof Error ? err.message : 'Could not update the exercise.'),
                    )
                }
              >
                Apply
              </Button>
            </Card>
          ) : null}
          {reply.recommendations.map((item) => (
            <Card key={`${item.exerciseConfigId ?? 'note'}-${item.note}`} tone="plain">
              <p>{item.note}</p>
              {item.targets || item.resistanceLabel ? (
                <Button
                  className="mt-4 w-full"
                  variant="ghost"
                  onClick={() =>
                    void applyRecommendation(item)
                      .then(() => setApplied('Applied that recommendation.'))
                      .catch((err: unknown) =>
                        setError(err instanceof Error ? err.message : 'Could not apply that.'),
                      )
                  }
                >
                  Use this
                </Button>
              ) : null}
            </Card>
          ))}
          {applied ? <p className="text-sm text-[var(--ok)]">{applied}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
