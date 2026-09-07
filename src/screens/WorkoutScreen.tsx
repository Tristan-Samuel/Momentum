import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { RingCountdown } from '@/components/RingCountdown';
import { useWorkoutRunner, type WorkoutControls } from '@/hooks/useWorkoutRunner';
import { formatClock } from '@/utils/time';
import type { DifficultyRating, FormQuality } from '@/types';
import type { WorkoutView } from '@/workout-engine/types';

export function WorkoutScreen() {
  const [params] = useSearchParams();
  const resume = params.get('resume');
  const { view, error, controls } = useWorkoutRunner(resume);
  const [open, setOpen] = useState(false);

  if (error) {
    return (
      <div className="workout-frame bg-[var(--bg)] p-6 text-[var(--fg)]">
        <p>{error}</p>
      </div>
    );
  }
  if (!view || !controls) {
    return (
      <div className="workout-frame bg-[var(--bg)] p-6 text-[var(--fg)]">
        <p className="text-[var(--muted)]">Starting…</p>
      </div>
    );
  }

  const paused = view.kind === 'paused';
  const kind = paused ? view.pausedKind ?? view.kind : view.kind;

  return (
    <div className="workout-frame bg-[var(--bg)] text-[var(--fg)]">
      <div className="workout-stage mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.25em] text-[var(--muted)]">
              {statusLabel(kind, paused)}
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {view.exerciseName}
            </h1>
          </div>
          <button
            type="button"
            className="rounded-full border border-[var(--line)] px-4 py-2 text-sm"
            onClick={() => setOpen(true)}
          >
            Controls
          </button>
        </header>

        <p className="mt-6 text-sm tracking-[0.18em] text-[var(--muted)]">
          SET {view.setIndex + 1} OF {view.setCount}
        </p>
        <p className="mt-2 text-xl">
          Target {view.actualTarget} reps
          {view.actualTarget !== view.prescribedTarget ? (
            <span className="ml-2 text-base text-[var(--muted)]">
              prescribed {view.prescribedTarget}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-[var(--muted)]">Tempo {view.tempoLabel}</p>
        {view.side ? (
          <p className="mt-4 text-2xl tracking-[0.12em]">
            {view.side === 'right' ? 'RIGHT LEG' : 'LEFT LEG'}
          </p>
        ) : null}

        <div className="flex flex-1 flex-col items-center justify-center py-6">
          <PrimaryStage view={view} kind={kind} />
        </div>

        {kind === 'set_active' ? (
          <ProgressBar
            value={view.currentRep}
            max={view.actualTarget}
            label={`Rep ${view.currentRep} of ${view.actualTarget}`}
          />
        ) : null}

        {(kind === 'resting' || kind === 'exercise_transition' || kind === 'set_complete') && (
          <div className="mt-4 text-center">
            <p className="text-xs tracking-[0.22em] text-[var(--muted)]">NEXT</p>
            <p className="mt-2 text-2xl">{view.nextExerciseName ?? view.exerciseName}</p>
            <p className="mt-1 text-[var(--muted)]">
              Set {view.nextSetIndex + 1} · {view.nextTarget} reps
            </p>
          </div>
        )}

        {view.canRate ? (
          <RatingRow
            rating={view.rating.difficultyRating}
            rir={view.rating.rir}
            form={view.rating.formQuality}
            onRate={controls.rate}
          />
        ) : null}

        <ControlSheet
          open={open}
          onClose={() => setOpen(false)}
          view={view}
          kind={kind}
          paused={paused}
          controls={controls}
        />
      </div>
    </div>
  );
}

function statusLabel(kind: string, paused: boolean): string {
  if (paused) return 'PAUSED';
  switch (kind) {
    case 'pre_set_countdown':
      return 'GET READY';
    case 'set_active':
      return 'SET ACTIVE';
    case 'set_complete':
      return 'SET COMPLETE';
    case 'resting':
      return 'REST';
    case 'exercise_complete':
      return 'EXERCISE COMPLETE';
    case 'exercise_transition':
      return 'NEXT EXERCISE';
    case 'workout_complete':
      return 'WORKOUT COMPLETE';
    default:
      return 'WORKOUT';
  }
}

function PrimaryStage({
  view,
  kind,
}: {
  view: WorkoutView;
  kind: string;
}) {
  if (kind === 'pre_set_countdown') {
    return (
      <div className="text-center" aria-live="assertive">
        <p className="text-8xl font-semibold tabular-nums">{view.countdown ?? 3}</p>
        <p className="mt-4 text-xl tracking-[0.2em]">START</p>
      </div>
    );
  }
  if (kind === 'set_active') {
    return (
      <div className="text-center" aria-live="polite">
        <p className="text-xs tracking-[0.25em] text-[var(--muted)]">REP</p>
        <p className="mt-2 text-8xl font-semibold tabular-nums">
          {view.currentRep} <span className="text-4xl text-[var(--muted)]">/ {view.actualTarget}</span>
        </p>
        <p className="mt-4 text-xl tracking-[0.16em] text-[var(--muted)]">
          {phaseLabel(view.phase)}
        </p>
      </div>
    );
  }
  if (kind === 'set_complete') {
    return (
      <div className="text-center">
        <p className="text-xs tracking-[0.25em] text-[var(--ok)]">SET COMPLETE</p>
        <p className="mt-3 text-6xl font-semibold tabular-nums">
          {view.setCompleteReps} / {view.actualTarget}
        </p>
        <p className="mt-3 text-lg text-[var(--muted)]">reps</p>
      </div>
    );
  }
  if (kind === 'exercise_complete') {
    return (
      <div className="text-center">
        <p className="text-xs tracking-[0.25em] text-[var(--ok)]">EXERCISE COMPLETE</p>
        <p className="mt-3 text-4xl font-semibold">{view.exerciseName}</p>
        <p className="mt-3 text-2xl">
          {view.setCount} / {view.setCount} sets
        </p>
      </div>
    );
  }
  if (kind === 'resting' || kind === 'exercise_transition') {
    const total = view.restTotal || 1;
    const remaining = view.restRemaining;
    const progress = 1 - remaining / total;
    return (
      <RingCountdown
        progress={progress}
        label={kind === 'resting' ? 'REST' : 'TRANSITION'}
        remainingLabel={formatClock(remaining)}
        approaching={view.approaching}
      />
    );
  }
  return (
    <div className="text-center">
      <p className="text-4xl font-semibold">Paused</p>
    </div>
  );
}

function phaseLabel(phase: WorkoutView['phase']): string {
  switch (phase) {
    case 'eccentric':
      return 'LOWER';
    case 'bottomPause':
      return 'PAUSE';
    case 'concentric':
      return 'LIFT';
    case 'topPause':
      return 'HOLD';
    default:
      return '';
  }
}

function RatingRow({
  rating,
  rir,
  form,
  onRate,
}: {
  rating: DifficultyRating | null;
  rir: number | null;
  form: FormQuality | null;
  onRate: WorkoutControls['rate'];
}) {
  const options: Array<{ id: DifficultyRating; label: string }> = [
    { id: 'too_easy', label: 'Too easy' },
    { id: 'good', label: 'Good' },
    { id: 'hard', label: 'Hard' },
    { id: 'too_hard', label: 'Too hard' },
  ];
  return (
    <section className="mt-6" aria-label="How did that feel?">
      <p className="text-xs tracking-[0.22em] text-[var(--muted)]">HOW DID THAT FEEL?</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`rounded-2xl border px-3 py-3 ${rating === option.id ? 'border-[var(--fg)]' : 'border-[var(--line)]'}`}
            onClick={() => onRate({ difficultyRating: option.id, rir, formQuality: form })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        {[0, 1, 2, 3].map((value) => (
          <button
            key={value}
            type="button"
            className={`flex-1 rounded-2xl border py-3 ${rir === value ? 'border-[var(--fg)]' : 'border-[var(--line)]'}`}
            onClick={() =>
              onRate({ difficultyRating: rating, rir: value, formQuality: form })
            }
          >
            RIR {value === 3 ? '3+' : value}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`mt-3 w-full rounded-2xl border py-3 ${form === 'poor' ? 'border-[var(--fg)]' : 'border-[var(--line)]'}`}
        onClick={() =>
          onRate({
            difficultyRating: rating,
            rir,
            formQuality: form === 'poor' ? 'good' : 'poor',
          })
        }
      >
        Form felt off
      </button>
    </section>
  );
}

function ControlSheet({
  open,
  onClose,
  view,
  kind,
  paused,
  controls,
}: {
  open: boolean;
  onClose: () => void;
  view: WorkoutView;
  kind: string;
  paused: boolean;
  controls: WorkoutControls;
}) {
  const restMode = kind === 'resting' || kind === 'exercise_transition';
  const targets = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => Math.max(1, view.prescribedTarget - 3 + i)),
    [view.prescribedTarget],
  );

  return (
    <BottomSheet open={open} title="WORKOUT CONTROLS" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {paused ? (
          <Button onClick={() => { controls.resume(); onClose(); }}>Resume</Button>
        ) : (
          <Button onClick={controls.pause}>Pause</Button>
        )}
        <Button variant="ghost" onClick={controls.restartSet}>
          Restart set
        </Button>
        <Button variant="ghost" onClick={controls.skipSet}>
          Skip set
        </Button>
        <Button variant="ghost" onClick={controls.skipExercise}>
          Skip exercise
        </Button>
        <Button variant="ghost" onClick={controls.removeRep}>
          − Rep
        </Button>
        <Button variant="ghost" onClick={controls.addRep}>
          + Rep
        </Button>
      </div>
      {restMode ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[15, 30, 60].map((seconds) => (
            <Button key={seconds} variant="quiet" onClick={() => controls.extendRest(seconds)}>
              +{seconds}s
            </Button>
          ))}
        </div>
      ) : null}
      <p className="mt-5 text-xs tracking-[0.18em] text-[var(--muted)]">OVERRIDE TARGET</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {targets.map((reps) => (
          <button
            key={reps}
            type="button"
            className={`rounded-full border px-4 py-2 ${reps === view.actualTarget ? 'border-[var(--fg)]' : 'border-[var(--line)]'}`}
            onClick={() => controls.setTarget(reps)}
          >
            {reps}
          </button>
        ))}
      </div>
      <Button variant="danger" className="mt-6 w-full" onClick={controls.endWorkout}>
        End workout
      </Button>
    </BottomSheet>
  );
}
