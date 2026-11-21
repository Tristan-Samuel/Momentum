#!/usr/bin/env bash
# Build a signed Momentum IPA. The signature stays com.momentum.workout, the app the phone already has.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "export-ipa.sh runs on the Mac that has Xcode." >&2
  exit 1
fi

command -v xcodebuild >/dev/null
command -v npm >/dev/null

npm run cap:sync

ARCHIVE="$ROOT/build/Momentum.xcarchive"
STAGE="$ROOT/build/ipa-stage"
IPA="$ROOT/build/Momentum.ipa"
rm -rf "$ARCHIVE" "$STAGE"
mkdir -p "$ROOT/build"

xcodebuild \
  -project "$ROOT/ios/App/App.xcodeproj" \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  archive

APP=$(find "$ARCHIVE/Products/Applications" -maxdepth 1 -name '*.app' -print -quit)
if [[ -z "${APP}" ]]; then
  echo "Archive did not contain an .app" >&2
  exit 1
fi

mkdir -p "$STAGE/Payload"
cp -R "$APP" "$STAGE/Payload/"
rm -f "$IPA"
( cd "$STAGE" && zip -qry "$IPA" Payload )
echo "Wrote $IPA"
