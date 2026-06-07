# Momentum

Momentum is an Expo + React Native iPhone habit app that guides a fixed morning and night routine with local persistence, progression, notes, reminders, and simple stats.

---

## Table of contents

1. [Quick start — no build needed (a-Shell / any browser)](#1-quick-start--no-build-needed-a-shell--any-browser)
2. [Rebuild the mobile bundle](#2-rebuild-the-mobile-bundle)
   - [Python bundler (a-Shell / no Node)](#python-bundler-a-shell--no-node)
   - [Node / esbuild bundler (Mac / PC)](#node--esbuild-bundler-mac--pc)
3. [Add to iPhone Home Screen as an app](#3-add-to-iphone-home-screen-as-an-app)
4. [Create an iOS Shortcut to open the app](#4-create-an-ios-shortcut-to-open-the-app)
5. [Build and install the native app with Xcode](#5-build-and-install-the-native-app-with-xcode)
6. [Development (Expo dev server)](#6-development-expo-dev-server)
7. [OTA auto-updates](#7-ota-auto-updates)

---

## 1. Quick start — no build needed (a-Shell / any browser)

A pre-built browser bundle is already committed to this repo inside `dist/`.
You do **not** need Node.js, npm, or any build tools.

**On your iPhone with a-Shell:**

1. Install [a-Shell](https://apps.apple.com/app/a-shell/id1473805438) from the App Store (free).
2. Open a-Shell and run:
   ```sh
   pkg install git        # install git if not already present
   git clone https://github.com/Tristan-Samuel/Momentum.git
   cd Momentum/dist
   view index.html        # opens the app in a-Shell's built-in browser
   ```

**On any computer:**

Open `dist/index.html` directly in any modern browser — no server needed.

---

## 2. Rebuild the mobile bundle

Only needed if you modify the TypeScript source files under `mobile/`,
`utils/`, `data/`, `services/`, or `types/`.

### Python bundler (a-Shell / no Node)

A pure-Python 3 bundler is included at `mobile/build.py`.
It strips TypeScript types and concatenates all source modules.
Python 3 ships pre-installed in a-Shell — no packages required.

```sh
# from the repo root
python3 mobile/build.py
```

Output: `dist/app.js`, `dist/index.html`, `dist/style.css`.

### Node / esbuild bundler (Mac / PC)

If you have Node.js installed (recommended for development):

```sh
npm install           # installs esbuild (already a dev dependency)
npm run mobile:build
```

Or directly:
```sh
npx esbuild mobile/main.ts --bundle --platform=browser --target=es2020 --outfile=dist/app.js
cp mobile/index.html dist/index.html
cp mobile/style.css dist/style.css
```

---

## 3. Add to iPhone Home Screen as an app

Safari can save any webpage as a standalone icon — no App Store required.

1. Open Safari on your iPhone.
2. Navigate to the local file or, if you are serving it from a computer on the same Wi-Fi, open `http://<your-mac-ip>:PORT`.
   - Alternatively, use [a-Shell's `serve`](https://holzschu.github.io/a-Shell_commands/) after running `cd Momentum/dist && python3 -m http.server 8080`, then open `http://localhost:8080` in Safari from the same device.
3. Tap the **Share** button (box with an up arrow) at the bottom of Safari.
4. Scroll down and tap **Add to Home Screen**.
5. Name it **Momentum** and tap **Add**.

The icon appears on your Home Screen and opens in a fullscreen, standalone web view — it looks and feels like a native app.

---

## 4. Create an iOS Shortcut to open the app

If you want a Siri Shortcut or a Home Screen shortcut that deep-links to the app:

1. Open the **Shortcuts** app on your iPhone.
2. Tap **+** to create a new shortcut.
3. Tap **Add Action** → search for **Open URLs**.
4. Enter the URL:
   - If you saved it as a Home Screen icon: use the same URL you saved (e.g. `http://localhost:8080`).
   - If you use a-Shell: you can run `open Momentum/dist/index.html` as a Shell action.
5. Tap the shortcut name at the top to rename it **Momentum**.
6. Tap the icon next to the name to choose a custom glyph and color.
7. Tap **Done**.

You can also set this shortcut as a Home Screen widget or trigger it with Siri:
*"Hey Siri, open Momentum."*

---

## 5. Build and install the native app with Xcode

For a fully native iOS binary (installed directly on your iPhone):

1. On a Mac, install dependencies:
   ```bash
   npm install
   ```
2. Generate the iOS native project:
   ```bash
   npm run ios:prebuild
   ```
3. Open `ios/Momentum.xcworkspace` in Xcode.
4. In Xcode, go to **Signing & Capabilities** and select your Apple Team.
5. Connect your iPhone by cable, trust the computer on the device, choose your iPhone as the run target, then press **▶ Run**.

---

## 6. Development (Expo dev server)

```bash
npm install
npm run typecheck   # TypeScript type check
npm run web         # Expo web dev server
```

---

## 7. OTA auto-updates

- `app.json` is configured with `updates.checkAutomatically: ON_LOAD` and `runtimeVersion.policy: appVersion`.
- `.github/workflows/eas-update.yml` publishes OTA updates automatically from `main`.

To enable GitHub-driven auto updates:
1. Run `npx eas login` and `npx eas init` once locally.
2. Add repository secret `EAS_TOKEN` in GitHub → Settings → Secrets.
3. Push to `main` (or trigger the workflow manually) to publish an OTA update.
