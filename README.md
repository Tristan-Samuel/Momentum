# Momentum

A local-first personal workout coach. Open the app, press **Start**, and let it run the session: countdown, tempo metronome, rest, transitions, and the next recommended targets.

This is not a social fitness app. It is a training instrument for one person, on one device. There is no account, no backend, and no cloud sync. Everything lives on the device that runs the app.

---

## What it does

- Runs a prescribed workout with a pre-set countdown, tempo-cued reps, rest timers, and exercise transitions.
- Plays Web Audio cues (start, tick, phase beep, warning, set complete) and optional haptics.
- Lets you log actual reps, skip a set, reduce the target mid-set, and rate difficulty / RIR / form.
- Recommends the next session’s targets from a simple rep-range progression (hold, add a rep, or increase difficulty and reset toward the bottom of the range).
- Stores programs, sessions, personal records, and settings in IndexedDB via Dexie. Works fully offline after the first load.
- Resumes an incomplete workout if you leave mid-session.
- Tracks history, lifetime totals, and per-exercise trends on the Progress screen.

### Screens

| Route | Purpose |
| --- | --- |
| Home | Next workout card, last session, completed-workout count |
| Workout | Full-screen runner (countdown, set, rest, transition) |
| Review | Post-workout summary and apply-progression prompt |
| History | Past sessions and per-session detail |
| Progress | Rep and resistance trends plus personal records |
| Program | Edit program name, exercises, sets, tempo, rest, laterality |
| Settings | Theme, sound profile, volume, haptics, wake lock, notifications, accessibility |

---

## Default program

**Minimalist Strength** seeds on first launch:

1. L-Sit Chin-Up — 2×6–10, tempo 3-0-1-0, rest 150s
2. Pull-Up — 1×6–12, tempo 3-0-1-0, rest 150s
3. Weighted / Difficult Push-Up — 2×6–12, tempo 3-0-1-0, rest 120s
4. Pistol Squat — 2×5–8 per leg, tempo 3-1-1-0, rest 150s (right then left)

Tempo is written `eccentric-bottom-concentric-top` in seconds. You can rename the program, change any prescription, or add/remove exercises on the Program screen.

### Progression (rep-range)

After each exercise, Momentum looks at completed reps, RIR, difficulty, and form:

- **Hold** the current resistance if the set was too hard, RIR was 0, form was poor, you missed the minimum, you reduced the target, or performance dropped sharply from last time.
- **Add 1 rep** to any set that hit its target, up to `maxReps`.
- **Increase difficulty** when every set hits `maxReps` with acceptable effort, then reset targets toward the bottom of the range. On Review, you can apply a suggested next resistance label (for example `Bodyweight+`).

Unilateral work (pistol squat) uses the weaker-leg rep count for progression.

---

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| Routing | React Router 7 |
| Storage | Dexie.js / IndexedDB (`momentum` database) |
| Audio | Web Audio API (`src/audio-engine`) |
| Timing | Wall-clock scheduler (`src/timing-engine`) |
| Workout state | Deterministic engine (`src/workout-engine`) |
| Native shell | Capacitor 8 (`appId`: `com.momentum.workout`) |
| Native plugins | `@capacitor/haptics`, `@capacitor/local-notifications` |

Platform adapters in `src/platform/` keep the workout engine independent of the host. On the web they use Vibration, Wake Lock, and the Notifications API. Inside a Capacitor shell they call native haptics and local notifications when available.

**Browser / web limits:** iOS Safari suspends `AudioContext` and throttles timers when the screen is locked or the tab is backgrounded. During a set, keep the phone face-up. Wake Lock is used when the browser supports it. Rest timers catch up from wall-clock time when you return. Native background audio is not implemented yet (`src/platform/background.ts`).

---

## Prerequisites

Install these on the Mac you will use to develop and to put the app on a phone.

### Required for local development (browser)

- **Node.js 22 or newer** ([nodejs.org](https://nodejs.org/) or `brew install node`). Confirm with `node --version`.
- **npm** (ships with Node). Confirm with `npm --version`.
- A current browser (Chrome, Safari, or Firefox).

### Required to put it on an iPhone

You are on macOS, so this is the main path.

- A Mac (iOS apps cannot be compiled on Windows/Linux).
- **Xcode 26 or newer** from the Mac App Store. Capacitor 8 will not build with older Xcode.
- **Xcode Command Line Tools:**

  ```bash
  xcode-select --install
  xcode-select -p
  # expect: /Applications/Xcode.app/Contents/Developer
  ```

- A free **Apple ID** (the paid Apple Developer Program is only required if you want App Store / TestFlight or installs that last longer than 7 days).
- A USB cable (or a paired Wi-Fi connection after the first USB pairing).
- The iPhone unlocked, with a passcode, and **Developer Mode** enabled (iOS 16+).

CocoaPods is optional. Capacitor 8 defaults to Swift Package Manager.

### Required to put it on an Android phone

- **Android Studio 2025.2.1 or newer** ([developer.android.com/studio](https://developer.android.com/studio)).
- An Android SDK platform (API 24 or newer; latest stable is fine).
- USB debugging enabled on the phone.

---

## 1. Set up the project on your computer

From the repo root:

```bash
npm install
npm test
npm run dev
```

Vite prints a local URL, usually `http://localhost:5173`. Open it. The first visit seeds Minimalist Strength and default settings.

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Vitest once (engines, progression, repository, cues, tempo) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build` | Typecheck and production bundle into `dist/` |
| `npm run preview` | Serve the production bundle locally |
| `npm run cap:sync` | Build, then copy `dist/` into native projects (`npx cap sync`) |

The app does not call a server. After the first load, start a workout, log sets, and compute progression with no network.

### First-run check in the browser

1. Home should show **Minimalist Strength**, exercise/set/time estimates, and **Start workout**.
2. Open **Settings** and tap a Test Cue (`start`, `tick`, `warning`, `set complete`). You should hear a tone after that tap — the first user gesture unlocks Web Audio.
3. Open **Program** and confirm the four default exercises. Change is optional.
4. Start a short workout, pause from **Controls**, leave the page, and confirm the resume prompt when you come back.

If tests fail, fix that before packaging for a phone. The workout engine and progression math are covered by `npm test`.

---

## 2. Using the app

1. **Start workout** on Home. That tap also unlocks audio.
2. A 3-2-1 countdown runs, then the metronome drives each tempo phase (**Lower / Pause / Lift / Hold**).
3. Follow the current rep. When the set ends, confirm or edit completed reps from **Controls** if needed.
4. Rate the exercise when prompted (too easy / good / hard / too hard, RIR 0–3+, optional poor form). That rating feeds next-session targets.
5. Rest and transition rings count down. Keep the screen on during sets. If you background the app during rest, the timer catches up when you return.
6. Review applies or shows the next targets. History and Progress update after a completed session.

**Controls** (workout sheet): pause, skip set, reduce target, finish early, or abort. An incomplete session can be resumed or discarded from the Home overlay.

---

## 3. Put it on your phone

Pick one path. For daily training on an iPhone, use **Path A** (native Capacitor app). Use **Path B** for Android. Use **Path C** only for a quick Safari try — it will not keep a reliable metronome if the screen locks.

The repo ships Capacitor config and plugins, but **does not yet include `ios/` or `android/` native projects**. You add those once, then rebuild whenever the web app changes.

### Path A — iPhone (recommended)

This installs Momentum as a real app icon on the home screen, with native haptics and local notifications when the plugins are available.

#### A1. Install the iOS platform (once)

From the repo root, after `npm install`:

```bash
npm install @capacitor/ios
npx cap add ios
npm run cap:sync
```

That creates `ios/`, copies the production web build from `dist/` into the native project, and links `@capacitor/haptics` and `@capacitor/local-notifications`.

If `npx cap add ios` complains that `dist/` is missing, run `npm run build` first, then add the platform again.

#### A2. Open the Xcode project

```bash
npx cap open ios
```

Xcode should open the **App** workspace. In the left sidebar, click the blue **App** project, then the **App** target.

#### A3. Sign the app with your Apple ID

1. In Xcode, open **Xcode → Settings → Accounts** and add your Apple ID if it is not already there.
2. Select the **App** target → **Signing & Capabilities**.
3. Check **Automatically manage signing**.
4. Under **Team**, choose **Your Name (Personal Team)**.
5. Confirm **Bundle Identifier** is `com.momentum.workout`. If Xcode says the id is taken on that team, append your initials, for example `com.momentum.workout.yourname`, and keep `capacitor.config.ts` `appId` in sync before the next `npx cap sync`.

A free Apple ID is enough to run on your own iPhone. The install expires after **7 days**; run the app from Xcode again to refresh it. A paid Apple Developer Program membership ($99/year) is what you need for TestFlight, the App Store, or long-lived device installs.

#### A4. Prepare the iPhone

1. Unlock the phone and plug it into the Mac with USB. Trust this computer if iOS asks.
2. On the iPhone go to **Settings → Privacy & Security → Developer Mode** and turn it on. The phone restarts. Confirm **Enable** and enter your passcode.
3. If Xcode still does not see the device: unlock it, open Finder, select the iPhone, and wait until it appears in Xcode’s device list.

Optional later: in Finder, enable **Show this iPhone when on Wi-Fi** so you can deploy without the cable.

#### A5. Run on the device

In Xcode’s toolbar:

1. Choose your **iPhone** as the run destination (not a Simulator), next to the App scheme.
2. Press the **Play** button (or **Product → Run**, ⌘R).
3. Wait for the build, install, and launch.

The first time, iOS may refuse to open the app until you trust the developer certificate:

1. On the iPhone: **Settings → General → VPN & Device Management** (wording varies by iOS version).
2. Tap your Apple ID / developer certificate.
3. Trust it.
4. Re-open **Momentum** from the home screen.

You now have a home-screen app. Data lives in that app’s WebView storage, not in Safari. Clearing Safari history will not delete it. Deleting the app will.

#### A6. iPhone Simulator (optional)

To try the UI without a device, pick an iPhone simulator in Xcode and press Play. Audio and haptics are weaker in the simulator than on hardware. Always do one real-device workout before you rely on it.

---

### Path B — Android phone

```bash
npm install @capacitor/android
npx cap add android
npm run cap:sync
npx cap open android
```

Then:

1. On the phone: **Settings → About phone** and tap **Build number** seven times to enable developer options.
2. **Settings → Developer options → USB debugging** on. Connect USB and allow debugging.
3. In Android Studio, pick the device in the run dropdown and press **Run**.

Alternatively, from the repo root:

```bash
npx cap run android
```

and choose the device when prompted.

---

### Path C — Add to Home Screen (Safari / Chrome, no Xcode)

Use this only to click through the UI on a phone. It is still a browser tab. iOS will suspend audio when the screen locks.

1. On your Mac, start the dev server on the LAN:

   ```bash
   npm run dev -- --host
   ```

2. Note the Network URL Vite prints, for example `http://192.168.1.20:5173`. Your phone and Mac must be on the same Wi-Fi. macOS may ask you to allow incoming connections — allow it.
3. On the **iPhone**, open that URL in **Safari**.
4. Share → **Add to Home Screen**. Name it Momentum.
5. On **Android**, open the URL in Chrome → menu → **Add to Home screen** / **Install app**.

`http://192.168.x.x` is not a secure context, so Wake Lock and web notifications may be unavailable. For a daily driver, use Path A or B.

To serve the production build instead of the dev server:

```bash
npm run build
npm run preview -- --host
```

---

## 4. Update the phone after you change code

Native projects do not watch `src/`. After any web change:

```bash
npm run cap:sync
```

Then run again from Xcode / Android Studio, or:

```bash
npx cap run ios
# or
npx cap run android
```

`cap:sync` rebuilds `dist/` and copies it into `ios/` and `android/`. Skipping it leaves the phone on the old bundle.

### Live reload while iterating on a device

To push JS/CSS changes to a USB-connected phone without a full native rebuild:

```bash
npx cap run ios --live-reload
```

or, after a normal install, temporarily point Capacitor at the Vite server by adding a `server` block to `capacitor.config.ts` (remove it before a “real” install):

```ts
server: {
  url: 'http://YOUR_MAC_LAN_IP:5173',
  cleartext: true,
},
```

The phone and Mac must share a network, and you must run `npm run dev -- --host`. This is for development only.

---

## 5. After install: first workout on the phone

1. Open **Momentum**. Allow notifications if you want rest-complete alerts (Settings → Notifications).
2. Settings: turn **Keep screen awake** on, pick a sound profile, and tap a test cue. Raise the hardware volume. On iPhone, the Silent switch mutes some system sounds but Web Audio should still play.
3. Start a workout and keep the phone face-up during sets. Confirm countdown, metronome, and rest ring on hardware — do not trust the simulator for this.
4. Complete or abort once so you know resume/discard and Review behave on the device.

If you used a free Apple ID, set a reminder to re-run from Xcode before day 7 or the icon will fail to launch until you refresh the signature.

---

## Project layout

```
src/
  audio-engine/      Web Audio cues and sound profiles
  components/        Shell, buttons, charts, workout chrome
  database/          Dexie schema, repository, seed program
  hooks/             Settings, prepared workout, runner, resume
  platform/          Haptics, wake lock, notifications, background policy
  progression/       Rep-range algorithm and apply helpers
  screens/           Route-level UI
  timing-engine/     Clock, cue list, scheduler
  types/             Shared domain types
  utils/             Tempo, duration, ids, stats, time
  workout-engine/    Session state machine and persistence
capacitor.config.ts  appId com.momentum.workout, webDir dist
public/              PWA manifest and icon
```

Native folders after you add platforms:

- `ios/` — Xcode project (commit this; `ios/App/Pods` and `ios/App/App/public` stay gitignored)
- `android/` — Android Studio project

---

## Data and privacy

- Database name: `momentum` (IndexedDB).
- Tables: programs, exercises, configurations, progression, sessions, sets, personal records, settings.
- `syncStatus` is always `local`. Nothing is uploaded.
- Browser: clearing site data wipes history. Native: deleting the app wipes history.
- Safari home-screen and the Capacitor app do **not** share storage. Treat them as two separate installs.

---

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| No sound | Tap a Settings test cue first. Unmute the phone. Confirm Sounds is on and the profile is not Silent. |
| Metronome dies when the screen locks | Expected on web and still expected in V1 native. Keep Awake on; leave the screen on during sets. |
| Xcode: signing / team errors | Add your Apple ID under Xcode → Settings → Accounts. Unique bundle id if the default is claimed. |
| Xcode: device not eligible / Developer Mode | Settings → Privacy & Security → Developer Mode, restart, confirm. |
| Untrusted developer | Settings → General → VPN & Device Management → Trust. |
| `npx cap add ios` / sync fails | `npm run build` so `dist/` exists. Node 22+. Xcode 26+. |
| Stale UI on the phone | `npm run cap:sync`, then Run again. |
| Free provisioning expired | Re-run from Xcode. Installs last 7 days. |
| Android device missing | USB debugging on, accept the RSA prompt, try another cable/port. |
| Resume overlay after a crash | Resume or Discard. Discard does not keep the partial session. |

Official Capacitor references: [Environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), [iOS](https://capacitorjs.com/docs/ios), [Android](https://capacitorjs.com/docs/android), [`cap run`](https://capacitorjs.com/docs/cli/commands/run).

---

## Tests

```bash
npm test
```

Coverage includes the workout engine, progression rules, repository, cue list, and tempo helpers. Run this before a device sync if you changed engine or database code.
