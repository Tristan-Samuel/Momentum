import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { RingCountdown } from '@/components/RingCountdown';
import { useWorkoutRunner, type WorkoutControls } from '@/hooks/useWorkoutRunner';
import {
  formatAmount,
  formatRepList,
  formatRepRange,
  formatRirRange,
  measureNoun,
  unitSuffix,
} from '@/utils/prescription';
import { formatClock } from '@/utils/time';
import type { DifficultyRating, FormQuality, TempoPhase } from '@/types';
import type { WorkoutView } from '@/workout-engine/types';

export function WorkoutScreen() {
  const [params] = useSearchParams();
  const resume = params.get('resume');
  const programId = params.get('program');
  const { view, error, controls } = useWorkoutRunner(resume, programId);
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
      <div className="workout-frame flex items-center justify-center bg-[var(--bg)] p-6 text-[var(--fg)]">
        <p className="text-[var(--muted)]">Starting…</p>
      </div>
    );
  }

  const paused = view.kind === 'paused';
  const kind = paused ? view.pausedKind ?? view.kind : view.kind;
  const unit = unitSuffix(view.measure);

  return (
    <div className="workout-frame bg-[var(--bg)] text-[var(--fg)]">
      <div className="workout-stage mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <ExerciseStrip view={view} />
        <div className="mt-3 flex items-center justify-between text-sm text-[var(--muted)]">
          <span className="tabular-nums">{formatClock(view.elapsedWorkoutMs / 1000)}</span>
          <span>
            Exercise {Math.min(view.exerciseIndex + 1, view.exerciseCount)} of {view.exerciseCount}
          </span>
        </div>

        <header className="mt-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-xs font-medium tracking-[0.25em] ${statusColor(kind, paused)}`}>
              {statusLabel(kind, paused)}
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
              {view.exerciseName}
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Today {view.setCount} × {formatRepList(view.targetRepsPerSet, view.measure)}
              {view.laterality === 'unilateral' ? ' per side' : ''}
              <span className="mx-1.5">·</span>
              range {formatRepRange(view.minReps, view.maxReps, view.measure)}
              <span className="mx-1.5">·</span>
              RIR {formatRirRange(view.targetRirMin, view.targetRirMax)}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full border border-[var(--line)] px-4 py-2 text-sm"
            onClick={() => setOpen(true)}
          >
            Controls
          </button>
        </header>

        <div className="mt-5 flex items-center justify-between">
          <SetDots count={view.setCount} current={view.setIndex} kind={kind} />
          <p className="text-sm text-[var(--muted)]">
            Target {formatAmount(view.actualTarget, view.measure)}
            {view.actualTarget !== view.prescribedTarget ? (
              <span> (was {formatAmount(view.prescribedTarget, view.measure)})</span>
            ) : null}
            {view.measure === 'reps' ? <span> · Tempo {view.tempoCompact}</span> : null}
          </p>
        </div>

        {view.side ? (
          <p className="mt-4 self-start rounded-full bg-[var(--accent-soft)] px-3 py-1 text-sm font-medium tracking-[0.14em] text-[var(--accent)]">
            {view.side === 'right' ? 'RIGHT SIDE' : 'LEFT SIDE'}
          </p>
        ) : null}

        <div className="flex flex-1 flex-col items-center justify-center py-6">
          <PrimaryStage view={view} kind={kind} />
        </div>

        {kind === 'set_active' && view.measure === 'reps' ? (
          <div className="space-y-4">
            <TempoBar phase={view.phase} tempo={view.tempoCompact} />
            <ProgressBar
              value={view.currentRep}
              max={view.actualTarget}
              label={`Rep ${view.currentRep} of ${view.actualTarget}`}
            />
          </div>
        ) : null}

        {(kind === 'resting' || kind === 'exercise_transition' || kind === 'set_complete') && (
          <div className="mt-4 rounded-3xl border border-[var(--line)] p-4 text-center">
            <p className="text-xs tracking-[0.22em] text-[var(--muted)]">UP NEXT</p>
            <p className="mt-1 text-2xl">{view.nextExerciseName ?? view.exerciseName}</p>
            <p className="mt-1 text-[var(--muted)]">
              Set {view.nextSetIndex + 1} · {view.nextTarget}
              {unit || ` ${measureNoun(view.measure)}`}
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

function ExerciseStrip({ view }: { view: WorkoutView }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: view.exerciseCount }, (_, index) => {
        const done = index < view.exerciseIndex || view.workoutComplete;
        const current = index === view.exerciseIndex && !view.workoutComplete;
        const fraction = current ? view.setIndex / Math.max(1, view.setCount) : 0;
        return (
          <span key={index} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
            <span
              className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: done ? '100%' : current ? `${Math.max(8, fraction * 100)}%` : '0%' }}
            />
          </span>
        );
      })}
    </div>
  );
}

function SetDots({ count, current, kind }: { count: number; current: number; kind: string }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Set ${current + 1} of ${count}`}>
      <span className="text-sm tracking-[0.18em] text-[var(--muted)]">SET</span>
      {Array.from({ length: count }, (_, index) => {
        const done = index < current || (index === current && kind === 'set_complete');
        const active = index === current && !done;
        return (
          <span
            key={index}
            className={`h-2.5 rounded-full transition-all ${
              done ? 'w-2.5 bg-[var(--ok)]' : active ? 'w-6 bg-[var(--fg)]' : 'w-2.5 bg-[var(--line)]'
            }`}
          />
        );
      })}
    </div>
  );
}

const PHASES: Array<{ id: TempoPhase; label: string }> = [
  { id: 'eccentric', label: 'Lower' },
  { id: 'bottomPause', label: 'Pause' },
  { id: 'concentric', label: 'Lift' },
  { id: 'topPause', label: 'Hold' },
];

function TempoBar({ phase, tempo }: { phase: TempoPhase | null; tempo: string }) {
  const seconds = tempo.split('-').map(Number);
  return (
    <div className="grid grid-cols-4 gap-1.5" aria-label={`Tempo ${tempo}`}>
      {PHASES.map((item, index) => {
        const active = item.id === phase;
        const skipped = seconds[index] === 0;
        return (
          <div
            key={item.id}
            className={`rounded-2xl px-2 py-2 text-center transition-colors ${
              active
                ? 'bg-[var(--accent)] text-white'
                : skipped
                  ? 'text-[var(--muted)] opacity-40'
                  : 'bg-[var(--line)]/50 text-[var(--muted)]'
            }`}
          >
            <p className="text-xs tracking-[0.12em] uppercase">{item.label}</p>
            <p className="text-sm tabular-nums">{seconds[index] ?? 0}s</p>
          </div>
        );
      })}
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

function statusColor(kind: string, paused: boolean): string {
  if (paused) return 'text-[var(--warn)]';
  if (kind === 'set_active' || kind === 'pre_set_countdown') return 'text-[var(--accent)]';
  if (kind === 'resting' || kind === 'exercise_transition') return 'text-[var(--rest)]';
  if (kind === 'set_complete' || kind === 'exercise_complete') return 'text-[var(--ok)]';
  return 'text-[var(--muted)]';
}

function PrimaryStage({ view, kind }: { view: WorkoutView; kind: string }) {
  if (view.kind === 'paused') {
    return (
      <div className="text-center">
        <p className="text-5xl font-semibold">Paused</p>
        <p className="mt-3 text-[var(--muted)]">Open Controls to resume.</p>
      </div>
    );
  }
  if (kind === 'pre_set_countdown') {
    return (
      <div className="text-center" aria-live="assertive">
        <p key={view.countdown} className="animate-fade-up text-9xl font-semibold tabular-nums">
          {view.countdown ?? 3}
        </p>
        <p className="mt-4 text-xl tracking-[0.2em] text-[var(--accent)]">START</p>
      </div>
    );
  }
  if (kind === 'set_active' && view.measure === 'seconds') {
    if (view.switchingSides) {
      return (
        <RingCountdown
          progress={1 - view.holdRemaining / 3}
          label="SWITCH SIDES"
          remainingLabel={String(Math.max(1, Math.ceil(view.holdRemaining)))}
          approaching
        />
      );
    }
    return (
      <RingCountdown
        progress={view.currentRep / Math.max(1, view.actualTarget)}
        label="HOLD"
        remainingLabel={formatClock(view.holdRemaining)}
        approaching={view.holdRemaining <= 3}
        color="var(--accent)"
      />
    );
  }
  if (kind === 'set_active') {
    return (
      <div className="text-center" aria-live="polite">
        <p className="text-xs tracking-[0.25em] text-[var(--muted)]">REP</p>
        <p className="mt-2 text-9xl font-semibold tabular-nums leading-none">
          {view.currentRep}
          <span className="text-4xl text-[var(--muted)]"> / {view.actualTarget}</span>
        </p>
        {view.actualTarget <= 20 ? (
          <div className="mt-6 flex flex-wrap justify-center gap-1.5" aria-hidden="true">
            {Array.from({ length: view.actualTarget }, (_, index) => (
              <span
                key={index}
                className={`h-2 w-2 rounded-full transition-colors ${
                  index < view.currentRep - 1
                    ? 'bg-[var(--fg)]'
                    : index === view.currentRep - 1
                      ? 'bg-[var(--accent)]'
                      : 'bg-[var(--line)]'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  if (kind === 'set_complete') {
    return (
      <div className="animate-fade-up text-center">
        <p className="text-xs tracking-[0.25em] text-[var(--ok)]">SET COMPLETE</p>
        <p className="mt-3 text-7xl font-semibold tabular-nums">
          {view.setCompleteReps}
          <span className="text-3xl text-[var(--muted)]"> / {formatAmount(view.actualTarget, view.measure)}</span>
        </p>
        <p className="mt-3 text-lg text-[var(--muted)]">{measureNoun(view.measure)}</p>
      </div>
    );
  }
  if (kind === 'exercise_complete') {
    return (
      <div className="animate-fade-up text-center">
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
    return (
      <RingCountdown
        progress={1 - remaining / total}
        label={kind === 'resting' ? 'REST' : 'TRANSITION'}
        remainingLabel={formatClock(remaining)}
        approaching={view.approaching}
      />
    );
  }
  return null;
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
  const selected = (active: boolean) =>
    active
      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]'
      : 'border-[var(--line)] text-[var(--muted)]';
  return (
    <section className="animate-fade-up mt-6" aria-label="How did that feel?">
      <p className="text-xs tracking-[0.22em] text-[var(--muted)]">HOW DID THAT FEEL?</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`rounded-2xl border px-1 py-3 text-sm transition-colors ${selected(rating === option.id)}`}
            onClick={() => onRate({ difficultyRating: option.id, rir, formQuality: form })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {[0, 1, 2, 3].map((value) => (
          <button
            key={value}
            type="button"
            className={`flex-1 rounded-2xl border py-3 text-sm transition-colors ${selected(rir === value)}`}
            onClick={() => onRate({ difficultyRating: rating, rir: value, formQuality: form })}
          >
            RIR {value === 3 ? '3+' : value}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`mt-2 w-full rounded-2xl border py-3 text-sm transition-colors ${selected(form === 'poor')}`}
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
  const hold = view.measure === 'seconds';
  const step = hold ? 5 : 1;
  const unit = unitSuffix(view.measure);
  const targets = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => Math.max(step, view.prescribedTarget + (i - 3) * step)).filter(
        (value, index, all) => all.indexOf(value) === index,
      ),
    [view.prescribedTarget, step],
  );

  return (
    <BottomSheet open={open} title="WORKOUT CONTROLS" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {paused ? (
          <Button
            variant="accent"
            onClick={() => {
              controls.resume();
              onClose();
            }}
          >
            Resume
          </Button>
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
          − {hold ? `${step}s` : 'Rep'}
        </Button>
        <Button variant="ghost" onClick={controls.addRep}>
          + {hold ? `${step}s` : 'Rep'}
        </Button>
      </div>
      {restMode ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[15, 30, 60].map((seconds) => (
            <Button key={seconds} variant="quiet" onClick={() => controls.extendRest(seconds)}>
              +{seconds}s rest
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
            className={`rounded-full border px-4 py-2 tabular-nums ${
              reps === view.actualTarget
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--line)]'
            }`}
            onClick={() => controls.setTarget(reps)}
          >
            {reps}
            {unit}
          </button>
        ))}
      </div>
      <Button variant="danger" className="mt-6 w-full" onClick={controls.endWorkout}>
        End workout
      </Button>
    </BottomSheet>
  );
}
