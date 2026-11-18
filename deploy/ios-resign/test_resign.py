import json
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


if __name__ == "__main__":
    unittest.main()
