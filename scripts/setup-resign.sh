#!/usr/bin/env bash
# Install the Pi resign service and hand it this Mac's IPA, pairing record, and Apple ID.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "ios:setup runs on the Mac that has Xcode." >&2
  exit 1
fi

PI_HOST=${MOMENTUM_PI:-tristan-pi}
PI_DIR=${MOMENTUM_PI_DIR:-apps/momentum}
REBUILD=1
if [[ "${1:-}" == "--no-build" ]]; then
  REBUILD=0
fi

ask() {
  local hidden=$1
  local prompt=$2
  local default=${3:-}
  if [[ "$hidden" == yes ]]; then
    osascript - "$prompt" <<'APPLESCRIPT'
on run argv
  text returned of (display dialog (item 1 of argv) default answer "" with hidden answer buttons {"OK"} default button "OK")
end run
APPLESCRIPT
  else
    osascript - "$prompt" "$default" <<'APPLESCRIPT'
on run argv
  text returned of (display dialog (item 1 of argv) default answer (item 2 of argv) buttons {"OK"} default button "OK")
end run
APPLESCRIPT
  fi
}

SCP_OPTS=()
resolve_pi() {
  SSH_BASE=(ssh -o BatchMode=yes -o ConnectTimeout=12)
  if [[ "$PI_HOST" == *@* ]]; then
    SSH=("${SSH_BASE[@]}" "$PI_HOST")
    SCP_TARGET=$PI_HOST
    return
  fi
  if "${SSH_BASE[@]}" -o ConnectTimeout=5 "$PI_HOST" true 2>/dev/null; then
    SSH=("${SSH_BASE[@]}" "$PI_HOST")
    SCP_TARGET=$PI_HOST
    return
  fi
  if command -v tailscale >/dev/null && tailscale ip -4 "$PI_HOST" >/dev/null 2>&1; then
    local ip
    ip=$(tailscale ip -4 "$PI_HOST" | head -n 1)
    SSH=("${SSH_BASE[@]}" -o HostName="$ip" "$PI_HOST")
    SCP_TARGET=$PI_HOST
    SCP_OPTS=(-o BatchMode=yes -o ConnectTimeout=12 -o HostName="$ip")
    return
  fi
  echo "Cannot reach $PI_HOST. Set MOMENTUM_PI to user@host." >&2
  exit 1
}

pi() {
  "${SSH[@]}" "$@"
}

copy_to_pi() {
  if [[ ${#SCP_OPTS[@]} -gt 0 ]]; then
    scp "${SCP_OPTS[@]}" "$@"
  else
    scp "$@"
  fi
}

pi_root() {
  # Quote the whole script so the Pi's shell does not treat it as `bash -c bash`.
  local quoted
  quoted=$(printf '%q' "$1")
  if pi sudo -n true 2>/dev/null; then
    pi "sudo -n -- bash -c $quoted"
    return
  fi
  if [[ -z "${PI_PASS:-}" ]]; then
    PI_PASS=$(ask yes "Password for sudo on ${PI_HOST}")
    if [[ -z "$PI_PASS" ]]; then
      echo "The Pi sudo password is required to install the resign service." >&2
      exit 1
    fi
  fi
  pi "sudo -S -p '' -- bash -c $quoted" <<EOF
${PI_PASS}
EOF
}

resolve_pi

echo "Building the IPA and uploading the resign service to ${PI_HOST}."
if [[ "$REBUILD" == 1 || ! -f "$ROOT/build/Momentum.ipa" ]]; then
  npm run ios:ipa
fi

pi "mkdir -p ~/${PI_DIR}/deploy/ios-resign"
pi "cd ~/${PI_DIR} && git pull --ff-only" || echo "git pull on the Pi did not fast-forward. The resign files from this Mac are copied anyway."
copy_to_pi "$ROOT/deploy/ios-resign/"* "${SCP_TARGET}:~/${PI_DIR}/deploy/ios-resign/"

if ! pi sudo -n /usr/local/sbin/momentum-resign-apply configured >/dev/null 2>&1; then
  PI_HOME=$(pi 'printf %s "$HOME"')
  pi_root "bash ${PI_HOME}/${PI_DIR}/deploy/ios-resign/install.sh"
fi

PHONE_JSON=$(xcrun devicectl list devices -j - 2>/dev/null || true)
PHONE_LINE=$(printf '%s' "$PHONE_JSON" | python3 "$ROOT/deploy/ios-resign/resign.py" --paired-udid || true)
UDID=${PHONE_LINE%%$'\t'*}
PHONE_NAME=$(printf '%s' "$PHONE_LINE" | cut -f 2)
TRANSPORT=$(printf '%s' "$PHONE_LINE" | cut -f 3)
if [[ -z "$UDID" || "$UDID" == "$PHONE_LINE" ]]; then
  echo "No physical iPhone is visible from this Mac. Unlock it on the home Wi-Fi and run npm run ios:setup again." >&2
  exit 1
fi
echo "Using ${PHONE_NAME} (${UDID}) over ${TRANSPORT}."

WORK=$(mktemp -d)
cleanup() {
  rm -rf "$WORK"
  pi "rm -rf ${REMOTE_WORK:-}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
REMOTE_WORK=$(pi mktemp -d /tmp/momentum-resign.XXXXXX)

# The phone already trusts this Mac. Ask usbmuxd for that record so the Pi can
# refresh over Wi-Fi without a second Trust prompt. macOS hides /var/db/lockdown
# from every app, including ones with Full Disk Access.
python3 deploy/ios-resign/resign.py --export-pair "$UDID" "$WORK"
copy_to_pi "$WORK/"*.plist "${SCP_TARGET}:${REMOTE_WORK}/"
pi sudo -n /usr/local/sbin/momentum-resign-apply pairing "$REMOTE_WORK"

READY=$(pi sudo -n /usr/local/sbin/momentum-resign-apply configured)
if [[ "$READY" != yes ]]; then
  APPLE_ID=$(ask no "Apple ID for the free developer team" "")
  APPLE_PASSWORD=$(ask yes "Apple ID password (the account password, not an app-specific one)" "")
  if [[ -z "$APPLE_ID" || -z "$APPLE_PASSWORD" ]]; then
    echo "Apple ID and password are required once. They are stored only in /etc/momentum-resign.env on the Pi." >&2
    exit 1
  fi
  APPLE_ID="$APPLE_ID" APPLE_PASSWORD="$APPLE_PASSWORD" DEVICE_UDID="$UDID" \
    python3 "$ROOT/deploy/ios-resign/resign.py" --write-env > "$WORK/resign.env"
  chmod 600 "$WORK/resign.env"
  copy_to_pi "$WORK/resign.env" "${SCP_TARGET}:${REMOTE_WORK}/resign.env"
  pi sudo -n /usr/local/sbin/momentum-resign-apply env "${REMOTE_WORK}/resign.env"
  rm -f "$WORK/resign.env"
  pi "rm -f ${REMOTE_WORK}/resign.env"
fi

copy_to_pi "$ROOT/build/Momentum.ipa" "${SCP_TARGET}:${REMOTE_WORK}/Momentum.ipa"
pi sudo -n /usr/local/sbin/momentum-resign-apply ipa "${REMOTE_WORK}/Momentum.ipa"

echo "Asking the Pi to sign and install Momentum."
LOG=$(pi sudo -n /usr/local/sbin/momentum-resign-apply refresh || true)
printf '%s\n' "$LOG"
if printf '%s' "$LOG" | grep -qi 'verification code\|two-factor\|two factor\|security code'; then
  CODE=$(ask yes "Apple verification code" "")
  printf '%s\n' "$CODE" > "$WORK/2fa"
  chmod 600 "$WORK/2fa"
  copy_to_pi "$WORK/2fa" "${SCP_TARGET}:${REMOTE_WORK}/2fa"
  pi sudo -n /usr/local/sbin/momentum-resign-apply code "${REMOTE_WORK}/2fa"
fi

echo "Setup is on the Pi. Later refreshes run every 30 minutes while ${PHONE_NAME} is unlocked on the home Wi-Fi."
