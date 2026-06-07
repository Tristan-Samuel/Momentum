"use strict";
(() => {
  // data/routines.ts
  var NOTE_TAGS = ["difficult", "easy", "tired"];
  var ROUTINES = {
    morning: {
      id: "morning",
      title: "Morning routine",
      description: "Open the app, complete each movement, and keep your momentum.",
      sections: [
        {
          id: "warmup",
          title: "Warmup",
          exercises: [
            { id: "arm-circles", title: "Arm circles", baseTarget: 10, incrementPerWeek: 0, unit: "reps" },
            { id: "shoulder-rolls", title: "Shoulder rolls", baseTarget: 10, incrementPerWeek: 0, unit: "reps" },
            { id: "body-twists", title: "Body twists", baseTarget: 10, incrementPerWeek: 0, unit: "reps" }
          ]
        },
        {
          id: "round-1",
          title: "Round 1",
          exercises: [
            { id: "pull-ups-round-1", title: "Pull-ups", baseTarget: 6, incrementPerWeek: 1, unit: "reps" },
            { id: "push-ups-round-1", title: "Push-ups", baseTarget: 15, incrementPerWeek: 2, unit: "reps" },
            { id: "squats-round-1", title: "Squats", baseTarget: 20, incrementPerWeek: 3, unit: "reps" },
            { id: "plank-round-1", title: "Plank", baseTarget: 30, incrementPerWeek: 10, unit: "seconds" }
          ]
        },
        {
          id: "round-2",
          title: "Round 2",
          exercises: [
            { id: "pull-ups-round-2", title: "Pull-ups", baseTarget: 6, incrementPerWeek: 1, unit: "reps" },
            { id: "push-ups-round-2", title: "Push-ups", baseTarget: 15, incrementPerWeek: 2, unit: "reps" },
            { id: "squats-round-2", title: "Squats", baseTarget: 20, incrementPerWeek: 3, unit: "reps" },
            { id: "plank-round-2", title: "Plank", baseTarget: 30, incrementPerWeek: 10, unit: "seconds" }
          ]
        },
        {
          id: "finish",
          title: "Finish",
          exercises: [
            { id: "dead-hang-finish", title: "Dead hang", baseTarget: 30, incrementPerWeek: 0, unit: "seconds" }
          ]
        }
      ]
    },
    night: {
      id: "night",
      title: "Night routine",
      description: "Reset your posture and recover before the next morning.",
      sections: [
        {
          id: "night-reset",
          title: "Night reset",
          exercises: [
            { id: "dead-hang-night", title: "Dead hang", baseTarget: 30, incrementPerWeek: 0, unit: "seconds" },
            { id: "side-plank-left", title: "Side plank (left)", baseTarget: 20, incrementPerWeek: 0, unit: "seconds" },
            { id: "side-plank-right", title: "Side plank (right)", baseTarget: 20, incrementPerWeek: 0, unit: "seconds" },
            { id: "child-pose", title: "Child pose", baseTarget: 30, incrementPerWeek: 0, unit: "seconds" },
            { id: "hamstring-left", title: "Hamstring stretch (left)", baseTarget: 20, incrementPerWeek: 0, unit: "seconds" },
            { id: "hamstring-right", title: "Hamstring stretch (right)", baseTarget: 20, incrementPerWeek: 0, unit: "seconds" },
            { id: "cat-cow", title: "Cat-cow", baseTarget: 8, incrementPerWeek: 0, unit: "reps" }
          ]
        }
      ]
    }
  };

  // utils/date.ts
  var DAY_IN_MS = 24 * 60 * 60 * 1e3;
  function getLocalDateKey(date = /* @__PURE__ */ new Date()) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function parseDateKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  function differenceInDays(startDateKey, endDateKey) {
    const start = parseDateKey(startDateKey).getTime();
    const end = parseDateKey(endDateKey).getTime();
    return Math.max(0, Math.floor((end - start) / DAY_IN_MS));
  }
  function getProgressionWeek(startDateKey, targetDateKey) {
    return Math.floor(differenceInDays(startDateKey, targetDateKey) / 7);
  }
  function shiftDateKey(dateKey, dayOffset) {
    const shifted = new Date(parseDateKey(dateKey).getTime() + dayOffset * DAY_IN_MS);
    return getLocalDateKey(new Date(shifted));
  }
  function getPastDateKeys(count, endDateKey = getLocalDateKey()) {
    return Array.from({ length: count }, (_, index) => shiftDateKey(endDateKey, index - (count - 1)));
  }

  // services/persistenceService.web.ts
  var STORAGE_KEY = "momentum-web-storage";
  function createEmptyEntry(date) {
    return {
      date,
      routines: {
        morning: { completedExerciseIds: [] },
        night: { completedExerciseIds: [] }
      },
      note: {
        tags: [],
        text: ""
      }
    };
  }
  function readSnapshot() {
    if (typeof localStorage === "undefined") {
      return {
        programStartDate: getLocalDateKey(),
        entries: []
      };
    }
    const current = localStorage.getItem(STORAGE_KEY);
    if (!current) {
      return {
        programStartDate: getLocalDateKey(),
        entries: []
      };
    }
    return JSON.parse(current);
  }
  function writeSnapshot(snapshot) {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }
  function upsertEntry(entries, nextEntry) {
    const filtered = entries.filter((entry) => entry.date !== nextEntry.date);
    return [...filtered, nextEntry].sort((left, right) => left.date.localeCompare(right.date));
  }
  var persistenceService = {
    async initialize() {
      return readSnapshot();
    },
    async saveExerciseCompletion({ date, routineId, exerciseId, completed }) {
      const snapshot = readSnapshot();
      const currentEntry = snapshot.entries.find((entry) => entry.date === date) ?? createEmptyEntry(date);
      const ids = new Set(currentEntry.routines[routineId].completedExerciseIds);
      if (completed) {
        ids.add(exerciseId);
      } else {
        ids.delete(exerciseId);
      }
      writeSnapshot({
        ...snapshot,
        entries: upsertEntry(snapshot.entries, {
          ...currentEntry,
          routines: {
            ...currentEntry.routines,
            [routineId]: {
              completedExerciseIds: Array.from(ids),
              updatedAt: (/* @__PURE__ */ new Date()).toISOString()
            }
          }
        })
      });
    },
    async saveNote(date, note) {
      const snapshot = readSnapshot();
      const currentEntry = snapshot.entries.find((entry) => entry.date === date) ?? createEmptyEntry(date);
      writeSnapshot({
        ...snapshot,
        entries: upsertEntry(snapshot.entries, {
          ...currentEntry,
          note: {
            ...note,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        })
      });
    }
  };

  // utils/routine.ts
  function formatTarget(value, unit) {
    return unit === "seconds" ? `${value} sec` : `\xD7${value}`;
  }
  function resolveRoutineTargets(routine, progressionWeek) {
    return {
      ...routine,
      sections: routine.sections.map((section) => ({
        ...section,
        exercises: section.exercises.map((exercise) => {
          const target = exercise.baseTarget + exercise.incrementPerWeek * progressionWeek;
          return {
            ...exercise,
            target,
            targetLabel: formatTarget(target, exercise.unit)
          };
        })
      }))
    };
  }
  function getResolvedRoutineForDate(routineId, programStartDate, date) {
    return resolveRoutineTargets(ROUTINES[routineId], getProgressionWeek(programStartDate, date));
  }
  function flattenExerciseIds(routine) {
    return routine.sections.flatMap((section) => section.exercises.map((exercise) => exercise.id));
  }
  function getRoutineCompletionRatio(completedExerciseIds, routine) {
    const totalExercises = flattenExerciseIds(routine).length;
    if (!totalExercises) {
      return 0;
    }
    return completedExerciseIds.length / totalExercises;
  }

  // utils/stats.ts
  var COMPLETION_SCALE = 100;
  function isRoutineComplete(entry, routineId, programStartDate, date) {
    if (!entry) {
      return false;
    }
    const routine = getResolvedRoutineForDate(routineId, programStartDate, date);
    const requiredExercises = flattenExerciseIds(routine);
    if (!requiredExercises.length) {
      return false;
    }
    const completedSet = new Set(entry.routines[routineId].completedExerciseIds);
    return requiredExercises.every((exerciseId) => completedSet.has(exerciseId));
  }
  function getDayCompletionRatio(entry, programStartDate, date) {
    const completedRoutines = ["morning", "night"].filter(
      (routineId) => isRoutineComplete(entry, routineId, programStartDate, date)
    ).length;
    return completedRoutines / 2;
  }
  function calculateStreak(entries, programStartDate, currentDate) {
    const sortedDates = Object.keys(entries).sort();
    let current = 0;
    let best = 0;
    let running = 0;
    let previousOrdinal = null;
    for (const date of sortedDates) {
      const ratio = getDayCompletionRatio(entries[date], programStartDate, date);
      if (ratio < 1) {
        running = 0;
        previousOrdinal = null;
        continue;
      }
      const ordinal = Date.parse(`${date}T00:00:00Z`);
      if (previousOrdinal !== null && ordinal - previousOrdinal === 24 * 60 * 60 * 1e3) {
        running += 1;
      } else {
        running = 1;
      }
      previousOrdinal = ordinal;
      best = Math.max(best, running);
    }
    const recentDates = getPastDateKeys(sortedDates.length || 1, currentDate).reverse();
    for (const date of recentDates) {
      if (getDayCompletionRatio(entries[date], programStartDate, date) === 1) {
        current += 1;
      } else {
        break;
      }
    }
    return { current, best };
  }
  function calculateTotalPullUps(entries, programStartDate) {
    return Object.values(entries).reduce((total, entry) => {
      const routine = getResolvedRoutineForDate("morning", programStartDate, entry.date);
      const completed = new Set(entry.routines.morning.completedExerciseIds);
      const completedPullUps = routine.sections.flatMap((section) => section.exercises).filter((exercise) => exercise.title === "Pull-ups" && completed.has(exercise.id)).reduce((sum, exercise) => sum + exercise.target, 0);
      return total + completedPullUps;
    }, 0);
  }
  function calculateCompletedWorkouts(entries, programStartDate) {
    return Object.values(entries).reduce((total, entry) => {
      const completedRoutines = ["morning", "night"].filter(
        (routineId) => isRoutineComplete(entry, routineId, programStartDate, entry.date)
      ).length;
      return total + completedRoutines;
    }, 0);
  }
  function calculateWeeklyCompletion(entries, programStartDate, currentDate) {
    const weekDates = getPastDateKeys(7, currentDate);
    const completedSlots = weekDates.reduce((total, date) => {
      const entry = entries[date];
      const completedRoutines = ["morning", "night"].filter(
        (routineId) => isRoutineComplete(entry, routineId, programStartDate, date)
      ).length;
      return total + completedRoutines;
    }, 0);
    return Math.round(completedSlots / 14 * COMPLETION_SCALE);
  }
  function buildHeatmap(entries, programStartDate, currentDate) {
    return getPastDateKeys(28, currentDate).map((date) => ({
      date,
      ratio: getDayCompletionRatio(entries[date], programStartDate, date)
    }));
  }
  function buildCompletionBars(entries, programStartDate, currentDate) {
    return getPastDateKeys(7, currentDate).map((date) => ({
      date,
      label: date.slice(5),
      ratio: getDayCompletionRatio(entries[date], programStartDate, date)
    }));
  }
  function buildStatsSummary(entries, programStartDate, currentDate = getLocalDateKey()) {
    return {
      totalWorkoutsCompleted: calculateCompletedWorkouts(entries, programStartDate),
      totalPullUpsCompleted: calculateTotalPullUps(entries, programStartDate),
      weeklyCompletionPercentage: calculateWeeklyCompletion(entries, programStartDate, currentDate),
      streaks: calculateStreak(entries, programStartDate, currentDate),
      heatmap: buildHeatmap(entries, programStartDate, currentDate),
      completionBars: buildCompletionBars(entries, programStartDate, currentDate)
    };
  }

  // mobile/main.ts
  var state = {
    activeScreen: "morning",
    entries: {},
    programStartDate: getLocalDateKey()
  };
  function createEmptyEntry2(date) {
    return {
      date,
      routines: {
        morning: { completedExerciseIds: [] },
        night: { completedExerciseIds: [] }
      },
      note: {
        tags: [],
        text: ""
      }
    };
  }
  function getTodayEntry() {
    const today = getLocalDateKey();
    return state.entries[today] ?? createEmptyEntry2(today);
  }
  function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function renderTabs() {
    const tabs = [
      { id: "morning", label: "Morning" },
      { id: "night", label: "Night" },
      { id: "notes", label: "Notes" },
      { id: "stats", label: "Stats" }
    ];
    return `<div class="tabs">${tabs.map(
      (tab) => `<button class="tab ${state.activeScreen === tab.id ? "active" : ""}" data-action="switch" data-screen="${tab.id}">${tab.label}</button>`
    ).join("")}</div>`;
  }
  function renderRoutine(routineId) {
    const date = getLocalDateKey();
    const routine = getResolvedRoutineForDate(routineId, state.programStartDate, date);
    const completedSet = new Set(getTodayEntry().routines[routineId].completedExerciseIds);
    const progress = getRoutineCompletionRatio(Array.from(completedSet), routine);
    const progressionWeek = getProgressionWeek(state.programStartDate, date) + 1;
    return `
    <section class="card">
      <h2>${escapeHtml(routine.title)}</h2>
      <p>${escapeHtml(routine.description)}</p>
      <p><strong>Week ${progressionWeek}</strong> \xB7 ${Math.round(progress * 100)}% complete</p>
      <div class="progress-track"><div class="progress-fill" style="width:${progress * 100}%"></div></div>
      ${routine.sections.map(
      (section) => `
            <div class="section">
              <h3 class="section-title">${escapeHtml(section.title)}</h3>
              <div class="list">
                ${section.exercises.map(
        (exercise) => `
                      <button class="exercise ${completedSet.has(exercise.id) ? "checked" : ""}" data-action="toggle" data-routine="${routineId}" data-exercise="${exercise.id}">
                        <span>${escapeHtml(exercise.title)}</span>
                        <strong>${escapeHtml(exercise.targetLabel)}</strong>
                      </button>`
      ).join("")}
              </div>
            </div>`
    ).join("")}
    </section>`;
  }
  function renderNotes() {
    const note = getTodayEntry().note;
    return `
    <section class="card">
      <h2>Notes</h2>
      <p>${note.tags.length ? `Today feels: ${note.tags.map(escapeHtml).join(", ")}` : "Pick quick notes or add detail below."}</p>
      <div class="tag-row">
        ${NOTE_TAGS.map(
      (tag) => `<button class="tag ${note.tags.includes(tag) ? "active" : ""}" data-action="tag" data-tag="${tag}">${tag}</button>`
    ).join("")}
      </div>
      <textarea id="note-input" placeholder="Anything to remember about today?">${escapeHtml(note.text)}</textarea>
      <div class="section">
        <button class="btn primary" data-action="save-note">Save note</button>
      </div>
    </section>`;
  }
  function ratioColor(ratio) {
    if (ratio >= 1) return "var(--primary)";
    if (ratio >= 0.5) return "color-mix(in oklab, var(--primary) 55%, var(--bg) 45%)";
    if (ratio > 0) return "color-mix(in oklab, var(--primary) 25%, var(--bg) 75%)";
    return "var(--bg)";
  }
  function renderStats() {
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
        ${stats.heatmap.map((cell) => `<div class="heat" title="${cell.date}: ${Math.round(cell.ratio * 100)}%" style="background:${ratioColor(cell.ratio)}"></div>`).join("")}
      </div>
    </section>
    <section class="card">
      <h3 class="section-title">Completion graph</h3>
      ${stats.completionBars.map(
      (bar) => `<div class="bar"><span class="small">${bar.label}</span><div class="bar-track"><div class="bar-fill" style="width:${bar.ratio * 100}%"></div></div><strong>${Math.round(bar.ratio * 100)}%</strong></div>`
    ).join("")}
      <p>Best streak: ${stats.streaks.best} days</p>
    </section>`;
  }
  function renderScreen() {
    if (state.activeScreen === "notes") return renderNotes();
    if (state.activeScreen === "stats") return renderStats();
    return renderRoutine(state.activeScreen);
  }
  function renderApp() {
    const app = document.getElementById("app");
    if (!app) return;
    app.innerHTML = `
    <header class="card">
      <h1>Momentum</h1>
      <p>${getLocalDateKey()} \xB7 Program started ${state.programStartDate}</p>
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
      ${renderTabs()}
    </header>
    ${renderScreen()}
  `;
  }
  function upsertEntry2(nextEntry) {
    state.entries[nextEntry.date] = nextEntry;
  }
  async function toggleExercise(routineId, exerciseId) {
    const date = getLocalDateKey();
    const entry = state.entries[date] ?? createEmptyEntry2(date);
    const ids = new Set(entry.routines[routineId].completedExerciseIds);
    const completed = !ids.has(exerciseId);
    if (completed) {
      ids.add(exerciseId);
    } else {
      ids.delete(exerciseId);
    }
    upsertEntry2({
      ...entry,
      routines: {
        ...entry.routines,
        [routineId]: {
          completedExerciseIds: Array.from(ids),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    });
    renderApp();
    await persistenceService.saveExerciseCompletion({ date, routineId, exerciseId, completed });
  }
  async function saveNote(note) {
    const date = getLocalDateKey();
    const entry = state.entries[date] ?? createEmptyEntry2(date);
    const nextEntry = {
      ...entry,
      note: {
        ...note,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
    upsertEntry2(nextEntry);
    renderApp();
    await persistenceService.saveNote(date, nextEntry.note);
  }
  function bindEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      const actionEl = target?.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === "switch") {
        state.activeScreen = actionEl.dataset.screen;
        renderApp();
        return;
      }
      if (action === "tag") {
        const tag = actionEl.dataset.tag;
        const note = getTodayEntry().note;
        const tags = note.tags.includes(tag) ? note.tags.filter((item) => item !== tag) : [...note.tags, tag];
        upsertEntry2({ ...getTodayEntry(), note: { ...note, tags } });
        renderApp();
        return;
      }
      if (action === "toggle") {
        void toggleExercise(actionEl.dataset.routine, actionEl.dataset.exercise ?? "");
        return;
      }
      if (action === "save-note") {
        const input = document.getElementById("note-input");
        const current = getTodayEntry().note;
        void saveNote({ tags: current.tags, text: input?.value ?? "" });
      }
    });
  }
  async function bootstrap() {
    try {
      const snapshot = await persistenceService.initialize();
      state.programStartDate = snapshot.programStartDate;
      state.entries = snapshot.entries.reduce((acc, entry) => {
        acc[entry.date] = entry;
        return acc;
      }, {});
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Could not load saved data.";
    }
    bindEvents();
    renderApp();
  }
  void bootstrap();
})();
