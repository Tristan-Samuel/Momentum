#!/usr/bin/env bash
# Root helper for the Mac setup command. It only writes the resign files.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "momentum-resign-apply runs as root." >&2
  exit 1
fi

usage() {
  echo "usage: momentum-resign-apply {configured|ipa|env|pairing|code|refresh|program|build-signer} [path]" >&2
  exit 2
}

require_upload() {
  local path
  path=$(readlink -f "$1")
  case "$path" in
    /tmp/*|/home/*) ;;
    *)
      echo "refusing $path" >&2
      exit 1
      ;;
  esac
  [[ -f "$path" ]] || {
    echo "missing $path" >&2
    exit 1
  }
  local bytes
  bytes=$(stat -c '%s' "$path")
  if (( bytes > 200 * 1024 * 1024 )); then
    echo "refusing oversized file" >&2
    exit 1
  fi
  printf '%s' "$path"
}

cmd=${1:-}
case "$cmd" in
  configured)
    python3 - <<'PY'
import os
path = "/etc/momentum-resign.env"
vals = {}
try:
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            value = value[1:-1]
        vals[key] = value
except OSError:
    vals = {}
ready = all(vals.get(key) for key in ("APPLE_ID", "APPLE_PASSWORD", "DEVICE_UDID"))
print("yes" if ready else "no")
PY
    ;;
  ipa)
    [[ $# -eq 2 ]] || usage
    src=$(require_upload "$2")
    [[ "$src" == *.ipa ]] || {
      echo "expected an .ipa" >&2
      exit 1
    }
    install -d -m 0755 /var/lib/momentum-resign
    install -m 0644 "$src" /var/lib/momentum-resign/Momentum.ipa
    ;;
  env)
    [[ $# -eq 2 ]] || usage
    src=$(require_upload "$2")
    install -m 0600 "$src" /etc/momentum-resign.env
    ;;
  pairing)
    [[ $# -eq 2 ]] || usage
    dir=$(readlink -f "$2")
    case "$dir" in
      /tmp/*|/home/*) ;;
      *)
        echo "refusing $dir" >&2
        exit 1
        ;;
    esac
    [[ -d "$dir" ]] || usage
    install -d -m 0755 /var/lib/lockdown
    shopt -s nullglob
    copied=0
    for file in "$dir"/*.plist; do
      base=$(basename "$file")
      if [[ ! "$base" =~ ^[A-Za-z0-9._-]+$ ]]; then
        continue
      fi
      install -m 0600 "$file" "/var/lib/lockdown/$base"
      copied=$((copied + 1))
    done
    if (( copied == 0 )); then
      echo "no pairing plists" >&2
      exit 1
    fi
    systemctl restart netmuxd
    ;;
  code)
    [[ $# -eq 2 ]] || usage
    src=$(require_upload "$2")
    install -m 0600 "$src" /var/lib/momentum-resign/2fa
    systemctl start momentum-resign.service
    journalctl -u momentum-resign -n 40 --no-pager
    ;;
  refresh)
    systemctl start momentum-resign.service
    journalctl -u momentum-resign -n 40 --no-pager
    ;;
  build-signer)
    [[ $# -eq 2 ]] || usage
    dir=$(readlink -f "$2")
    case "$dir" in
      /tmp/*|/home/*) ;;
      *)
        echo "refusing $dir" >&2
        exit 1
        ;;
    esac
    [[ -f "$dir/build-signer.sh" && -f "$dir/patch_altserver.py" ]] || usage
    bash "$dir/build-signer.sh"
    ;;
  program)
    [[ $# -eq 2 ]] || usage
    dir=$(readlink -f "$2")
    case "$dir" in
      /tmp/*|/home/*) ;;
      *)
        echo "refusing $dir" >&2
        exit 1
        ;;
    esac
    [[ -d "$dir" && -f "$dir/install.sh" && -f "$dir/resign.py" && -f "$dir/trigger.py" ]] || usage
    bash "$dir/install.sh" --units-only
    ;;
  *)
    usage
    ;;
esac
