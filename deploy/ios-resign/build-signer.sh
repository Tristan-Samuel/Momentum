#!/usr/bin/env bash
# Build the patched AltServer on the Pi and install it.
# The patch keeps com.momentum.workout and does not delete trusted profiles.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "build-signer.sh runs as root on the Pi." >&2
  exit 1
fi

HERE=$(cd "$(dirname "$0")" && pwd)
SRC=/var/tmp/momentum-altserver-src
IMAGE=ghcr.io/nyamisty/altserver_builder_alpine_aarch64
DEST=/usr/local/lib/momentum-resign/AltServer

export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null || ! command -v git >/dev/null; then
  echo "momentum-resign: installing docker"
  apt-get update
  apt-get install -y docker.io git ca-certificates
fi
systemctl enable --now docker
echo "momentum-resign: fetching AltServer sources"

if [[ ! -d "$SRC/.git" ]]; then
  rm -rf "$SRC"
  git clone --branch ng-2026-11-05 --depth 1 https://github.com/jaakkopalvaila/AltServer-Linux.git "$SRC"
fi
git -C "$SRC" submodule update --init --recursive
python3 "$HERE/patch_altserver.py" "$SRC"

rm -rf "$SRC/build"
echo "momentum-resign: building the signer"
docker pull "$IMAGE"
docker run --rm -v "$SRC":/workdir -w /workdir "$IMAGE" \
  bash -c 'mkdir -p build && cd build && make -f ../Makefile -j3'

bin=$(find "$SRC/build" -maxdepth 1 -type f -name 'AltServer-*' -print -quit)
if [[ -z "$bin" ]]; then
  echo "The build did not produce an AltServer binary." >&2
  exit 1
fi
grep -a -F "Keeping original bundle identifier" "$bin" >/dev/null
grep -a -F "without removing the ones already on the phone" "$bin" >/dev/null
install -m 0755 "$bin" "$DEST"
sha256sum "$DEST"
echo "momentum-resign: signer installed"
