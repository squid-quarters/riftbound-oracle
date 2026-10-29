"""Rules inside PDF tables must not be emitted twice."""
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


class Page:
    def extract_text(self):
        return "100. Game Concepts\n101. Deck Construction\n101.1. Keep this rule once."

    def extract_tables(self):
        return [[['101.', 'Deck Construction'], ['101.1.', 'Keep this\nrule once.']]]


class PDF:
    pages = [Page()]
    def __enter__(self): return self
    def __exit__(self, *args): pass


class ExtractionTests(unittest.TestCase):
    def load_extractor(self):
        # The unit fixture supplies page data; no installed PDF library or
        # network is required to test the extraction policy.
        fake = types.SimpleNamespace(open=lambda _: PDF())
        spec = importlib.util.spec_from_file_location("pdf_extract", Path(__file__).with_name("pdf-extract.py"))
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"pdfplumber": fake}):
            spec.loader.exec_module(module)
        return module

    def test_rule_table_prose_has_one_representation(self):
        extractor = self.load_extractor()
        with contextlib.redirect_stderr(io.StringIO()) as progress:
            text = extractor.extract_text("fixture.pdf")
        self.assertEqual(text, Page().extract_text())
        self.assertNotIn("|", text)
        self.assertEqual(text.count("101.1."), 1)
        self.assertIn("PROGRESS:1/1", progress.getvalue())

    def test_additional_tables_require_explicit_opt_in(self):
        extractor = self.load_extractor()
        with contextlib.redirect_stderr(io.StringIO()):
            text = extractor.extract_text("fixture.pdf", include_tables=True)
        self.assertIn("| 101.1. | Keep this\nrule once. |", text)


if __name__ == "__main__":
    unittest.main()
