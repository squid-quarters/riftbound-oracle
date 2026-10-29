#!/usr/bin/env python3
"""
Extract text from a PDF file and output it to stdout.
Progress is reported to stderr so the parent process can update its spinner.

Usage: python3 pdf-extract.py <path-to-pdf> [--include-tables]
"""

import sys
import pdfplumber


def extract_text(pdf_path: str, include_tables: bool = False) -> str:
    pages: list[str] = []

    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            # Report progress to stderr (read by the TS process)
            print(f"PROGRESS:{i + 1}/{total}", file=sys.stderr, flush=True)

            text = page.extract_text()
            if text:
                pages.append(text)

            # extract_text already includes text inside table cells. Appending
            # a second rendering duplicates that prose; multiline table cells
            # then leak into unrelated rules/examples in the rule parser.
            # Rules therefore use one representation. Generic PDF conversions
            # may explicitly request the legacy additional table rendering.
            tables = page.extract_tables() if include_tables else []
            for table in tables:
                if table:
                    # Convert table to markdown format
                    rows = []
                    for j, row in enumerate(table):
                        cells = [str(cell or "").strip() for cell in row]
                        rows.append("| " + " | ".join(cells) + " |")
                        if j == 0:
                            rows.append(
                                "| " + " | ".join("---" for _ in cells) + " |"
                            )
                    pages.append("\n".join(rows))

    return "\n\n".join(pages)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 pdf-extract.py <path-to-pdf> [--include-tables]", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        text = extract_text(pdf_path, include_tables="--include-tables" in sys.argv[2:])
        print(text)
    except FileNotFoundError:
        print(f"Error: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error extracting PDF: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
