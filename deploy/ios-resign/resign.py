#!/usr/bin/env python3
"""Re-sign the stored Momentum IPA when the free Apple profile is due."""

from __future__ import annotations

import argparse
import json
import os
import plistlib
import re
import shutil
import socket
import struct
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

REFRESH_AFTER = timedelta(days=5)
INSTALL_TIMEOUT = 15 * 60


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def due(
    last_success: datetime | None,
    now: datetime,
    refresh_after: timedelta = REFRESH_AFTER,
) -> bool:
    if last_success is None:
        return True
    return now - last_success >= refresh_after


def refresh_decision(
    *,
    last_success: datetime | None,
    now: datetime,
    device_present: bool,
    ipa_present: bool,
    locked: bool,
    refresh_after: timedelta = REFRESH_AFTER,
) -> tuple[str, str]:
    """Return ('install' | 'wait' | 'skip', reason)."""
    if not due(last_success, now, refresh_after):
        return "skip", "last install is still inside the refresh window"
    if not ipa_present:
        return "wait", "IPA is missing"
    if not device_present:
        return "wait", "iPhone is not visible on the home network"
    if locked:
        return "wait", "iPhone is locked"
    return "install", "refresh is due and the iPhone is unlocked"


def load_last_success(path: Path) -> datetime | None:
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError, UnicodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    raw = data.get("last_success")
    if not isinstance(raw, str):
        return None
    try:
        return parse_time(raw)
    except ValueError:
        return None


def write_state(path: Path, when: datetime) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"last_success": when.astimezone(timezone.utc).isoformat()})
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(payload + "\n")
    temporary.replace(path)


_ENV_KEY = re.compile(r"^[A-Z][A-Z0-9_]*$")


def systemd_environment(values: dict[str, str]) -> str:
    """Serialize values for a systemd EnvironmentFile."""
    lines = []
    for key, value in values.items():
        if not _ENV_KEY.fullmatch(key):
            raise ValueError(f"bad env key {key}")
        cleaned = value.replace("\r", "").replace("\n", "")
        escaped = cleaned.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'{key}="{escaped}"')
    return "\n".join(lines) + "\n"


def env_values_from_environ() -> dict[str, str]:
    required = ("APPLE_ID", "APPLE_PASSWORD", "DEVICE_UDID")
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise ValueError("missing " + " ".join(missing))
    return {
        "APPLE_ID": os.environ["APPLE_ID"],
        "APPLE_PASSWORD": os.environ["APPLE_PASSWORD"],
        "DEVICE_UDID": os.environ["DEVICE_UDID"],
        "IPA": os.environ.get("IPA", "/var/lib/momentum-resign/Momentum.ipa"),
        "ALTSERVER": os.environ.get("ALTSERVER", "/usr/local/lib/momentum-resign/AltServer"),
        "ANISETTE_URL": os.environ.get("ANISETTE_URL", "http://127.0.0.1:6969"),
        "STATE": os.environ.get("STATE", "/var/lib/momentum-resign/state.json"),
        "TWO_FA": os.environ.get("TWO_FA", "/var/lib/momentum-resign/2fa"),
        "REFRESH_DAYS": os.environ.get("REFRESH_DAYS", "5"),
    }


def paired_iphone(document: dict) -> dict | None:
    """Pick the physical iPhone from `devicectl list devices` JSON."""
    devices = (document.get("result") or {}).get("devices") or document.get("devices") or []
    fallback = None
    for device in devices:
        hardware = device.get("hardwareProperties") or {}
        if hardware.get("reality") == "simulated":
            continue
        product = str(hardware.get("productType") or "")
        if not product.startswith("iPhone"):
            continue
        phone = {
            "name": str((device.get("deviceProperties") or {}).get("name") or ""),
            "udid": str(hardware.get("udid") or ""),
            "transport": str((device.get("connectionProperties") or {}).get("transportType") or ""),
        }
        if not phone["udid"]:
            continue
        if phone["transport"] in {"localNetwork", "wired"}:
            return phone
        fallback = phone
    return fallback


def redact(text: str, secret: str) -> str:
    if secret:
        return text.replace(secret, "***")
    return text


@dataclass(frozen=True)
class Settings:
    apple_id: str
    password: str
    udid: str
    ipa: Path
    altserver: Path
    anisette_url: str
    state: Path
    two_fa: Path
    refresh_after: timedelta
    idevice_id: str
    ideviceinfo: str

    @property
    def configured(self) -> bool:
        return bool(self.apple_id and self.password and self.udid)


def settings_from_env(env: dict[str, str] | None = None) -> Settings:
    source = os.environ if env is None else env
    days = source.get("REFRESH_DAYS", "5").strip() or "5"
    try:
        refresh_after = timedelta(days=float(days))
    except ValueError:
        refresh_after = REFRESH_AFTER
    idevice_id = source.get("IDEVICE_ID") or shutil.which("idevice_id") or "idevice_id"
    ideviceinfo = source.get("IDEVICEINFO") or shutil.which("ideviceinfo") or "ideviceinfo"
    return Settings(
        apple_id=source.get("APPLE_ID", "").strip(),
        password=source.get("APPLE_PASSWORD", ""),
        udid=source.get("DEVICE_UDID", "").strip(),
        ipa=Path(source.get("IPA", "/var/lib/momentum-resign/Momentum.ipa")),
        altserver=Path(source.get("ALTSERVER", "/usr/local/lib/momentum-resign/AltServer")),
        anisette_url=source.get("ANISETTE_URL", "http://127.0.0.1:6969").strip(),
        state=Path(source.get("STATE", "/var/lib/momentum-resign/state.json")),
        two_fa=Path(source.get("TWO_FA", "/var/lib/momentum-resign/2fa")),
        refresh_after=refresh_after,
        idevice_id=idevice_id,
        ideviceinfo=ideviceinfo,
    )


def _udids(text: str) -> set[str]:
    return {line.strip().lower() for line in text.splitlines() if line.strip()}


def probe_device(settings: Settings) -> tuple[bool, bool]:
    """Return (present, locked). A device that does not answer is absent."""
    listed = subprocess.run(
        [settings.idevice_id, "-l"],
        check=False,
        capture_output=True,
        text=True,
    )
    if settings.udid.lower() not in _udids(listed.stdout or ""):
        return False, False
    # DeviceName answers when the phone is unlocked. PasswordProtected as a
    # value only means a passcode is set, so it is the wrong lock signal.
    info = subprocess.run(
        [settings.ideviceinfo, "-u", settings.udid, "-k", "DeviceName"],
        check=False,
        capture_output=True,
        text=True,
    )
    if info.returncode == 0 and (info.stdout or "").strip():
        return True, False
    detail = f"{info.stdout or ''} {info.stderr or ''}".lower()
    if "passwordprotected" in detail or "password protected" in detail or "-17" in detail:
        return True, True
    return False, False


def _read_two_fa(path: Path) -> str | None:
    try:
        code = path.read_text().strip()
    except OSError:
        return None
    if not code:
        return None
    path.unlink(missing_ok=True)
    return code


def install_ipa(settings: Settings) -> bool:
    if not settings.altserver.is_file():
        print(f"momentum-resign: AltServer is missing at {settings.altserver}", file=sys.stderr)
        return False
    code = _read_two_fa(settings.two_fa)
    env = os.environ.copy()
    env["ALTSERVER_ANISETTE_SERVER"] = settings.anisette_url
    command = [
        str(settings.altserver),
        "-u",
        settings.udid,
        "-a",
        settings.apple_id,
        "-p",
        settings.password,
        str(settings.ipa),
    ]
    run_kwargs: dict = {"input": f"{code}\n"} if code else {"stdin": subprocess.DEVNULL}
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=INSTALL_TIMEOUT,
            env=env,
            **run_kwargs,
        )
    except subprocess.TimeoutExpired:
        print("momentum-resign: AltServer timed out", file=sys.stderr)
        return False
    output = redact((completed.stdout or "") + (completed.stderr or ""), settings.password)
    tail = "\n".join(output.strip().splitlines()[-40:])
    if tail:
        print(tail)
    lowered = output.lower()
    if any(phrase in lowered for phrase in ("verification code", "two-factor", "two factor", "security code")):
        print(f"momentum-resign: write the Apple code to {settings.two_fa} and the next run will send it")
    succeeded = completed.returncode == 0 and "Installation Succeeded" in output and "Could not install" not in output
    return succeeded


def usbmux_plist_packet(payload: dict, tag: int = 1) -> bytes:
    body = plistlib.dumps(payload, fmt=plistlib.FMT_XML)
    return struct.pack("<IIII", 16 + len(body), 1, 8, tag) + body


def pairing_files(record: dict, udid: str) -> dict[str, bytes]:
    stored = dict(record)
    stored.setdefault("UDID", udid)
    system = {"HostID": record["HostID"], "SystemBUID": record["SystemBUID"]}
    return {
        f"{udid}.plist": plistlib.dumps(stored, fmt=plistlib.FMT_XML),
        "SystemConfiguration.plist": plistlib.dumps(system, fmt=plistlib.FMT_XML),
    }


def _recv_exact(sock: socket.socket, size: int) -> bytes:
    buf = b""
    while len(buf) < size:
        chunk = sock.recv(size - len(buf))
        if not chunk:
            raise RuntimeError("usbmuxd closed the connection")
        buf += chunk
    return buf


def read_pair_record(udid: str, socket_path: str = "/var/run/usbmuxd") -> dict:
    packet = usbmux_plist_packet(
        {
            "MessageType": "ReadPairRecord",
            "PairRecordID": udid,
            "ClientVersionString": "usbmuxd-1.0",
            "ProgName": "momentum-resign",
            "kLibUSBMuxVersion": 3,
        }
    )
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.connect(socket_path)
        sock.sendall(packet)
        length = struct.unpack("<IIII", _recv_exact(sock, 16))[0]
        payload = plistlib.loads(_recv_exact(sock, length - 16))
    data = payload.get("PairRecordData")
    if not data:
        raise RuntimeError("usbmuxd did not return a pair record for this iPhone")
    return plistlib.loads(data)


def export_pair(udid: str, directory: Path, socket_path: str = "/var/run/usbmuxd") -> None:
    files = pairing_files(read_pair_record(udid, socket_path), udid)
    directory.mkdir(parents=True, exist_ok=True)
    for name, blob in files.items():
        path = directory / name
        path.write_bytes(blob)
        path.chmod(0o600)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Re-sign Momentum onto the paired iPhone")
    parser.add_argument("--write-env", action="store_true", help="write a systemd env file from the process environment")
    parser.add_argument("--paired-udid", action="store_true", help="read devicectl JSON on stdin and print udid, name, transport")
    parser.add_argument("--export-pair", nargs=2, metavar=("UDID", "DIR"), help="write this Mac's pair record for the UDID")
    args = parser.parse_args(argv)
    if args.export_pair:
        udid, directory = args.export_pair
        export_pair(udid, Path(directory))
        return 0
    if args.write_env:
        sys.stdout.write(systemd_environment(env_values_from_environ()))
        return 0
    if args.paired_udid:
        phone = paired_iphone(json.load(sys.stdin))
        if phone is None:
            return 1
        print(f"{phone['udid']}\t{phone['name']}\t{phone['transport']}")
        return 0
    settings = settings_from_env()
    now = datetime.now(timezone.utc)
    if not settings.configured:
        print("momentum-resign: set APPLE_ID, APPLE_PASSWORD, and DEVICE_UDID in /etc/momentum-resign.env")
        return 0
    try:
        present, locked = probe_device(settings)
    except OSError as error:
        print(f"momentum-resign: wait: {error}")
        return 0
    action, reason = refresh_decision(
        last_success=load_last_success(settings.state),
        now=now,
        device_present=present,
        ipa_present=settings.ipa.is_file(),
        locked=locked,
        refresh_after=settings.refresh_after,
    )
    print(f"momentum-resign: {action}: {reason}")
    if action != "install":
        return 0
    if not install_ipa(settings):
        print("momentum-resign: install failed", file=sys.stderr)
        return 1
    write_state(settings.state, now)
    print("momentum-resign: installed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
