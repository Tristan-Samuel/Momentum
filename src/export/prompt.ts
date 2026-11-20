import type { BackupEnvelope } from '@/database/backup';
import type { Measure, Tempo } from '@/types';

const RATINGS: Record<string, string> = {
  too_easy: 'too easy',
  good: 'good',
  hard: 'hard',
  too_hard: 'too hard',
};

const SIDE_ORDER: Record<string, string> = {
  'right-then-left': 'right then left',
  'left-then-right': 'left then right',
  alternating: 'alternating sides',
};

type Row = Record<string, unknown>;

export function aiPromptFilename(date = new Date()): string {
  return `momentum-prompt-${date.toISOString().slice(0, 10)}.txt`;
}

/** A full training log written so another model can answer questions about it. */
export function buildAiPrompt(envelope: BackupEnvelope): string {
  const tables = envelope.tables;
  const programs = rows(tables.workoutPrograms).sort(byOrderThenName);
  const exercises = rows(tables.exercises);
  const configs = rows(tables.exerciseConfigurations);
  const progress = rows(tables.progressionStates);
  const sessions = rows(tables.workoutSessions)
    .filter((row) => str(row, 'status') !== 'discarded')
    .sort((a, b) => str(b, 'startedAt').localeCompare(str(a, 'startedAt')));
  const exerciseSessions = rows(tables.exerciseSessions);
  const sets = rows(tables.setSessions);
  const records = rows(tables.personalRecords).sort((a, b) =>
    str(b, 'achievedAt').localeCompare(str(a, 'achievedAt')),
  );
  const settings = rows(tables.appSettings).find((row) => row.id === 'app');
  const goal = settings ? num(settings, 'weeklyGoal', 3) : 3;
  const exerciseName = new Map(exercises.map((row) => [str(row, 'id'), str(row, 'name', 'Exercise')]));

  const lines: string[] = [
    'This is a complete export of one person’s Momentum training log.',
    `Exported ${when(envelope.exportedAt)}.`,
    'Paste it into an AI, then ask about their exercises, sessions, plateaus, or what to change.',
    '',
    'Instructions for the model:',
    '- Answer only from this log. If a fact is not here, say it is not in the log.',
    '- Do not invent sessions, reps, holds, or personal records.',
    '- Rest is only between sets of the same exercise. Transition is the only gap between exercises.',
    '- Start position "bottom" means the rep starts with the lift (pull-ups, chin-ups, rows).',
    '- Start position "top" means the rep starts by lowering (push-ups, squats, dips).',
    '- Tempo is seconds, written eccentric-bottom pause-concentric-top pause.',
    '- Measure "seconds" is an isometric hold. Measure "reps" is a tempo set.',
    '- RIR is reps in reserve. Ratings are too easy, good, hard, and too hard.',
    '- For one-sided exercises, use the weaker side when you talk about progression.',
    `- Weekly goal: ${goal} completed workout${goal === 1 ? '' : 's'}, Monday through Sunday.`,
    '',
    '# Programs',
  ];

  if (programs.length === 0) lines.push('No programs.');
  for (const program of programs) {
    lines.push('', `## ${str(program, 'name', 'Program')}`);
    const mine = configs
      .filter((row) => str(row, 'programId') === str(program, 'id'))
      .sort((a, b) => num(a, 'order') - num(b, 'order'));
    if (mine.length === 0) {
      lines.push('No exercises.');
      continue;
    }
    mine.forEach((config, index) => {
      const name = exerciseName.get(str(config, 'exerciseId')) || 'Exercise';
      const state = progress.find((row) => str(row, 'exerciseId') === str(config, 'exerciseId'));
      lines.push(`${index + 1}. ${prescription(name, config)}`);
      if (state) lines.push(`   ${progressionLine(state, measureOf(config))}`);
    });
  }

  lines.push('', '# Sessions');
  if (sessions.length === 0) lines.push('No workouts.');
  for (const session of sessions) {
    const status = str(session, 'status', 'completed').replace('_', ' ');
    const duration = minutes(num(session, 'durationMs'));
    lines.push(
      '',
      `## ${when(str(session, 'startedAt'))} — ${str(session, 'programNameSnapshot', 'Workout')} — ${status}${duration ? ` — ${duration}` : ''}`,
    );
    const mine = exerciseSessions
      .filter((row) => str(row, 'workoutSessionId') === str(session, 'id'))
      .sort((a, b) => num(a, 'order') - num(b, 'order'));
    if (mine.length === 0) {
      lines.push('No exercises logged.');
      continue;
    }
    for (const exercise of mine) {
      const snapshot = objectOf(exercise.configSnapshot);
      const measure = measureOf(snapshot ?? {});
      lines.push(`- ${str(exercise, 'nameSnapshot', 'Exercise')}${snapshot ? ` — ${prescriptionBits(snapshot)}` : ''}`);
      const targets = numberList(exercise.targetRepsPerSet);
      if (targets.length) lines.push(`  Targets: ${targets.map((value) => amount(value, measure)).join(', ')}`);
      const mineSets = sets
        .filter((row) => str(row, 'exerciseSessionId') === str(exercise, 'id'))
        .sort((a, b) => num(a, 'setIndex') - num(b, 'setIndex'));
      for (const set of mineSets) lines.push(`  ${setLine(set, measure)}`);
      const feedback = feedbackLine(exercise);
      if (feedback) lines.push(`  ${feedback}`);
    }
  }

  lines.push('', '# Personal records');
  if (records.length === 0) lines.push('None recorded.');
  for (const record of records) {
    const name = exerciseName.get(str(record, 'exerciseId')) || 'Exercise';
    const kind = str(record, 'kind') === 'best_workout_reps' ? 'best workout' : 'best set';
    const label = str(record, 'resistanceLabel');
    lines.push(
      `- ${name}: ${kind} ${num(record, 'value')} reps${label ? `, ${label}` : ''}, ${when(str(record, 'achievedAt'))}`,
    );
  }

  lines.push('', 'The sections above are the whole record.');
  return lines.join('\n');
}

function prescription(name: string, config: Row): string {
  const label = str(config, 'resistanceLabel');
  return `${name}${label ? ` (${label})` : ''}. ${prescriptionBits(config)}.`;
}

function prescriptionBits(config: Row): string {
  const measure = measureOf(config);
  const hold = measure === 'seconds';
  const sets = num(config, 'sets', 1);
  const range = `${amount(num(config, 'minReps'), measure)}–${amount(num(config, 'maxReps'), measure)}`;
  const sides = str(config, 'laterality') === 'unilateral';
  const tempo = tempoText(config.tempo);
  const start = str(config, 'startPosition') === 'bottom' ? 'starts at the bottom' : 'starts at the top';
  const parts = [
    `${sets} × ${range}${hold ? ' hold' : ''}${sides ? ' per side' : ''}`,
    tempo ? `tempo ${tempo}` : '',
    hold ? '' : start,
    `rest ${num(config, 'restAfterSetSeconds')}s`,
    `transition ${num(config, 'transitionAfterExerciseSeconds')}s`,
    `target RIR ${num(config, 'targetRirMin')}–${num(config, 'targetRirMax')}`,
  ];
  if (sides) {
    const order = SIDE_ORDER[str(config, 'unilateralOrder')] ?? 'right then left';
    parts.push(order);
  }
  return parts.filter(Boolean).join(', ');
}

function progressionLine(state: Row, measure: Measure): string {
  const bits = [`Today ${listAmounts(numberList(state.currentTargets), measure) || '—'}`];
  const last = numberList(state.lastCompletedReps);
  if (last.length) {
    const rating = RATINGS[str(state, 'lastDifficultyRating')];
    const rir = state.lastRir;
    const form = str(state, 'lastFormQuality');
    const notes = [
      rating,
      typeof rir === 'number' ? `RIR ${rir}` : '',
      form ? `form ${form}` : '',
    ].filter(Boolean);
    bits.push(`last time ${listAmounts(last, measure)}${notes.length ? ` (${notes.join(', ')})` : ''}`);
  }
  const next = numberList(state.recommendedNextTargets);
  const change = objectOf(state.recommendedResistanceChange);
  if (next.length || change) {
    const suggestion = change ? str(change, 'suggestion') : '';
    const type = change ? str(change, 'type') : '';
    bits.push(
      `next ${listAmounts(next, measure) || '—'}${type ? `, ${type}` : ''}${suggestion ? `: ${suggestion}` : ''}`,
    );
  }
  const best = num(state, 'personalBestReps');
  if (best > 0) {
    const on = str(state, 'personalBestDate');
    bits.push(`best set ${amount(best, measure)}${on ? ` on ${when(on)}` : ''}`);
  }
  bits.push(`${num(state, 'lifetimeReps')} lifetime reps in ${num(state, 'lifetimeSets')} sets`);
  return bits.join('. ') + '.';
}

function setLine(set: Row, measure: Measure): string {
  const index = num(set, 'setIndex') + 1;
  if (set.skipped === true) return `Set ${index}: skipped`;
  const left = set.leftReps;
  const right = set.rightReps;
  const done =
    typeof left === 'number' || typeof right === 'number'
      ? `left ${amount(num(set, 'leftReps'), measure)}, right ${amount(num(set, 'rightReps'), measure)}`
      : amount(num(set, 'completedReps'), measure);
  const target = amount(num(set, 'actualTarget'), measure);
  const reduced = set.targetReduced === true ? `, target reduced from ${amount(num(set, 'prescribedTarget'), measure)}` : '';
  const restPlanned = set.restSecondsPlanned;
  const restActual = set.restSecondsActual;
  const rest =
    typeof restActual === 'number'
      ? `, rest ${restActual}s${typeof restPlanned === 'number' ? ` of ${restPlanned}s` : ''}`
      : '';
  return `Set ${index}: ${done} (target ${target}${reduced})${rest}`;
}

function feedbackLine(exercise: Row): string {
  const rating = RATINGS[str(exercise, 'difficultyRating')];
  const rir = exercise.rir;
  const form = str(exercise, 'formQuality');
  const bits = [
    rating ? `rating ${rating}` : '',
    typeof rir === 'number' ? `RIR ${rir}` : '',
    form ? `form ${form}` : '',
  ].filter(Boolean);
  return bits.join(', ');
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((row): row is Row => !!row && typeof row === 'object') : [];
}

function objectOf(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : null;
}

function str(row: Row, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' ? value : fallback;
}

function num(row: Row, key: string, fallback = 0): number {
  const value = row[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

function measureOf(row: Row): Measure {
  return row.measure === 'seconds' ? 'seconds' : 'reps';
}

function amount(value: number, measure: Measure): string {
  return measure === 'seconds' ? `${value}s` : String(value);
}

function listAmounts(values: number[], measure: Measure): string {
  return values.map((value) => amount(value, measure)).join(', ');
}

function tempoText(value: unknown): string {
  const tempo = objectOf(value);
  if (!tempo) return '';
  const parts: Array<keyof Tempo> = ['eccentric', 'bottomPause', 'concentric', 'topPause'];
  return parts.map((key) => num(tempo, key)).join('-');
}

function when(iso: string): string {
  if (!iso) return 'unknown time';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

function minutes(ms: number): string {
  if (ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const whole = Math.floor(total / 60);
  const seconds = total % 60;
  if (whole <= 0) return `${seconds}s`;
  return seconds ? `${whole}m ${seconds}s` : `${whole}m`;
}

function byOrderThenName(a: Row, b: Row): number {
  const order = num(a, 'order') - num(b, 'order');
  return order || str(a, 'name').localeCompare(str(b, 'name'));
}
