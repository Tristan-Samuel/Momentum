type Section = {
  title: string;
  body: string[];
};

const SECTIONS: Section[] = [
  {
    title: 'What this is',
    body: [
      'Momentum is a workout coach for one person. Open it, press Start, and it runs the session: countdown, tempo metronome, rest, transitions, and the next recommended targets.',
      'The phone keeps a copy and works offline. Sign in with your tssamuel.com account and that copy is backed up. The website at momentum.tssamuel.com and another phone on the same account share it. A change on one shows up on the other.',
      'This is not a social app. Nobody else sees your training.',
    ],
  },
  {
    title: 'How a workout runs',
    body: [
      'Home shows today’s sets and reps for each exercise. Start workout unlocks audio and begins a 3-2-1 countdown.',
      'During a tempo set, follow the metronome through Lower, Pause, Lift, and Hold. An open set shows the load and waits: log the reps, then rest starts.',
      'After each exercise, rate how it felt (too easy / good / hard / too hard), RIR, and optional poor form. The line under the buttons says what that does to the next session. Each exercise starts with a blank rating.',
      'Rest is only the timer between sets of the same exercise. After the last set, transition is the only countdown before the next exercise. There is no extra rest there. Review repeats what the rating changed.',
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
      'Tempo is written eccentric-bottom-concentric-top in seconds: lower, pause at the bottom, lift, pause at the top. The ring counts the phase you are in. Lower and lift use different tones. Chin-up 3-0-1-0 with lift first is 1 second up, then 3 seconds down.',
      'Lift first is for movements that start at the bottom, such as pull-ups and chin-ups. Lower first is for movements that start at the top, such as push-ups and squats. Set it on each exercise.',
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
      'With a numeric load, topping the range suggests the next load (current plus the load step) and resets the reps toward the bottom. Too hard, a missed minimum, or poor form can suggest one step lighter. On Review you apply it. Bodyweight still suggests a harder variation, such as +5 lb.',
      'Unilateral work (pistol squat) uses the weaker-leg rep count for progression.',
    ],
  },
  {
    title: 'Weights and the library',
    body: [
      'Program has a library of gym exercises and four ready-made programs: Full Body, Push, Pull, and Legs. Adding one copies it into your program. Later edits stay on your copy.',
      'Barbell and machine compounds are open sets. Dumbbell accessories, curls, raises, and bodyweight stay on the tempo metronome. You can switch either way on the exercise.',
      'Load is a number in pounds or kilograms, total or per side. The load step is what Review adds or removes. Settings chooses the unit for newly added exercises.',
    ],
  },
  {
    title: 'Screens',
    body: [
      'Home: today’s routine, the program it chose, last session, and the week streak.',
      'Workout: full-screen runner with countdown, set, rest, and transition.',
      'Review: post-workout summary and apply-progression prompt.',
      'History: past sessions and per-session detail. Delete a workout there if a log was a mistake.',
      'Progress: rep and resistance trends plus personal records.',
      'Program: rename the program, edit exercises, sets, tempo, load, rest, laterality, today’s targets, and open the gym library. The same editor is on momentum.tssamuel.com after you sign in.',
      'Coach: ask Gemini to draft a program, edit one exercise, or read recent sessions. Sign in first. The request goes through tssamuel.com, and the key stays there. The website has the same Coach.',
      'Schedule: routines, days, and reminder times. Edits sync to the phone and the website.',
      'Settings: account and sync, weekly goal, sound, haptics, wake lock, reminders, and reset all progress. On iPhone, Update now installs the latest build from the home server.',
    ],
  },
  {
    title: 'Routines and reminders',
    body: [
      'A routine is one schedule. You can have one, or a morning and a night, or more. Each has its own programs, its own rule, and its own time.',
      'Rotation: any day. The next program is the one after your last session. A missed day is not made up.',
      'Days: assign a program to each weekday. Monday stays Monday. Skipping Monday does not move Tuesday.',
      'Shift: a repeating pattern, such as push, pull, legs, rest. Turn on “Shift when I skip” and a missed training day stays next until you do it. Leave it off and the calendar moves on.',
      'Per week: no fixed days. Do it a set number of days. The next program comes from the rotation until that count is met. You can still train after that.',
      'Home shows each routine that is on, in reminder-time order. A rest day says so, and you can train anyway.',
      'Reminders ring on the iPhone app for the next week. They name the routine. The website edits the same times. A computer browser does not ring after you close the tab.',
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
      'The phone keeps the working copy. Signing in uploads it to your tssamuel.com account so the website and your other devices can use it. It is still only your account.',
      'Clearing site data, or deleting the app, removes that device. The account copy stays until you delete workouts from the app or replace the server copy from Settings.',
      'Safari, the website, and the iPhone app do not share storage until you sign in on each one.',
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
