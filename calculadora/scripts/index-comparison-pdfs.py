"""Index the printed reference in original comparison PDFs without exporting it.

Pass one or more PDFs or folders, optionally with additional paths on stdin. Only
PDFs used by the eight comparison tables are read. Re-run after importing quotes.
Use --rebuild to verify every entry again from the originals.
"""
import argparse
import csv
import hashlib
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
           "accelerated-maturity-declines", "independent-ci-tpd", "fracture-comparisons")


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
    if INDEX.exists() and not args.rebuild:
        with INDEX.open() as existing:
            index = {r["sha256"]: r["report_key"] for r in csv.DictReader(existing)
                     if r["sha256"] in sources}
    missing = sources.keys() - index.keys()
    paths = args.paths + ([Path(p.rstrip("\n")) for p in sys.stdin if p.strip()] if args.stdin else [])
    for root in paths:
        if not missing:
            break
        for path in ([root] if root.is_file() else root.rglob("Comparison Report*.pdf")):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest not in missing:
                continue
            cover = subprocess.check_output(["pdftotext", "-f", "1", "-l", "1", "-layout", str(path), "-"], text=True)
            refs = set(re.findall(r"Your Reference:[ \t]*(\d+)\b", cover))
            if len(refs) != 1 or (sources[digest] and refs != sources[digest]):
                raise ValueError("Missing or conflicting printed reference for " + digest)
            encoded = ("solutionbuilder-comparison:" + refs.pop()).encode("ascii")
            index[digest] = hashlib.sha256(encoded).hexdigest()[:32]
            missing.remove(digest)
    if missing:
        raise SystemExit(f"{len(missing)} original comparison PDFs still required. Index not replaced.")
    with tempfile.NamedTemporaryFile(mode="w", dir=DATA, delete=False) as out:
        writer = csv.writer(out, lineterminator="\n")
        writer.writerow(("sha256", "report_key"))
        writer.writerows(sorted(index.items()))
    os.replace(out.name, INDEX)
    print(f"{len(index)} source PDFs, {len(set(index.values()))} distinct printed references")


if __name__ == "__main__":
    main()
