import json
import plistlib
import struct
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import resign


NOW = datetime(2026, 11, 18, 15, 0, tzinfo=timezone.utc)


def decide(**overrides):
    fields = {
        "last_success": None,
        "now": NOW,
        "device_present": True,
        "ipa_present": True,
        "locked": False,
    }
    fields.update(overrides)
    return resign.refresh_decision(**fields)


class RefreshDecisionTest(unittest.TestCase):
    def test_installs_when_the_phone_has_never_been_refreshed(self):
        action, reason = decide()
        self.assertEqual(action, "install")
        self.assertIn("unlocked", reason)

    def test_skips_inside_the_five_day_window(self):
        action, _reason = decide(last_success=NOW - timedelta(days=4, hours=23))
        self.assertEqual(action, "skip")

    def test_installs_when_the_window_has_just_elapsed(self):
        action, _reason = decide(last_success=NOW - timedelta(days=5))
        self.assertEqual(action, "install")

    def test_waits_for_the_ipa(self):
        action, reason = decide(last_success=NOW - timedelta(days=6), ipa_present=False)
        self.assertEqual(action, "wait")
        self.assertIn("IPA", reason)

    def test_waits_until_the_phone_is_on_the_home_network(self):
        action, reason = decide(last_success=NOW - timedelta(days=6), device_present=False)
        self.assertEqual(action, "wait")
        self.assertIn("home network", reason)

    def test_waits_while_the_phone_is_locked(self):
        action, reason = decide(last_success=NOW - timedelta(days=6), locked=True)
        self.assertEqual(action, "wait")
        self.assertIn("locked", reason)

    def test_installs_a_new_build_inside_the_refresh_window(self):
        action, reason = decide(last_success=NOW - timedelta(hours=1), build_changed=True)
        self.assertEqual(action, "install")
        self.assertIn("new build", reason)

    def test_an_upgrade_keeps_the_original_bundle_id(self):
        self.assertEqual(resign.install_plan("H37YJZ72LS.com.momentum.workout"), "upgrade")

    def test_a_renamed_bundle_id_is_a_different_app(self):
        self.assertEqual(resign.install_plan("H37YJZ72LS.com.momentum.workout.H37YJZ72LS"), "other")
        self.assertEqual(
            resign.bundle_id_from_application_identifier("H37YJZ72LS.com.momentum.workout.H37YJZ72LS"),
            "com.momentum.workout.H37YJZ72LS",
        )

    def test_an_unsigned_build_is_not_installed(self):
        self.assertEqual(resign.install_plan(None), "unsigned")
        self.assertEqual(resign.install_plan(""), "unsigned")

    def test_a_missing_phone_restarts_the_bridge_once_and_then_appears(self):
        calls = {"listed": 0, "restart": 0}

        def listed():
            calls["listed"] += 1
            return (False, calls["listed"] >= 3)

        def restart():
            calls["restart"] += 1

        on_usb, on_network = resign.relocate_device(listed, restart, sleep=lambda _seconds: None, attempts=5)
        self.assertEqual((on_usb, on_network), (False, True))
        self.assertEqual(calls["restart"], 1)

    def test_a_visible_phone_does_not_restart_the_bridge(self):
        def restart():
            raise AssertionError("bridge restarted")

        self.assertEqual(resign.relocate_device(lambda: (False, True), restart, attempts=1), (False, True))

    def test_installs_when_an_update_was_requested(self):
        action, reason = decide(last_success=NOW - timedelta(hours=1), forced=True)
        self.assertEqual(action, "install")
        self.assertIn("requested", reason)

    def test_a_request_still_waits_until_the_phone_is_unlocked(self):
        action, reason = decide(last_success=NOW - timedelta(hours=1), forced=True, locked=True)
        self.assertEqual(action, "wait")
        self.assertIn("locked", reason)

    def test_renews_a_signature_that_expires_within_two_days(self):
        action, reason = decide(last_success=NOW - timedelta(hours=1), profile_expiring=True)
        self.assertEqual(action, "install")
        self.assertIn("expiry", reason)

    def test_an_expiring_signature_still_waits_while_the_phone_is_locked(self):
        action, reason = decide(last_success=NOW - timedelta(days=6), profile_expiring=True, locked=True)
        self.assertEqual(action, "wait")
        self.assertIn("locked", reason)

    def test_a_fresh_signature_is_not_treated_as_expiring(self):
        self.assertFalse(resign.signature_is_expiring(NOW + timedelta(days=4), NOW))
        self.assertTrue(resign.signature_is_expiring(NOW + timedelta(hours=47), NOW))
        self.assertFalse(resign.signature_is_expiring(None, NOW))

    def test_install_choice_keeps_a_valid_signature_and_renews_a_short_one(self):
        fresh = NOW + timedelta(days=6)
        short = NOW + timedelta(hours=30)
        self.assertEqual(resign.choose_install("upgrade", fresh, None, NOW), "upgrade")
        self.assertEqual(resign.choose_install("upgrade", short, None, NOW), "resign")
        self.assertEqual(resign.choose_install("unsigned", None, fresh, NOW), "resign")
        self.assertEqual(resign.choose_install("other", fresh, None, NOW), "refuse")
        self.assertEqual(resign.choose_install("upgrade", short, fresh, NOW), "skip")
        self.assertEqual(resign.choose_install("upgrade", NOW + timedelta(days=1), short, NOW), "resign")

    def test_state_keeps_the_signature_expiry_across_later_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            expires = NOW + timedelta(days=6)
            resign.write_state(path, NOW, 10, expires)
            resign.write_state(path, NOW + timedelta(hours=1))
            self.assertEqual(resign.load_signature_expiry(path), expires)
            self.assertEqual(resign.load_ipa_mtime(path), 10)

    def test_signer_is_patched_only_when_both_markers_are_present(self):
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory) / "AltServer"
            binary.write_bytes(b"Keeping original bundle identifier")
            self.assertFalse(resign.signer_is_patched(binary))
            binary.write_bytes(b"Keeping original bundle identifier\0without removing the ones already on the phone")
            self.assertTrue(resign.signer_is_patched(binary))

    def test_build_is_newer_ignores_a_missing_record(self):
        self.assertFalse(resign.build_is_newer(10, None))
        self.assertTrue(resign.build_is_newer(10, 8))
        self.assertFalse(resign.build_is_newer(10, 10))

    def test_state_remembers_the_installed_ipa_mtime(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            resign.write_state(path, NOW, 1234.5)
            self.assertEqual(resign.load_last_success(path), NOW)
            self.assertEqual(resign.load_ipa_mtime(path), 1234.5)

    def test_honors_a_shorter_refresh_interval(self):
        action, _reason = decide(
            last_success=NOW - timedelta(days=2),
            refresh_after=timedelta(days=1),
        )
        self.assertEqual(action, "install")

    def test_first_run_is_due(self):
        self.assertTrue(resign.due(None, NOW))

    def test_state_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            resign.write_state(path, NOW)
            self.assertEqual(resign.load_last_success(path), NOW)

    def test_missing_or_broken_state_counts_as_never_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing.json"
            broken = Path(directory) / "broken.json"
            broken.write_text("{")
            self.assertIsNone(resign.load_last_success(missing))
            self.assertIsNone(resign.load_last_success(broken))
            not_a_time = Path(directory) / "bad-time.json"
            not_a_time.write_text(json.dumps({"last_success": "yesterday"}))
            self.assertIsNone(resign.load_last_success(not_a_time))

    def test_redacts_the_apple_password(self):
        self.assertEqual(resign.redact("password=secret", "secret"), "password=***")

    def test_systemd_env_quotes_spaces_hashes_and_quotes(self):
        text = resign.systemd_environment({"APPLE_PASSWORD": 'sec ret#"'})
        self.assertTrue(text.endswith('"\n'))
        inner = text[len('APPLE_PASSWORD="') : -2]
        self.assertEqual(inner, 'sec ret#\\"')

    def test_systemd_env_drops_newlines(self):
        text = resign.systemd_environment({"APPLE_ID": "a\nb"})
        self.assertEqual(text, 'APPLE_ID="ab"\n')

    def test_systemd_env_rejects_a_bad_key(self):
        with self.assertRaises(ValueError):
            resign.systemd_environment({"apple-id": "a"})

    def test_paired_iphone_skips_simulators_and_prefers_the_network(self):
        document = {
            "result": {
                "devices": [
                    {"hardwareProperties": {"reality": "simulated", "productType": "iPhone18,3", "udid": "sim"}},
                    {
                        "deviceProperties": {"name": "tristan"},
                        "hardwareProperties": {"reality": "physical", "productType": "iPhone17,4", "udid": "real"},
                        "connectionProperties": {"transportType": "localNetwork"},
                    },
                ]
            }
        }
        self.assertEqual(resign.paired_iphone(document)["udid"], "real")

    def test_paired_iphone_returns_none_when_only_simulators_are_listed(self):
        document = {"result": {"devices": [{"hardwareProperties": {"reality": "simulated", "productType": "iPhone18,3", "udid": "sim"}}]}}
        self.assertIsNone(resign.paired_iphone(document))


class PairExportTest(unittest.TestCase):
    def test_pairing_files_keep_the_private_key_off_the_system_plist(self):
        record = {
            "HostID": "host",
            "SystemBUID": "buid",
            "HostPrivateKey": b"secret",
        }
        files = resign.pairing_files(record, "UDID")
        device = plistlib.loads(files["UDID.plist"])
        system = plistlib.loads(files["SystemConfiguration.plist"])
        self.assertEqual(device["UDID"], "UDID")
        self.assertEqual(device["HostPrivateKey"], b"secret")
        self.assertEqual(system, {"HostID": "host", "SystemBUID": "buid"})

    def test_usbmux_packet_is_a_version_one_plist_message(self):
        packet = resign.usbmux_plist_packet({"MessageType": "ReadPairRecord"})
        length, version, message, tag = struct.unpack("<IIII", packet[:16])
        self.assertEqual(length, len(packet))
        self.assertEqual((version, message, tag), (1, 8, 1))
        self.assertEqual(plistlib.loads(packet[16:])["MessageType"], "ReadPairRecord")


class UpdateTriggerTest(unittest.TestCase):
    def test_refuses_public_and_tailscale_peers(self):
        import trigger

        self.assertTrue(trigger.peer_allowed("192.168.7.158"))
        self.assertTrue(trigger.peer_allowed("::ffff:192.168.7.158"))
        self.assertTrue(trigger.peer_allowed("127.0.0.1"))
        self.assertFalse(trigger.peer_allowed("100.72.15.41"))
        self.assertFalse(trigger.peer_allowed("8.8.8.8"))
        self.assertFalse(trigger.peer_allowed("not-an-ip"))


if __name__ == "__main__":
    unittest.main()
