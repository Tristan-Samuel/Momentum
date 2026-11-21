import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { Stepper } from '@/components/ui/Stepper';
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
import { phaseOrder } from '@/utils/tempo';
import type { DifficultyRating, FormQuality, StartPosition, TempoPhase } from '@/types';
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
            {view.resistanceLabel ? (
              <p className="mt-1 text-sm text-[var(--muted)]">{view.resistanceLabel}</p>
            ) : null}
            {view.canRate && view.ratingExerciseName && view.ratingExerciseName !== view.exerciseName ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Next exercise. Rate {view.ratingExerciseName} below before it starts.
              </p>
            ) : null}
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
            {view.measure === 'reps' && !view.openSet ? <span> · Tempo {view.tempoCompact}</span> : null}
          </p>
        </div>

        {view.side ? (
          <p className="mt-4 self-start rounded-full bg-[var(--accent-soft)] px-3 py-1 text-sm font-medium tracking-[0.14em] text-[var(--accent)]">
            {view.side === 'right' ? 'RIGHT SIDE' : 'LEFT SIDE'}
          </p>
        ) : null}

        <div className="flex flex-1 flex-col items-center justify-center py-6">
          {kind === 'set_active' && view.openSet ? (
            <OpenSetLogger
              key={`${view.exerciseIndex}-${view.setIndex}`}
              view={view}
              onDone={controls.completeOpenSet}
            />
          ) : (
            <PrimaryStage view={view} kind={kind} />
          )}
        </div>

        {kind === 'set_active' && view.measure === 'reps' && !view.openSet ? (
          <div className="space-y-4">
            <TempoBar phase={view.phase} tempo={view.tempoCompact} startPosition={view.startPosition} />
            <ProgressBar
              value={view.currentRep}
              max={view.actualTarget}
              label={`Rep ${view.currentRep} of ${view.actualTarget}`}
            />
            {view.upcomingGap ? <GapLine gap={view.upcomingGap} /> : null}
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
            key={`${view.ratingExerciseName}-${view.exerciseIndex}`}
            name={view.ratingExerciseName}
            note={view.ratingNote}
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

const PHASE_LABEL: Record<TempoPhase, string> = {
  eccentric: 'Lower',
  bottomPause: 'Pause',
  concentric: 'Lift',
  topPause: 'Hold',
};

function TempoBar({
  phase,
  tempo,
  startPosition,
}: {
  phase: TempoPhase | null;
  tempo: string;
  startPosition: StartPosition;
}) {
  const [eccentric, bottomPause, concentric, topPause] = tempo.split('-').map(Number);
  const seconds: Record<TempoPhase, number> = {
    eccentric,
    bottomPause,
    concentric,
    topPause,
  };
  return (
    <div className="grid grid-cols-4 gap-1.5" aria-label={`Tempo ${tempo}`}>
      {phaseOrder(startPosition).map((id) => {
        const active = id === phase;
        const skipped = seconds[id] === 0;
        return (
          <div
            key={id}
            className={`rounded-2xl px-2 py-2 text-center transition-colors ${
              active
                ? phaseTone(id)
                : skipped
                  ? 'text-[var(--muted)] opacity-40'
                  : 'bg-[var(--line)]/50 text-[var(--muted)]'
            }`}
          >
            <p className="text-xs tracking-[0.12em] uppercase">{PHASE_LABEL[id]}</p>
            <p className="text-sm tabular-nums">{seconds[id] ?? 0}s</p>
          </div>
        );
      })}
    </div>
  );
}

function phaseTone(phase: TempoPhase): string {
  if (phase === 'eccentric') return 'bg-[var(--warn)] text-white';
  if (phase === 'concentric') return 'bg-[var(--accent)] text-white';
  return 'bg-[var(--rest)] text-white';
}

function phaseColor(phase: TempoPhase | null): string {
  if (phase === 'eccentric') return 'var(--warn)';
  if (phase === 'concentric') return 'var(--accent)';
  return 'var(--rest)';
}

function phaseRingLabel(phase: TempoPhase | null): string {
  if (phase === 'eccentric') return 'LOWER';
  if (phase === 'concentric') return 'LIFT';
  if (phase === 'bottomPause') return 'PAUSE';
  if (phase === 'topPause') return 'HOLD';
  return 'REP';
}

function GapLine({ gap }: { gap: NonNullable<WorkoutView['upcomingGap']> }) {
  const label = gap.kind === 'transition' ? 'transition' : 'rest';
  return (
    <p className="text-center text-sm text-[var(--muted)]">
      Then {formatClock(gap.seconds)} {label}
    </p>
  );
}

function OpenSetLogger({
  view,
  onDone,
}: {
  view: WorkoutView;
  onDone: (reps: number, sides?: { left: number; right: number }) => void;
}) {
  const [reps, setReps] = useState(view.actualTarget);
  const [left, setLeft] = useState(view.actualTarget);
  const [right, setRight] = useState(view.actualTarget);
  const unilateral = view.laterality === 'unilateral';
  return (
    <div className="w-full max-w-sm text-center">
      <p className="text-xs tracking-[0.22em] text-[var(--muted)]">LOAD</p>
      <p className="mt-2 text-5xl font-semibold tracking-tight">{view.resistanceLabel || 'Bodyweight'}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">Target {formatAmount(view.actualTarget, view.measure)}</p>
      {unilateral ? (
        <div className="mt-6 grid grid-cols-2 gap-3 text-left">
          <Stepper label="Left" value={left} min={0} max={100} onChange={setLeft} />
          <Stepper label="Right" value={right} min={0} max={100} onChange={setRight} />
        </div>
      ) : (
        <div className="mt-6 text-left">
          <Stepper label="Reps" value={reps} min={0} max={100} onChange={setReps} />
        </div>
      )}
      <Button
        variant="accent"
        className="mt-6 w-full"
        onClick={() => (unilateral ? onDone(Math.min(left, right), { left, right }) : onDone(reps))}
      >
        Set done
      </Button>
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
      return 'TRANSITION';
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
  const running = view.kind !== 'paused';
  if (kind === 'paused') {
    return (
      <div className="text-center">
        <p className="text-5xl font-semibold">Paused</p>
        <p className="mt-3 text-[var(--muted)]">Open Controls to resume. Time stays held.</p>
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
          key={`switch-${view.side ?? 'mid'}`}
          remaining={view.holdRemaining}
          total={3}
          running={running}
          label="SWITCH SIDES"
          format="seconds"
          approaching
          caption={running ? undefined : 'Held'}
        />
      );
    }
    return (
      <RingCountdown
        key={`hold-${view.setIndex}-${view.side ?? 'both'}`}
        remaining={view.holdRemaining}
        total={Math.max(1, view.actualTarget)}
        running={running}
        label="HOLD"
        approaching={view.holdRemaining <= 3}
        color="var(--accent)"
        caption={running ? undefined : 'Held'}
      />
    );
  }
  if (kind === 'set_active') {
    return (
      <RingCountdown
        key={`${view.currentRep}-${view.phase ?? 'rep'}-${view.side ?? ''}`}
        remaining={view.phaseRemaining}
        total={Math.max(0.001, view.phaseDuration)}
        running={running}
        label={phaseRingLabel(view.phase)}
        format="seconds"
        color={phaseColor(view.phase)}
        centerLabel={`Rep ${view.currentRep} of ${view.actualTarget}`}
        center={
          <>
            <p className="text-8xl font-semibold tabular-nums leading-none">{view.currentRep}</p>
            <p className="mt-1 text-base tabular-nums text-[var(--muted)]">of {view.actualTarget}</p>
          </>
        }
        caption={running ? undefined : 'Held'}
      />
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
        key={`${kind}-${view.exerciseIndex}-${view.setIndex}-${total}`}
        remaining={remaining}
        total={total}
        running={running}
        label={kind === 'resting' ? 'REST' : 'TRANSITION'}
        approaching={view.approaching}
        caption={
          kind === 'exercise_transition'
            ? running
              ? 'Between exercises'
              : 'Held'
            : running
              ? 'Between sets'
              : 'Held'
        }
      />
    );
  }
  return null;
}

function RatingRow({
  name,
  note,
  rating,
  rir,
  form,
  onRate,
}: {
  name: string;
  note: string;
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
    <section className="animate-fade-up mt-6 rounded-3xl border border-[var(--line)] p-4" aria-label={`Rate ${name}`}>
      <p className="text-xs tracking-[0.22em] text-[var(--muted)]">RATE {name.toUpperCase()}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">Saved on this exercise only. It changes the next session.</p>
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
      {note ? <p className="mt-3 text-sm leading-relaxed">{note}</p> : null}
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
