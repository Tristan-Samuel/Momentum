#!/usr/bin/env python3
"""Re-sign the stored Momentum IPA when the free Apple profile is due."""

from __future__ import annotations

import json
import os
import shutil
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


def main() -> int:
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
