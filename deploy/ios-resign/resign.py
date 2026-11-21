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
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

REFRESH_AFTER = timedelta(days=5)
RENEW_WITHIN = timedelta(hours=48)
INSTALL_TIMEOUT = 15 * 60
EXPECTED_BUNDLE = "com.momentum.workout"
SIGNER_BUNDLE_MARKER = "Keeping original bundle identifier"
SIGNER_PROFILE_MARKER = "without removing the ones already on the phone"


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
    build_changed: bool = False,
    forced: bool = False,
    profile_expiring: bool = False,
) -> tuple[str, str]:
    """Return ('install' | 'wait' | 'skip', reason)."""
    if not ipa_present:
        return "wait", "IPA is missing"
    if not device_present:
        return "wait", "iPhone is not visible on the home network"
    if locked:
        return "wait", "iPhone is locked"
    if forced:
        return "install", "an update was requested and the iPhone is unlocked"
    if build_changed:
        return "install", "a new build is waiting and the iPhone is unlocked"
    if profile_expiring:
        return "install", "the free signature is near expiry and the iPhone is unlocked"
    if not due(last_success, now, refresh_after):
        return "skip", "last install is still inside the refresh window"
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


def _read_state(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError, UnicodeError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def write_state(
    path: Path,
    when: datetime,
    ipa_mtime: float | None = None,
    signature_expires: datetime | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = _read_state(path)
    body: dict[str, object] = {"last_success": when.astimezone(timezone.utc).isoformat()}
    if ipa_mtime is None and isinstance(existing.get("ipa_mtime"), (int, float)) and not isinstance(existing.get("ipa_mtime"), bool):
        ipa_mtime = float(existing["ipa_mtime"])
    if ipa_mtime is not None:
        body["ipa_mtime"] = ipa_mtime
    if signature_expires is None:
        signature_expires = load_signature_expiry(path)
    if signature_expires is not None:
        body["signature_expires"] = signature_expires.astimezone(timezone.utc).isoformat()
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(body) + "\n")
    temporary.replace(path)


def load_signature_expiry(path: Path) -> datetime | None:
    raw = _read_state(path).get("signature_expires")
    if not isinstance(raw, str):
        return None
    try:
        return parse_time(raw)
    except ValueError:
        return None


def signature_is_expiring(expires: datetime | None, now: datetime, within: timedelta = RENEW_WITHIN) -> bool:
    if expires is None:
        return False
    return expires <= now + within


def load_ipa_mtime(path: Path) -> float | None:
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError, UnicodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    raw = data.get("ipa_mtime")
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return None
    return float(raw)


def build_is_newer(current: float | None, recorded: float | None) -> bool:
    if current is None or recorded is None:
        return False
    return current > recorded + 1


def write_status(path: Path, action: str, reason: str, when: datetime | None = None) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        stamp = (when or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat()
        payload = json.dumps({"action": action, "reason": reason, "at": stamp})
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(payload + "\n")
        temporary.replace(path)
    except OSError:
        return


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
        "ANISETTE_URL": os.environ.get("ANISETTE_URL", "https://new.ani.sidestore.io"),
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
    force: Path
    status: Path
    refresh_after: timedelta
    idevice_id: str
    ideviceinfo: str
    ideviceinstaller: str

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
    ideviceinstaller = source.get("IDEVICEINSTALLER") or shutil.which("ideviceinstaller") or "ideviceinstaller"
    return Settings(
        apple_id=source.get("APPLE_ID", "").strip(),
        password=source.get("APPLE_PASSWORD", ""),
        udid=source.get("DEVICE_UDID", "").strip(),
        ipa=Path(source.get("IPA", "/var/lib/momentum-resign/Momentum.ipa")),
        altserver=Path(source.get("ALTSERVER", "/usr/local/lib/momentum-resign/AltServer")),
        anisette_url=source.get("ANISETTE_URL", "https://new.ani.sidestore.io").strip(),
        state=Path(source.get("STATE", "/var/lib/momentum-resign/state.json")),
        two_fa=Path(source.get("TWO_FA", "/var/lib/momentum-resign/2fa")),
        force=Path(source.get("FORCE", "/var/lib/momentum-resign/force")),
        status=Path(source.get("STATUS", "/var/lib/momentum-resign/status.json")),
        refresh_after=refresh_after,
        idevice_id=idevice_id,
        ideviceinfo=ideviceinfo,
        ideviceinstaller=ideviceinstaller,
    )


def bundle_id_from_application_identifier(value: str | None) -> str | None:
    """`TEAMID.com.momentum.workout` -> `com.momentum.workout`."""
    if not value or "." not in value:
        return None
    bundle = value.split(".", 1)[1]
    return bundle or None


def install_plan(application_identifier: str | None, expected: str = EXPECTED_BUNDLE) -> str:
    """How to install a signature.

    `upgrade` replaces the existing app and keeps its data.
    `other` is a different bundle id, which iOS installs as a new app.
    `unsigned` has no provisioning profile.
    """
    bundle = bundle_id_from_application_identifier(application_identifier)
    if bundle == expected:
        return "upgrade"
    if bundle:
        return "other"
    return "unsigned"


def _udids(text: str) -> set[str]:
    return {line.strip().lower() for line in text.splitlines() if line.strip()}


def _listed_udids(binary: str, flag: str) -> set[str]:
    listed = subprocess.run(
        [binary, flag],
        check=False,
        capture_output=True,
        text=True,
    )
    return _udids(listed.stdout or "")


def relocate_device(listed, restart, sleep=time.sleep, attempts: int = 12):
    """Find the phone, restarting the Wi-Fi bridge once when its list is empty.

    netmuxd keeps serving an empty device list after it misses one mDNS browse.
    The phone can still be on the home network. A new bridge process picks it up.
    """
    on_usb, on_network = listed()
    if on_usb or on_network:
        return on_usb, on_network
    restart()
    for _ in range(attempts):
        sleep(1)
        on_usb, on_network = listed()
        if on_usb or on_network:
            return on_usb, on_network
    return False, False


def probe_device(settings: Settings) -> tuple[bool, bool]:
    """Return (present, locked). A device that does not answer is absent.

    `idevice_id -l` lists USB only. The Pi reaches the phone over Wi-Fi, which
    is `idevice_id -n`.
    """
    udid = settings.udid.lower()

    def listed() -> tuple[bool, bool]:
        return (
            udid in _listed_udids(settings.idevice_id, "-l"),
            udid in _listed_udids(settings.idevice_id, "-n"),
        )

    on_usb, on_network = relocate_device(
        listed,
        lambda: subprocess.run(["systemctl", "restart", "netmuxd"], check=False),
    )
    if not on_usb and not on_network:
        return False, False
    # DeviceName answers when the phone is unlocked. PasswordProtected as a
    # value only means a passcode is set, so it is the wrong lock signal.
    info_command = [settings.ideviceinfo, "-u", settings.udid, "-k", "DeviceName"]
    if on_network and not on_usb:
        info_command.insert(1, "-n")
    info = subprocess.run(
        info_command,
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


def profile_facts(profile: bytes) -> tuple[str | None, datetime | None]:
    completed = subprocess.run(
        ["openssl", "smime", "-inform", "der", "-verify", "-noverify"],
        input=profile,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0 or not completed.stdout:
        return None, None
    try:
        payload = plistlib.loads(completed.stdout)
    except Exception:
        return None, None
    if not isinstance(payload, dict):
        return None, None
    entitlements = payload.get("Entitlements")
    identifier = entitlements.get("application-identifier") if isinstance(entitlements, dict) else None
    if not isinstance(identifier, str):
        identifier = None
    expires = payload.get("ExpirationDate")
    if isinstance(expires, datetime):
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        expires = expires.astimezone(timezone.utc)
    else:
        expires = None
    return identifier, expires


def application_identifier_from_profile(profile: bytes) -> str | None:
    return profile_facts(profile)[0]


def embedded_profile(ipa: Path) -> tuple[str | None, datetime | None]:
    import zipfile

    try:
        with zipfile.ZipFile(ipa) as archive:
            name = next(item for item in archive.namelist() if item.endswith("embedded.mobileprovision"))
            profile = archive.read(name)
    except (OSError, zipfile.BadZipFile, StopIteration):
        return None, None
    return profile_facts(profile)


def embedded_application_identifier(ipa: Path) -> str | None:
    return embedded_profile(ipa)[0]


def effective_expiry(file_expires: datetime | None, recorded: datetime | None) -> datetime | None:
    candidates = [item for item in (file_expires, recorded) if item is not None]
    return max(candidates) if candidates else None


def choose_install(
    plan: str,
    file_expires: datetime | None,
    recorded: datetime | None,
    now: datetime,
) -> str:
    """resign, upgrade, skip, or refuse.

    An IPA signed for another bundle id is refused. An unsigned build, or a
    profile inside the renewal window, is re-signed on the Pi. A stored IPA
    whose profile is older than the one already on the phone is left alone.
    """
    if plan == "other":
        return "refuse"
    if plan == "unsigned":
        return "resign"
    if recorded and file_expires and file_expires + timedelta(hours=1) < recorded:
        if signature_is_expiring(recorded, now):
            return "resign"
        return "skip"
    if signature_is_expiring(file_expires, now):
        return "resign"
    return "upgrade"


def signer_is_patched(path: Path) -> bool:
    try:
        data = path.read_bytes()
    except OSError:
        return False
    return SIGNER_BUNDLE_MARKER.encode() in data and SIGNER_PROFILE_MARKER.encode() in data


def install_signed_ipa(settings: Settings) -> bool:
    """Replace the existing app. The provisioning profile stays, so trust stays with it."""
    command = [
        settings.ideviceinstaller,
        "-n",
        "-u",
        settings.udid,
        "upgrade",
        str(settings.ipa),
    ]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=INSTALL_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        print("momentum-resign: install timed out", file=sys.stderr)
        return False
    output = ((completed.stdout or "") + (completed.stderr or "")).strip()
    tail = "\n".join(output.splitlines()[-20:])
    if tail:
        print(tail)
    return completed.returncode == 0


def _read_two_fa(path: Path) -> str | None:
    try:
        code = path.read_text().strip()
    except OSError:
        return None
    if not code:
        return None
    path.unlink(missing_ok=True)
    return code


def device_profile_expiry(settings: Settings) -> datetime | None:
    provision = shutil.which("ideviceprovision")
    if not provision:
        sibling = Path(settings.ideviceinstaller).with_name("ideviceprovision")
        provision = str(sibling) if sibling.is_file() else None
    if not provision:
        return None
    import tempfile

    with tempfile.TemporaryDirectory() as directory:
        completed = subprocess.run(
            [provision, "-n", "-u", settings.udid, "copy", directory],
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if completed.returncode != 0:
            return None
        found: list[datetime] = []
        for path in Path(directory).iterdir():
            try:
                identifier, expires = profile_facts(path.read_bytes())
            except OSError:
                continue
            if bundle_id_from_application_identifier(identifier) == EXPECTED_BUNDLE and expires is not None:
                found.append(expires)
    return max(found) if found else None


def resign_with_altserver(settings: Settings) -> tuple[str | None, datetime | None]:
    """Renew the 7-day profile for the existing app. Return (error, expiry)."""
    if not signer_is_patched(settings.altserver):
        return "The signer on the Pi still renames the app, so it was not run.", None
    code = _read_two_fa(settings.two_fa)
    env = os.environ.copy()
    env["ALTSERVER_ANISETTE_SERVER"] = settings.anisette_url
    env.setdefault("ALTSERVER_ANISETTE_PROTOCOL", "v3")
    config_home = env.get("XDG_CONFIG_HOME") or "/var/lib/momentum-resign"
    env["XDG_CONFIG_HOME"] = config_home
    Path(config_home).mkdir(parents=True, exist_ok=True)
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
        return "The signature renewal timed out.", None
    output = redact((completed.stdout or "") + (completed.stderr or ""), settings.password)
    tail = "\n".join(output.strip().splitlines()[-40:])
    if tail:
        print(tail)
    lowered = output.lower()
    if any(phrase in lowered for phrase in ("verification code", "two-factor", "two factor", "security code")):
        return f"Apple asked for a code. Write it to {settings.two_fa} and the next check will send it.", None
    succeeded = completed.returncode == 0 and "Installation Succeeded" in output and "Could not install" not in output
    if not succeeded:
        return "The signature renewal failed.", None
    if f"{SIGNER_BUNDLE_MARKER} {EXPECTED_BUNDLE}" not in output:
        return "The signer did not confirm it kept com.momentum.workout.", None
    expires = device_profile_expiry(settings)
    if expires is None:
        expires = datetime.now(timezone.utc) + timedelta(days=6)
    return None, expires


def install_ipa(settings: Settings, now: datetime | None = None) -> tuple[str | None, datetime | None]:
    """Install or renew. Return (error, signature expiry). Expiry None keeps the recorded one."""
    now = now or datetime.now(timezone.utc)
    identifier, file_expires = embedded_profile(settings.ipa)
    plan = install_plan(identifier)
    recorded = load_signature_expiry(settings.state)
    choice = choose_install(plan, file_expires, recorded, now)
    if choice == "refuse":
        bundle = bundle_id_from_application_identifier(identifier)
        return f"Refused a signature for {bundle}. That would install a second app.", None
    if choice == "skip":
        print("momentum-resign: the phone already has a newer signature than this build")
        return None, None
    if choice == "resign":
        return resign_with_altserver(settings)
    if not shutil.which(settings.ideviceinstaller) and not Path(settings.ideviceinstaller).is_file():
        return f"ideviceinstaller is missing at {settings.ideviceinstaller}", None
    if install_signed_ipa(settings):
        return None, file_expires
    return "The upgrade failed.", None


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
    forced = settings.force.is_file()
    try:
        present, locked = probe_device(settings)
    except OSError as error:
        print(f"momentum-resign: wait: {error}")
        write_status(settings.status, "wait", str(error), now)
        return 0
    current_mtime = settings.ipa.stat().st_mtime if settings.ipa.is_file() else None
    file_expires = embedded_profile(settings.ipa)[1] if settings.ipa.is_file() else None
    expires = effective_expiry(file_expires, load_signature_expiry(settings.state))
    action, reason = refresh_decision(
        last_success=load_last_success(settings.state),
        now=now,
        device_present=present,
        ipa_present=settings.ipa.is_file(),
        locked=locked,
        refresh_after=settings.refresh_after,
        build_changed=build_is_newer(current_mtime, load_ipa_mtime(settings.state)),
        forced=forced,
        profile_expiring=signature_is_expiring(expires, now),
    )
    print(f"momentum-resign: {action}: {reason}")
    if action != "install":
        write_status(settings.status, action, reason, now)
        return 0
    if forced:
        settings.force.unlink(missing_ok=True)
    write_status(settings.status, "installing", reason, now)
    failure, signature_expires = install_ipa(settings, now)
    if failure:
        print(f"momentum-resign: {failure}", file=sys.stderr)
        write_status(settings.status, "failed", failure, now)
        return 1
    write_state(settings.state, now, current_mtime, signature_expires)
    write_status(settings.status, "installed", "installed", now)
    print("momentum-resign: installed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
