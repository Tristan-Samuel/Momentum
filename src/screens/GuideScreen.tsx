type Section = {
  title: string;
  body: string[];
};

const SECTIONS: Section[] = [
  {
    title: 'What this is',
    body: [
      'Momentum is a local workout coach for one person on one device. Open it, press Start, and it runs the session: countdown, tempo metronome, rest, transitions, and the next recommended targets.',
      'There is no account, no backend, and no cloud sync. Programs, sessions, records, and settings live only on this device.',
    ],
  },
  {
    title: 'How a workout runs',
    body: [
      'Home shows today’s sets and reps for each exercise. Start workout unlocks audio and begins a 3-2-1 countdown.',
      'During a set, follow the metronome through Lower, Pause, Lift, and Hold. When the set ends, confirm or edit completed reps from Controls if you need to.',
      'After each exercise, rate how it felt (too easy / good / hard / too hard), RIR, and optional poor form. Those ratings feed next-session targets.',
      'Rest is the timer between sets of the same exercise. Transition is the countdown after an exercise ends, before the next one starts. Review shows the session summary and any progression to apply.',
    ],
  },
  {
    title: 'Controls',
    body: [
      'Pause freezes the current phase. Skip set logs the set as skipped. Reduce target lowers today’s count mid-set. Finish early or abort ends the workout.',
      'If you leave mid-session, Home offers Resume or Discard. Discard does not keep the partial session.',
    ],
  },
  {
    title: 'Tempo, range, and RIR',
    body: [
      'Tempo is written eccentric-bottom-concentric-top in seconds: lower, pause at the bottom, lift, pause at the top. Chin-up 3-0-1-0 is 3 seconds down, no pause, 1 second up, no hold at the top.',
      'Min / max is the training range, not today’s count. The first session starts near the middle of the range (chin-up 6–10 starts at 2 × 8).',
      'RIR is reps in reserve — how many more you could have done with good form. Target 1–2 means stop 1 or 2 reps short of failure. Rate this after each exercise. RIR 0 holds the current targets.',
    ],
  },
  {
    title: 'Progression',
    body: [
      'After each exercise, Momentum looks at completed reps, RIR, difficulty, and form.',
      'Hold the current resistance if the set was too hard, RIR was 0, form was poor, you missed the minimum, you reduced the target, or performance dropped sharply from last time.',
      'Add 1 rep to any set that hit its target, up to max reps.',
      'Increase difficulty when every set hits max reps with acceptable effort, then reset targets toward the bottom of the range. On Review you can apply a suggested next resistance label (for example Bodyweight+).',
      'Unilateral work (pistol squat) uses the weaker-leg rep count for progression.',
    ],
  },
  {
    title: 'Screens',
    body: [
      'Home: next workout card, last session, completed-workout count.',
      'Workout: full-screen runner with countdown, set, rest, and transition.',
      'Review: post-workout summary and apply-progression prompt.',
      'History: past sessions and per-session detail. Delete a workout there if a log was a mistake.',
      'Progress: rep and resistance trends plus personal records.',
      'Program: rename the program, edit exercises, sets, tempo, rest, laterality, and today’s targets.',
      'Settings: theme, sound, haptics, wake lock, notifications, accessibility, and reset all progress.',
    ],
  },
  {
    title: 'Deleting progress',
    body: [
      'Delete a single workout from its History page. It leaves History and Progress charts. Today’s targets stay as they are — change them on Program if you need to.',
      'Reset all progress in Settings wipes every workout, personal record, and lifetime total, and returns today’s targets to the middle of each range. Your program and preferences stay.',
    ],
  },
  {
    title: 'Sound, screen, and alerts',
    body: [
      'Keep the screen on during sets so the metronome can keep ticking. Turn Keep screen awake on in Settings.',
      'Test cues in Settings unlock Web Audio. Raise hardware volume. The Silent switch should not mute these tones. If the profile is Silent, tests still play a standard cue.',
      'Rest and transitions can finish in the background. Turn Notifications on if you want a ping when it is time to start again.',
    ],
  },
  {
    title: 'Privacy',
    body: [
      'Everything is stored locally in this app. Nothing is uploaded. Clearing site data in a browser, or deleting the native app, wipes history.',
      'Safari home-screen and the native app do not share storage. Treat them as two separate installs.',
    ],
  },
];

export function GuideScreen() {
  return (
    <main>
      <p className="text-xs tracking-[0.25em] text-[var(--muted)]">GUIDE</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">How it works</h1>
      <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
        A training instrument, not a social app. Use this page whenever you want the full picture.
      </p>
      <div className="mt-10 space-y-10 pb-4">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-sm tracking-[0.18em] text-[var(--muted)]">
              {section.title.toUpperCase()}
            </h2>
            <div className="mt-3 space-y-3 text-[var(--fg)] leading-relaxed">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
