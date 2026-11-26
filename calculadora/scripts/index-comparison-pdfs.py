"""Index the printed reference in original comparison PDFs without exporting it.

Pass one or more PDFs or folders, optionally with additional paths on stdin. Only
PDFs used by the comparison tables are read. Re-run after importing quotes.
Use --rebuild to verify every entry again from the originals.
"""
import argparse
import csv
import hashlib
import json
from datetime import datetime
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


DATA = Path(__file__).resolve().parents[1] / "data"
INDEX = DATA / "comparison-pdf-index.csv"
SOURCES = ("solutionbuilder-observed-2026-11-24", "verified-archive-terms",
           "comparisons-with-waiver", "waiver-individual-offers", "accelerated-comparisons",
           "accelerated-maturity-declines", "independent-ci-tpd", "fracture-comparisons", "supplemental-life-offers", "fixed-term-life", "comparison-product-declines")


def request_key(cover):
    """Group equal benefits from the cover, without retaining personal identifiers."""
    person = re.search(r"^Client:.*?\ba (?:Male|Female) (smoker|non-smoker)(?: who has never smoked)?, born on ([\d/]+)", cover, re.M | re.I)
    issued = re.search(r"Date Requested:\s*([\d/]+)", cover)
    benefits = re.findall(r"^[ \t]*•[ \t]+([^\n]+(?:\n[ \t]{6,}[^\s•][^\n]*)*)",
                          cover.partition("Benefits selected")[2], re.M)
    normalized = sorted(" ".join(b.lower().replace(",", "").split()) for b in benefits)
    if not person or not issued or not normalized or not all(
            b.startswith("level term assurance") and "guaranteed" in b for b in normalized):
        return ""
    try:
        birth, day = [datetime.strptime(x, "%d/%m/%Y").date() for x in (person[2], issued[1])]
    except ValueError:
        return ""
    age = day.year - birth.year - ((day.month, day.day) < (birth.month, birth.day))
    fields = json.dumps([age, person[1].lower(), normalized], separators=(",", ":"))
    return hashlib.sha256(("solutionbuilder-request:" + fields).encode("utf-8")).hexdigest()[:32]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", type=Path, nargs="*")
    parser.add_argument("--stdin", action="store_true", help="One source path per line.")
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()
    sources = {}
    for name in SOURCES:
        with (DATA / (name + ".csv")).open() as table:
            for row in csv.DictReader(table):
                refs = sources.setdefault(row["sha256"], set())
                if row.get("reference"):
                    refs.add(row["reference"])
    index = {}
    requests = {}
    if INDEX.exists() and not args.rebuild:
        with INDEX.open() as existing:
            for row in csv.DictReader(existing):
                if row["sha256"] in sources:
                    index[row["sha256"]] = row["report_key"]
                    requests[row["sha256"]] = row.get("request_key") or ""
    missing = sources.keys() - index.keys()
    enrich = {digest for digest in index if not requests[digest]}
    paths = args.paths + ([Path(p.rstrip("\n")) for p in sys.stdin if p.strip()] if args.stdin else [])
    for root in paths:
        if not missing and not enrich:
            break
        for path in ([root] if root.is_file() else root.rglob("Comparison Report*.pdf")):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest not in missing and digest not in enrich:
                continue
            cover = subprocess.check_output(["pdftotext", "-f", "1", "-l", "1", "-layout", str(path), "-"], text=True)
            refs = set(re.findall(r"Your Reference:[ \t]*(\d+)\b", cover))
            if len(refs) != 1 or (sources[digest] and refs != sources[digest]):
                raise ValueError("Missing or conflicting printed reference for " + digest)
            encoded = ("solutionbuilder-comparison:" + refs.pop()).encode("ascii")
            index[digest] = hashlib.sha256(encoded).hexdigest()[:32]
            requests[digest] = request_key(cover)
            missing.discard(digest)
            enrich.discard(digest)
    if missing:
        raise SystemExit(f"{len(missing)} original comparison PDFs still required. Index not replaced.")
    with tempfile.NamedTemporaryFile(mode="w", dir=DATA, delete=False) as out:
        writer = csv.writer(out, lineterminator="\n")
        writer.writerow(("sha256", "report_key", "request_key"))
        writer.writerows((digest, index[digest], requests[digest]) for digest in sorted(index))
    os.replace(out.name, INDEX)
    print(f"{len(index)} source PDFs, {len(set(index.values()))} distinct printed references")


if __name__ == "__main__":
    main()
