import { NOTE_TAGS } from '../data/routines';
import { persistenceService } from '../services/persistenceService.web';
import type { DailyEntry, DailyNoteState, NoteTag, RoutineId, ScreenId } from '../types/routine';
import { getLocalDateKey, getProgressionWeek } from '../utils/date';
import { getResolvedRoutineForDate, getRoutineCompletionRatio } from '../utils/routine';
import { buildStatsSummary } from '../utils/stats';

interface State {
  activeScreen: ScreenId;
  entries: Record<string, DailyEntry>;
  programStartDate: string;
  error?: string;
}

const state: State = {
  activeScreen: 'morning',
  entries: {},
  programStartDate: getLocalDateKey(),
};

function createEmptyEntry(date: string): DailyEntry {
  return {
    date,
    routines: {
      morning: { completedExerciseIds: [] },
      night: { completedExerciseIds: [] },
    },
    note: {
      tags: [],
      text: '',
    },
  };
}

function getTodayEntry(): DailyEntry {
  const today = getLocalDateKey();
  return state.entries[today] ?? createEmptyEntry(today);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderTabs(): string {
  const tabs: Array<{ id: ScreenId; label: string }> = [
    { id: 'morning', label: 'Morning' },
    { id: 'night', label: 'Night' },
    { id: 'notes', label: 'Notes' },
    { id: 'stats', label: 'Stats' },
  ];

  return `<div class="tabs">${tabs
    .map(
      (tab) =>
        `<button class="tab ${state.activeScreen === tab.id ? 'active' : ''}" data-action="switch" data-screen="${tab.id}">${tab.label}</button>`
    )
    .join('')}</div>`;
}

function renderRoutine(routineId: RoutineId): string {
  const date = getLocalDateKey();
  const routine = getResolvedRoutineForDate(routineId, state.programStartDate, date);
  const completedSet = new Set(getTodayEntry().routines[routineId].completedExerciseIds);
  const progress = getRoutineCompletionRatio(Array.from(completedSet), routine);
  const progressionWeek = getProgressionWeek(state.programStartDate, date) + 1;

  return `
    <section class="card">
      <h2>${escapeHtml(routine.title)}</h2>
      <p>${escapeHtml(routine.description)}</p>
      <p><strong>Week ${progressionWeek}</strong> · ${Math.round(progress * 100)}% complete</p>
      <div class="progress-track"><div class="progress-fill" style="width:${progress * 100}%"></div></div>
      ${routine.sections
        .map(
          (section) => `
            <div class="section">
              <h3 class="section-title">${escapeHtml(section.title)}</h3>
              <div class="list">
                ${section.exercises
                  .map(
                    (exercise) => `
                      <button class="exercise ${completedSet.has(exercise.id) ? 'checked' : ''}" data-action="toggle" data-routine="${routineId}" data-exercise="${exercise.id}">
                        <span>${escapeHtml(exercise.title)}</span>
                        <strong>${escapeHtml(exercise.targetLabel)}</strong>
                      </button>`
                  )
                  .join('')}
              </div>
            </div>`
        )
        .join('')}
    </section>`;
}

function renderNotes(): string {
  const note = getTodayEntry().note;
  return `
    <section class="card">
      <h2>Notes</h2>
      <p>${note.tags.length ? `Today feels: ${note.tags.map(escapeHtml).join(', ')}` : 'Pick quick notes or add detail below.'}</p>
      <div class="tag-row">
        ${NOTE_TAGS.map(
          (tag) => `<button class="tag ${note.tags.includes(tag) ? 'active' : ''}" data-action="tag" data-tag="${tag}">${tag}</button>`
        ).join('')}
      </div>
      <textarea id="note-input" placeholder="Anything to remember about today?">${escapeHtml(note.text)}</textarea>
      <div class="section">
        <button class="btn primary" data-action="save-note">Save note</button>
      </div>
    </section>`;
}

function ratioColor(ratio: number): string {
  if (ratio >= 1) return 'var(--primary)';
  if (ratio >= 0.5) return 'color-mix(in oklab, var(--primary) 55%, var(--bg) 45%)';
  if (ratio > 0) return 'color-mix(in oklab, var(--primary) 25%, var(--bg) 75%)';
  return 'var(--bg)';
}

function renderStats(): string {
  const stats = buildStatsSummary(state.entries, state.programStartDate);

  return `
    <section class="card">
      <h2>Stats</h2>
      <div class="grid">
        <div class="metric"><strong>${stats.totalWorkoutsCompleted}</strong><span>Workouts completed</span></div>
        <div class="metric"><strong>${stats.totalPullUpsCompleted}</strong><span>Pull-ups completed</span></div>
        <div class="metric"><strong>${stats.streaks.current}d</strong><span>Current streak</span></div>
        <div class="metric"><strong>${stats.weeklyCompletionPercentage}%</strong><span>Weekly completion</span></div>
      </div>
    </section>
    <section class="card">
      <h3 class="section-title">Calendar heatmap</h3>
      <div class="heatmap">
        ${stats.heatmap.map((cell) => `<div class="heat" title="${cell.date}: ${Math.round(cell.ratio * 100)}%" style="background:${ratioColor(cell.ratio)}"></div>`).join('')}
      </div>
    </section>
    <section class="card">
      <h3 class="section-title">Completion graph</h3>
      ${stats.completionBars
        .map(
          (bar) => `<div class="bar"><span class="small">${bar.label}</span><div class="bar-track"><div class="bar-fill" style="width:${bar.ratio * 100}%"></div></div><strong>${Math.round(bar.ratio * 100)}%</strong></div>`
        )
        .join('')}
      <p>Best streak: ${stats.streaks.best} days</p>
    </section>`;
}

function renderScreen(): string {
  if (state.activeScreen === 'notes') return renderNotes();
  if (state.activeScreen === 'stats') return renderStats();
  return renderRoutine(state.activeScreen);
}

function renderApp(): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <header class="card">
      <h1>Momentum</h1>
      <p>${getLocalDateKey()} · Program started ${state.programStartDate}</p>
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ''}
      ${renderTabs()}
    </header>
    ${renderScreen()}
  `;
}

function upsertEntry(nextEntry: DailyEntry): void {
  state.entries[nextEntry.date] = nextEntry;
}

async function toggleExercise(routineId: RoutineId, exerciseId: string): Promise<void> {
  const date = getLocalDateKey();
  const entry = state.entries[date] ?? createEmptyEntry(date);
  const ids = new Set(entry.routines[routineId].completedExerciseIds);
  const completed = !ids.has(exerciseId);

  if (completed) {
    ids.add(exerciseId);
  } else {
    ids.delete(exerciseId);
  }

  upsertEntry({
    ...entry,
    routines: {
      ...entry.routines,
      [routineId]: {
        completedExerciseIds: Array.from(ids),
        updatedAt: new Date().toISOString(),
      },
    },
  });

  renderApp();
  await persistenceService.saveExerciseCompletion({ date, routineId, exerciseId, completed });
}

async function saveNote(note: DailyNoteState): Promise<void> {
  const date = getLocalDateKey();
  const entry = state.entries[date] ?? createEmptyEntry(date);
  const nextEntry: DailyEntry = {
    ...entry,
    note: {
      ...note,
      updatedAt: new Date().toISOString(),
    },
  };

  upsertEntry(nextEntry);
  renderApp();
  await persistenceService.saveNote(date, nextEntry.note);
}

function bindEvents(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const actionEl = target?.closest<HTMLElement>('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;

    if (action === 'switch') {
      state.activeScreen = actionEl.dataset.screen as ScreenId;
      renderApp();
      return;
    }

    if (action === 'tag') {
      const tag = actionEl.dataset.tag as NoteTag;
      const note = getTodayEntry().note;
      const tags = note.tags.includes(tag) ? note.tags.filter((item) => item !== tag) : [...note.tags, tag];
      upsertEntry({ ...getTodayEntry(), note: { ...note, tags } });
      renderApp();
      return;
    }

    if (action === 'toggle') {
      void toggleExercise(actionEl.dataset.routine as RoutineId, actionEl.dataset.exercise ?? '');
      return;
    }

    if (action === 'save-note') {
      const input = document.getElementById('note-input') as HTMLTextAreaElement | null;
      const current = getTodayEntry().note;
      void saveNote({ tags: current.tags, text: input?.value ?? '' });
    }
  });
}

async function bootstrap(): Promise<void> {
  try {
    const snapshot = await persistenceService.initialize();
    state.programStartDate = snapshot.programStartDate;
    state.entries = snapshot.entries.reduce<Record<string, DailyEntry>>((acc, entry) => {
      acc[entry.date] = entry;
      return acc;
    }, {});
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Could not load saved data.';
  }

  bindEvents();
  renderApp();
}

void bootstrap();
