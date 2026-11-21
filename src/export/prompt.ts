import type { BackupEnvelope } from '@/database/backup';
import { modeLabel, programsForRoutine, resolveRoutine, type ScheduleProgram, type ScheduleSession } from '@/schedule/resolve';
import type { Measure, Routine, RoutineMode, Tempo } from '@/types';

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
    'It covers every program, the schedule, and the training history. Paste it into an AI, then ask about any of that.',
    '',
    'Instructions for the model:',
    '- Answer only from this log. If a fact is not here, say it is not in the log.',
    '- Use every program and the schedule together. A question is not limited to one program.',
    '- Do not invent sessions, reps, holds, loads, or personal records.',
    '- When you suggest a new exercise or a setting change, stay inside "Adding an exercise".',
    '- Rest is only between sets of the same exercise. Transition is the only gap between exercises.',
    '- Start position "bottom" means the rep starts with the lift (pull-ups, chin-ups, rows).',
    '- Start position "top" means the rep starts by lowering (push-ups, squats, dips).',
    '- Tempo is seconds, written eccentric-bottom pause-concentric-top pause.',
    '- Measure "seconds" is an isometric hold. Measure "reps" is a tempo set.',
    '- RIR is reps in reserve. Ratings are too easy, good, hard, and too hard.',
    '- For one-sided exercises, use the weaker side when you talk about progression.',
    `- Weekly goal: ${goal} completed workout${goal === 1 ? '' : 's'}, Monday through Sunday. A routine can have its own weekly count.`,
    ...howTheAppWorks(),
    ...addingAnExercise(settings),
    ...scheduleLines(programs, rows(tables.routines), sessions, envelope.exportedAt),
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

  lines.push('', 'The sections above are the whole record. Every program, the schedule, and the history are included.');
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
    ...settingBits(config),
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

function settingBits(config: Row): string[] {
  const bits: string[] = [];
  if (config.cueMode === 'open') bits.push('open set');
  else if (config.cueMode === 'tempo') bits.push('tempo cues');
  const kind = str(config, 'loadKind');
  const unit = str(config, 'loadUnit', 'lb');
  const per = str(config, 'loadPer') === 'side' ? ' per side' : '';
  if (kind === 'bodyweight') bits.push('bodyweight');
  if (kind === 'added' || kind === 'external') {
    const load = config.load;
    const amount = typeof load === 'number' ? `${load} ${unit}${per}` : unit;
    bits.push(kind === 'added' ? `added load ${amount}` : `external load ${amount}`);
    if (typeof config.loadStep === 'number') bits.push(`load step ${config.loadStep} ${unit}`);
  }
  if (typeof config.progressionStep === 'number') bits.push(`progression step ${config.progressionStep}`);
  return bits;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function howTheAppWorks(): string[] {
  return [
    '',
    '# How the app works',
    'Momentum is a workout coach for one person. Home shows the routines that are on. Start runs that program: a 3-2-1 countdown, each exercise, then review. The phone works offline. A signed-in copy is shared with momentum.tssamuel.com. Nobody else sees the training.',
    '',
    '## A workout',
    '- A program is an ordered list of exercises. Several programs can exist at once.',
    '- measure "reps" is a tempo set or an open set. measure "seconds" is an isometric hold, counted down, with a short switch between sides when it is one-sided.',
    '- cueMode "tempo" follows the metronome: lower, pause at the bottom, lift, hold at the top. Lower and lift use different tones.',
    '- cueMode "open" shows the load and waits. The person lifts at their own pace, logs the reps, then rest starts. Barbell and machine compounds use this. Curls, raises, and bodyweight stay on tempo unless changed. Holds stay on tempo.',
    '- Rest is only the timer between sets of the same exercise. After the last set, transition is the only countdown before the next exercise. There is no extra rest there.',
    '- startPosition "bottom" starts with the lift. Pull-ups, chin-ups, and rows begin at the bottom.',
    '- startPosition "top" starts by lowering. Push-ups, squats, and dips begin at the top.',
    '- Tempo is four seconds: eccentric, bottom pause, concentric, top pause. A chin-up at 3-0-1-0 that starts at the bottom is 1 second up, then 3 seconds down.',
    '- After each exercise the person rates too easy, good, hard, or too hard, plus RIR, and can mark poor form. Each exercise starts with a blank rating. Review says what that rating changed.',
    '- Pause freezes the current phase. Skip set logs the set as skipped. Reduce target lowers today’s count mid-set. Finish early or abort ends the workout. Leaving mid-session offers Resume or Discard. Discard does not keep the partial session.',
    '- One-sided work logs left and right. Progression uses the weaker side.',
    '',
    '## Progression',
    '- Min and max are the training range, not today’s count. The first session starts near the middle of the range. A 6–10 chin-up starts at 8.',
    '- Add the progression step to any set that hit its target, up to the max.',
    '- Hold the current targets when the set was too hard, RIR was 0, form was poor, the minimum was missed, the target was reduced, or performance dropped sharply from last time.',
    '- RIR is how many more reps were left with good form. A target of 1–2 means stop 1 or 2 short of failure. RIR 0 holds the current targets.',
    '- With a numeric load, topping the range suggests the current load plus the load step and resets the reps toward the bottom. Too hard, a missed minimum, or poor form can suggest one step lighter. The person applies that on Review.',
    '- Bodyweight does not change a number. It suggests a harder variation, such as +5 lb.',
    '- The only progression type is rep-range.',
    '',
    '## Schedule',
    '- A routine is one schedule. Morning and night are two routines. Each has its own programs, its own rule, and its own reminder time.',
    '- Rotation: any day. The next program is the one after the last completed or aborted session in that routine’s list. A missed day is not made up. An empty program list means every program, in program order, including programs added later.',
    '- Days: one program, or rest, on each weekday. Sunday is index 0. Monday stays Monday. Skipping Monday does not move Tuesday.',
    '- Shift: a repeating pattern of programs and rest days. The anchor date is day 1. When “shift when I skip” is on, a missed training day stays next until it is done. When it is off, the calendar moves on.',
    '- Per week: no fixed days. Train that many days. The next program comes from the rotation until the count is met. Training after that is still allowed.',
    '- Home shows each routine that is on, in reminder-time order. A rest day says so, and the person can train anyway.',
    '- The weekly goal in settings is a separate Monday–Sunday count. It is not the same number as a routine’s per-week count.',
    '- Delete one workout from History. Today’s targets stay. Reset all progress wipes workouts, records, and lifetime totals, and returns targets to the middle of each range. Programs, exercises, and routines stay.',
  ];
}

function addingAnExercise(settings: Row | undefined): string[] {
  const kilograms = settings ? str(settings, 'weightUnit') === 'kg' : false;
  const unit = kilograms ? 'kg' : 'lb';
  const start = kilograms ? '20 kg' : '45 lb';
  const step = kilograms ? '2.5 kg' : '5 lb';
  return [
    '',
    '# Adding an exercise',
    'These are the fields on a new exercise and the limits of the editor. Use them when you draft a program or change an exercise. Leave a field out only when the default below is the one you want.',
    '',
    `- name: text, up to 80 characters. A blank name becomes "New exercise", or "New hold" for a timed hold.`,
    '- measure: "reps" or "seconds".',
    '  - reps default: 2 sets, min 6, max 10, progression step 1, rest 120 seconds, tempo 3-0-1-0, transition 30 seconds.',
    '  - seconds default: a timed hold. 2 sets, shortest 15 seconds, longest 60 seconds, progression step 5, rest 60 seconds, transition 30 seconds. The add form keeps it bodyweight and on tempo cues. Switching an existing exercise to a hold sets min 15, max 60, and step 5. Switching back to reps sets min 6, max 12, and step 1.',
    '- cueMode, reps only: "tempo" or "open". Default "tempo". "tempo" counts every rep on the metronome. "open" waits for the logged reps, then starts rest. Use "open" for barbell and machine compounds such as squat, bench, deadlift, row, and overhead press. Keep curls, raises, and bodyweight on "tempo" unless asked.',
    '- loadKind: "bodyweight", "added", or "external". Default "bodyweight".',
    '  - bodyweight: the load number is empty. resistanceLabel is the variation, such as "Bodyweight" or "Archer", up to 40 characters.',
    '  - added: extra load on a bodyweight movement, such as a belt or vest.',
    '  - external: the weight itself, such as a bar, dumbbell, or machine.',
    `- load: a number, used when the kind is added or external. A new one starts at ${start}. The editor allows 0 to ${kilograms ? '500 kg' : '1000 lb'}.`,
    `- loadUnit: "lb" or "kg". This person’s new exercises use ${unit}. Each exercise keeps the unit it was added with. Changing the unit converts the load and the load step.`,
    '- loadPer: "total" or "side". Default "total". "side" means the number is for each side.',
    `- loadStep: how much Review adds or removes after the top of the range. Pounds: 2.5 to 45, in steps of 2.5, default 5. Kilograms: 1.25 to 20, in steps of 1.25, default 2.5. This person’s default step is ${step}.`,
    '- sets: 1 to 10. Default 2.',
    '- minReps and maxReps: the training range. Reps allow 1 to 100. Holds allow 1 to 600 seconds. Min cannot be above max.',
    '- restAfterSetSeconds: 0 to 900, edited in steps of 15. Default 120 for reps and 60 for a hold. This timer runs only between sets of this exercise.',
    '- transitionAfterExerciseSeconds: 0 to 600, edited in steps of 15. Default 30. This is the only gap before the next exercise.',
    '- targetRirMin and targetRirMax: 0 to 5. Default 1 and 2. Min cannot be above max.',
    '- progressionStep: reps 1 to 5, default 1. Holds 1 to 30 seconds, default 5. This is how many reps or seconds a hit set gains next time.',
    '- tempo: four integers, each 0 to 10 seconds: eccentric (lower), bottomPause, concentric (lift), topPause. Default 3, 0, 1, 0. Holds do not use tempo.',
    '- startPosition: "top" (lower first) or "bottom" (lift first). Pull-ups, chin-ups, and rows are "bottom". Push-ups, squats, and dips are "top". If it is omitted, the name is used to choose.',
    '- laterality: "bilateral" or "unilateral". Default "bilateral".',
    '- unilateralOrder: "right-then-left", "left-then-right", or "alternating". Default "right-then-left". Alternating is not offered for holds.',
    '- targets: one number per set for the next workout. A new exercise starts near the middle of the range, once per set. The editor can set each one.',
  ];
}

function scheduleLines(programs: Row[], routineRows: Row[], sessions: Row[], exportedAt: string): string[] {
  const lines = [
    '',
    '# Schedule',
    'Routines decide which program Home offers. More than one can be on. An off routine is kept here and is not offered.',
  ];
  const catalog = schedulePrograms(programs);
  const names = new Map(catalog.map((program) => [program.id, program.name]));
  const history = scheduleSessions(sessions);
  const now = new Date(exportedAt);
  const moment = Number.isNaN(now.getTime()) ? new Date() : now;
  const routines = routineRows
    .map(routineOf)
    .filter((routine): routine is Routine => routine !== null)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  if (routines.length === 0) {
    lines.push('No routines.');
    return lines;
  }
  lines.push(`Resolved as of ${when(exportedAt)}.`);
  for (const routine of routines) {
    lines.push('', `## ${routine.name} — ${routine.enabled ? 'on' : 'off'} — ${modeLabel(routine.mode)}`);
    if (routine.mode === 'rotation' || routine.mode === 'weekly_count') lines.push(membership(routine, catalog));
    if (routine.mode === 'weekdays') lines.push(`Days: ${weekdayPlan(routine.weekdays, names)}.`);
    if (routine.mode === 'shift') lines.push(shiftPlan(routine, catalog, names));
    if (routine.mode === 'weekly_count') {
      const count = Math.max(1, Math.min(7, Math.round(routine.weeklyCount || 1)));
      lines.push(`${count} day${count === 1 ? '' : 's'} this week. The next program comes from the rotation until that count is met.`);
    }
    const clock = reminderClock(routine.reminderHour, routine.reminderMinute);
    lines.push(routine.reminderEnabled ? `Reminder ${clock}.` : `Reminder off (${clock} is saved).`);
    if (!routine.enabled) {
      lines.push('Home skips this routine.');
      continue;
    }
    const plan = resolveRoutine({ routine, programs: catalog, sessions: history, now: moment });
    const program = plan.programId ? names.get(plan.programId) || 'a removed program' : 'no program';
    if (plan.status === 'rest') lines.push(`Today: rest. ${plan.detail}.`);
    else if (plan.status === 'done') lines.push(`Today: the weekly count is met. Next program would be ${program}.`);
    else lines.push(`Today: ${program}. ${plan.detail}.`);
  }
  return lines;
}

function schedulePrograms(programs: Row[]): ScheduleProgram[] {
  return programs.map((program) => ({
    id: str(program, 'id'),
    name: str(program, 'name', 'Program'),
    order: num(program, 'order'),
  }));
}

function scheduleSessions(sessions: Row[]): ScheduleSession[] {
  return sessions.map((session) => ({
    programId: str(session, 'programId'),
    startedAt: str(session, 'startedAt'),
    status: str(session, 'status'),
  }));
}

function routineOf(row: Row): Routine | null {
  const id = str(row, 'id');
  if (!id) return null;
  const mode = row.mode;
  const routineMode: RoutineMode =
    mode === 'weekdays' || mode === 'shift' || mode === 'weekly_count' || mode === 'rotation' ? mode : 'rotation';
  return {
    id,
    name: str(row, 'name', 'Routine'),
    order: num(row, 'order'),
    enabled: row.enabled !== false,
    mode: routineMode,
    programIds: stringList(row.programIds),
    weekdays: idOrNullList(row.weekdays, 7),
    shift: idOrNullList(row.shift),
    anchorDate: str(row, 'anchorDate'),
    skipMissed: row.skipMissed === true,
    weeklyCount: num(row, 'weeklyCount', 3) || 3,
    reminderEnabled: row.reminderEnabled === true,
    reminderHour: num(row, 'reminderHour', 7),
    reminderMinute: num(row, 'reminderMinute'),
    createdAt: '',
    updatedAt: '',
    syncStatus: 'local',
  };
}

function membership(routine: Routine, programs: ScheduleProgram[]): string {
  const list = programsForRoutine(routine, programs);
  if (routine.programIds.length === 0) {
    return list.length
      ? `Programs: every program, in order (${list.map((program) => program.name).join(', ')}).`
      : 'Programs: none yet.';
  }
  return list.length
    ? `Programs, in order: ${list.map((program) => program.name).join(', ')}.`
    : 'Programs: none of the selected programs are still in the log.';
}

function weekdayPlan(weekdays: Array<string | null>, names: Map<string, string>): string {
  return DAYS.map((day, index) => {
    const id = weekdays[index];
    return `${day} ${id ? names.get(id) || 'a removed program' : 'rest'}`;
  }).join(', ');
}

function shiftPlan(routine: Routine, programs: ScheduleProgram[], names: Map<string, string>): string {
  const pattern = routine.shift.length > 0 ? routine.shift : programsForRoutine(routine, programs).map((program) => program.id);
  const slots = pattern.map((id) => (id ? names.get(id) || 'a removed program' : 'rest')).join(', ');
  const missed = routine.skipMissed
    ? 'A missed training day stays next until it is done.'
    : 'A missed day is not made up. The calendar moves on.';
  const anchor = routine.anchorDate ? ` Starts ${routine.anchorDate}.` : '';
  return `Pattern: ${slots || 'rest'}.${anchor} ${missed}`;
}

function reminderClock(hour: number, minute: number): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  const m = Math.min(59, Math.max(0, Math.trunc(minute)));
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function idOrNullList(value: unknown, length?: number): Array<string | null> {
  const list = Array.isArray(value) ? value.map((item) => (typeof item === 'string' && item ? item : null)) : [];
  if (length == null) return list;
  const padded = list.slice(0, length);
  while (padded.length < length) padded.push(null);
  return padded;
}
