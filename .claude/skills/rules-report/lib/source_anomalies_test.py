import copy
import json
from pathlib import Path
import unittest

from source_anomalies import matching, records


class AnomalyTests(unittest.TestCase):
    def test_only_the_exact_printed_defects_are_recognised(self):
        rules = json.loads((Path(__file__).parent.parent / "data/rules.json").read_text())
        for entry in records():
            rule = next(r for r in rules if r["doc"] == entry["doc"] and r["id"] == entry["rule"])
            with self.subTest(rule=entry["rule"]):
                self.assertEqual(matching(rule, entry["kind"], entry["target"], entry["source"]["sha256"]), [entry])
                self.assertEqual(matching(rule, entry["kind"], "999.9"), [])
                self.assertEqual(matching(rule, source_sha256="0" * 64), [])
                for key, value in (("version", "2099-01-01"), ("text", rule["text"] + " altered"), ("id", "999")):
                    changed = copy.deepcopy(rule)
                    changed[key] = value
                    self.assertEqual(matching(changed), [])


if __name__ == "__main__":
    unittest.main()
