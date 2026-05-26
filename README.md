# Momentum

Momentum is an Expo + React Native iPhone habit app that guides a fixed morning and night routine with local persistence, progression, notes, reminders, and simple stats.

## Development

```bash
npm install
npm run typecheck
npm run web
```

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

## OTA auto-updates

- This repo now includes Expo OTA update settings in `app.json` (`updates.checkAutomatically: ON_LOAD` and `runtimeVersion.policy: appVersion`).
- Included workflow: `.github/workflows/eas-update.yml`, which can publish OTA updates automatically from `main`.

To enable GitHub-driven auto updates:
1. Run `npx eas login` and `npx eas init` once locally.
2. Set repository secret `EAS_TOKEN` in GitHub.
3. Push to `main` (or trigger the workflow manually) to publish an OTA update.