"""Narrow, source-pinned notices for defects visibly printed by Riot.

These records never alter a rule or invent a missing parent. A different date,
rule text, or target loses the exception and must fail integrity checks again.
The rebuild also checks the original PDF hash; standalone installs match the
exact rule text because their input PDFs are intentionally not vendored.
"""
import hashlib
import json
from pathlib import Path
from functools import lru_cache

REGISTRY = Path(__file__).resolve().parent.parent / "data/source-anomalies.json"


@lru_cache(maxsize=1)
def records():
    return json.loads(REGISTRY.read_text(encoding="utf-8"))["anomalies"]


def matching(rule, kind=None, target=None, source_sha256=None):
    digest = hashlib.sha256(rule["text"].encode("utf-8")).hexdigest()
    return [entry for entry in records()
            if entry["doc"] == rule["doc"] and entry["rule"] == rule["id"]
            and entry["version"] == rule["version"] and entry["text_sha256"] == digest
            and (kind is None or entry["kind"] == kind)
            and (target is None or entry["target"] == target)
            and (source_sha256 is None or entry["source"]["sha256"] == source_sha256)]
