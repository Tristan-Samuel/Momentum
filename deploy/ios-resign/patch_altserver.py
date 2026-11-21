#!/usr/bin/env python3
"""Keep AltServer on the original bundle id, and stop it deleting trusted profiles.

The stock signer renames com.momentum.workout to com.momentum.workout.<team> and
removes every free provisioning profile before install. iOS treats that as a new
app and asks for trust again. This patch is applied to a checkout of
jaakkopalvaila/AltServer-Linux before that tree is built.
"""

from __future__ import annotations

import sys
from pathlib import Path


def _edit(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_bytes().replace(b"\r\n", b"\n").decode()
    if new in text:
        print(f"{path.name}: {label} already applied")
        return
    if old not in text:
        raise SystemExit(f"{path.name}: could not find the {label} block to patch")
    path.write_bytes(text.replace(old, new, 1).replace("\n", "\r\n").encode())
    print(f"{path.name}: {label} patched")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: patch_altserver.py ALT_SERVER_LINUX_ROOT", file=sys.stderr)
        return 2
    root = Path(argv[1])
    app = root / "upstream_repo" / "AltServer" / "AltServerApp.cpp"
    device = root / "upstream_repo" / "AltServer" / "DeviceManager.cpp"
    if not app.is_file() or not device.is_file():
        raise SystemExit(f"missing AltServer sources under {root}")
    _edit(
        app,
        '\t\tupdatedParentBundleID = parentBundleID + "." + team->identifier();\n',
        '\t\todslog("Keeping original bundle identifier " << parentBundleID);\n'
        "\t\tupdatedParentBundleID = parentBundleID;\n",
        "bundle id",
    )
    _edit(
        device,
        "\t\t\tif (shouldManageProfiles)\n"
        "\t\t\t{\t\t\t\t\n"
        "\t\t\t\t// Free developer account was used to sign this app, so we need to remove all\n"
        "\t\t\t\t// provisioning profiles in order to remain under sideloaded app limit.\n"
        "\n"
        "\t\t\t\tauto removedProfiles = this->RemoveAllFreeProvisioningProfilesExcludingBundleIdentifiers({}, mis);\n"
        "\t\t\t\tfor (auto& pair : removedProfiles)\n"
        "\t\t\t\t{\n"
        "\t\t\t\t\tif (activeProfiles.has_value())\n"
        "\t\t\t\t\t{\n"
        "\t\t\t\t\t\tif (activeProfiles->count(pair.first) > 0)\n"
        "\t\t\t\t\t\t{\n"
        "\t\t\t\t\t\t\t// Only cache active profiles to reinstall afterwards.\n"
        "\t\t\t\t\t\t\t(*cachedProfiles)[pair.first] = pair.second;\n"
        "\t\t\t\t\t\t}\n"
        "\t\t\t\t\t}\n"
        "\t\t\t\t\telse\n"
        "\t\t\t\t\t{\n"
        "\t\t\t\t\t\t// Cache all profiles to reinstall afterwards if we didn't provide activeProfiles.\n"
        "\t\t\t\t\t\t(*cachedProfiles)[pair.first] = pair.second;\n"
        "\t\t\t\t\t}\n"
        "\t\t\t\t}\t\t\t\t\n"
        "\t\t\t}\n",
        "\t\t\tif (shouldManageProfiles && application->provisioningProfile() != NULL)\n"
        "\t\t\t{\n"
        "\t\t\t\t// Leave profiles already on the phone in place. Removing one clears\n"
        "\t\t\t\t// the developer trust. The new profile is added beside them.\n"
        '\t\t\t\todslog("Installing provisioning profile without removing the ones already on the phone");\n'
        "\t\t\t\tthis->InstallProvisioningProfile(application->provisioningProfile(), mis);\n"
        "\t\t\t}\n",
        "profile removal",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
