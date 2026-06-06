# Momentum

Momentum is an Expo + React Native iPhone habit app that guides a fixed morning and night routine with local persistence, progression, notes, reminders, and simple stats.

## Development

```bash
npm install
npm run typecheck
npm run web
```

## Build and install on iPhone with Xcode

1. Install dependencies:
   ```bash
   npm install
   ```
2. Generate the iOS native project:
   ```bash
   npm run ios:prebuild
   ```
3. Open `/tmp/workspace/Tristan-Samuel/Momentum/ios/Momentum.xcworkspace` in Xcode.
4. In Xcode, set your Apple Team under **Signing & Capabilities**.
5. Connect your iPhone by cable, trust the computer/device, choose your iPhone as the run target, then press **Run**.

## a-Shell setup

If you want to use **a-Shell** on iOS for basic setup and publishing:

```bash
pkg install node git
git clone https://github.com/Tristan-Samuel/Momentum.git
cd Momentum
npm install
npm run typecheck
npx expo export --platform web
```

Notes:
- Running the full native Expo dev flow is limited on iOS terminals; use a Mac + Xcode for full iOS local development.
- a-Shell is best used for project setup, type checks, and EAS update publishing commands.

## a-Shell mobile webview bundle

A simplified browser-only build is included in `/tmp/workspace/Tristan-Samuel/Momentum/dist`:
- `index.html`
- `style.css`
- `app.js` (single bundled client-side script)

To rebuild it locally:

```bash
npx esbuild mobile/main.ts --bundle --platform=browser --target=es2020 --outfile=dist/app.js
cp mobile/index.html dist/index.html
cp mobile/style.css dist/style.css
```

Open it in a-Shell with:

```bash
cd /tmp/workspace/Tristan-Samuel/Momentum/dist
view index.html
```

## OTA auto-updates

- This repo now includes Expo OTA update settings in `app.json` (`updates.checkAutomatically: ON_LOAD` and `runtimeVersion.policy: appVersion`).
- Included workflow: `.github/workflows/eas-update.yml`, which can publish OTA updates automatically from `main`.

To enable GitHub-driven auto updates:
1. Run `npx eas login` and `npx eas init` once locally.
2. Set repository secret `EAS_TOKEN` in GitHub.
3. Push to `main` (or trigger the workflow manually) to publish an OTA update.