#!/usr/bin/env bash
# Install the Momentum resign units on a 64-bit Raspberry Pi. No Docker.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the Pi: sudo bash $0" >&2
  exit 1
fi
if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "aarch64" ]]; then
  echo "This installer expects a 64-bit Raspberry Pi (Linux aarch64)." >&2
  exit 1
fi

HERE=$(cd "$(dirname "$0")" && pwd)
LIB=/usr/local/lib/momentum-resign
STATE=/var/lib/momentum-resign
ANISETTE_SRC=/usr/local/src/anisette-v3-server
ANISETTE_REV=684895737aaf1a1c4586fcd5b67509ffd500a36c
# NyaMisty v0.0.5 signs with a 2022 ldid that iOS 26 rejects. This build signs
# a profile iOS 26.4+ will launch, and it can talk to netmuxd 0.3+.
ALTSERVER_URL=https://github.com/jaakkopalvaila/AltServer-Linux/releases/download/ng-2026-09-13/AltServer-aarch64
ALTSERVER_SHA=bbb6e30c1bf4c6cd1335345f79d1708d50f35be4e770f8ed36ec4696179f5518
NETMUXD_URL=https://github.com/jkcoxson/netmuxd/releases/download/v0.4.3/netmuxd-aarch64-unknown-linux-gnu.tar.gz
NETMUXD_SHA=a89d587b094184b41431bc343da6dfa890391ccc7d4b3d6bce02b524f3191ae6

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  avahi-daemon \
  avahi-utils \
  ca-certificates \
  clang \
  curl \
  dub \
  git \
  ldc \
  libavahi-compat-libdnssd1 \
  libimobiledevice-utils \
  libplist-dev \
  libssl-dev \
  openssl \
  usbmuxd \
  zlib1g-dev

command -v ldc2 >/dev/null
command -v dub >/dev/null
command -v idevice_id >/dev/null

install -d -m 0755 "$LIB" "$STATE" /var/lib/lockdown
install -d -m 0750 "$STATE/anisette"
if ! id momentum-anisette >/dev/null 2>&1; then
  useradd --system -d "$STATE/anisette" -s /usr/sbin/nologin momentum-anisette
fi
chown momentum-anisette:momentum-anisette "$STATE/anisette"

fetch() {
  local url=$1 sha=$2 dest=$3
  local tmp
  tmp=$(mktemp)
  curl -fsSL "$url" -o "$tmp"
  echo "$sha  $tmp" | sha256sum -c -
  install -m 0755 "$tmp" "$dest"
  rm -f "$tmp"
}

fetch "$ALTSERVER_URL" "$ALTSERVER_SHA" "$LIB/AltServer"

netmuxd_tmp=$(mktemp -d)
curl -fsSL "$NETMUXD_URL" -o "$netmuxd_tmp/netmuxd.tar.gz"
echo "$NETMUXD_SHA  $netmuxd_tmp/netmuxd.tar.gz" | sha256sum -c -
tar -xzf "$netmuxd_tmp/netmuxd.tar.gz" -C "$netmuxd_tmp"
install -m 0755 "$netmuxd_tmp/netmuxd" "$LIB/netmuxd"
rm -rf "$netmuxd_tmp"

rev_file="$LIB/anisette-v3-server.rev"
if [[ ! -x "$LIB/anisette-v3-server" || "$(cat "$rev_file" 2>/dev/null || true)" != "$ANISETTE_REV" ]]; then
  rm -rf "$ANISETTE_SRC"
  mkdir -p "$ANISETTE_SRC"
  git -C "$ANISETTE_SRC" init
  git -C "$ANISETTE_SRC" remote add origin https://github.com/Dadoum/anisette-v3-server.git
  git -C "$ANISETTE_SRC" fetch --depth 1 origin "$ANISETTE_REV"
  git -C "$ANISETTE_SRC" checkout --detach FETCH_HEAD
  ( cd "$ANISETTE_SRC" && DC=ldc2 dub build -c static --build-mode allAtOnce -b release --compiler=ldc2 )
  built="$ANISETTE_SRC/anisette-v3-server"
  if [[ ! -x "$built" ]]; then
    built=$(find "$ANISETTE_SRC" -type f -name anisette-v3-server -perm -111 -print -quit)
  fi
  if [[ -z "${built}" || ! -x "$built" ]]; then
    echo "anisette-v3-server binary was not produced." >&2
    exit 1
  fi
  install -m 0755 "$built" "$LIB/anisette-v3-server"
  echo "$ANISETTE_REV" > "$rev_file"
fi

install -m 0755 "$HERE/resign.py" "$LIB/resign.py"
install -m 0755 "$HERE/apply.sh" /usr/local/sbin/momentum-resign-apply
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
  printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/momentum-resign-apply\n' "$SUDO_USER" > /etc/sudoers.d/momentum-resign
  chmod 0440 /etc/sudoers.d/momentum-resign
  visudo -cf /etc/sudoers.d/momentum-resign
fi
install -m 0644 "$HERE/anisette.service" /etc/systemd/system/anisette.service
install -m 0644 "$HERE/netmuxd.service" /etc/systemd/system/netmuxd.service
install -m 0644 "$HERE/momentum-resign.service" /etc/systemd/system/momentum-resign.service
install -m 0644 "$HERE/momentum-resign.timer" /etc/systemd/system/momentum-resign.timer

if [[ ! -f /etc/momentum-resign.env ]]; then
  install -m 0600 "$HERE/env.example" /etc/momentum-resign.env
fi
chmod 0600 /etc/momentum-resign.env

# usbmuxd and netmuxd both want /var/run/usbmuxd. netmuxd keeps the socket and adds Wi-Fi.
systemctl disable --now usbmuxd.service usbmuxd.socket || true
systemctl mask usbmuxd.service usbmuxd.socket

systemctl daemon-reload
systemctl enable --now avahi-daemon
systemctl enable --now anisette.service
systemctl enable --now netmuxd.service
systemctl enable --now momentum-resign.timer

cat <<'EOF'

Units are in. From the Mac, `npm run ios:setup` copies the IPA, the Mac pairing record, and the Apple ID into place.
This service stays on the LAN. Do not add a Cloudflare hostname for it.
The Apple ID password is briefly visible in process arguments on this Pi.
EOF
