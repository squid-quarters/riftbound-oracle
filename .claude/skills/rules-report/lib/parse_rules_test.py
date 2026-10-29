"""Regression tests for the dates printed in Riot's source documents."""
import os
import tempfile
import unittest
import subprocess
import sys
from pathlib import Path

from parse_rules import source_version


class SourceVersionTests(unittest.TestCase):
    def read_version(self, heading):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "tournament-rules.md")
            with open(path, "w", encoding="utf-8") as output:
                output.write("Riftbound Tournament Rules\n" + heading + "\n")
            return source_version(path)

    def test_official_numeric_formats(self):
        for heading in ("Last Updated: 2026-10-09", "Last Updated 10/9/2026"):
            with self.subTest(heading=heading):
                self.assertEqual(self.read_version(heading), "2026-10-09")

    def test_radiance_tournament_date(self):
        self.assertEqual(self.read_version("Last Updated October 9, 2026"), "2026-10-09")

    def test_named_month_is_case_insensitive(self):
        self.assertEqual(self.read_version("Last Updated: OCTOBER 9, 2026"), "2026-10-09")

    def test_missing_date_is_refused(self):
        with self.assertRaises(SystemExit):
            self.read_version("No publication date")

    def test_impossible_named_date_is_refused(self):
        with self.assertRaises(SystemExit):
            self.read_version("Last Updated February 30, 2026")

    def test_structural_failure_preserves_prior_output(self):
        cases = {
            "out of order": "999. Fabricated wrapped reference.\n100. Game Concepts\n",
            "missing parent": "100. Game Concepts\n101.1. No printed parent.\n",
            "missing reference": "100. Game Concepts. See rule 999.\n",
        }
        for name, body in cases.items():
            with self.subTest(case=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "core-rules.md").write_text("Last Updated: 2026-10-09\n" + body)
                (root / "tournament-rules.md").write_text("Last Updated October 9, 2026\n100. Introduction\n")
                output = root / "rules.json"
                output.write_text("verified previous JSON")
                run = subprocess.run([sys.executable, str(Path(__file__).with_name("parse_rules.py")), "--json", str(output)],
                                     env=dict(os.environ, RIFTBOUND_CORPUS=directory), capture_output=True, text=True)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn("Integrity failed", run.stderr)
                self.assertEqual(output.read_text(), "verified previous JSON")


if __name__ == "__main__":
    unittest.main()
