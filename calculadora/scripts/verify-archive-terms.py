"""Export historical provider offers with the same benefit, riders and frequency as the form."""
import argparse
import csv
import hashlib
import importlib.util
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.dont_write_bytecode = True
here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("comparison", here / "import-observed-comparison.py")
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", type=Path)
    parser.add_argument("--reported-pdf", action="append", type=Path, default=[],
                        help="Also verify an original comparison listed by its printed reference.")
    args = parser.parse_args()
    references = {}
    for filename in ("solutionbuilder-priority-provider-archive-2026-11-21.csv",
                     "solutionbuilder-priority-provider-gap-archive-2026-11-21.csv"):
        with (here.parent / "data" / filename).open() as source:
            for row in csv.DictReader(source):
                digest = re.search(r"sha256 ([0-9a-f]{64})$", row["notes"])[1]
                references[digest] = row
    with (here.parent / "data/solutionbuilder-priority-providers-2026-11-20.csv").open() as source:
        by_ref = {r["model_id"]: r for r in csv.DictReader(source)
                  if r["notes"] == "Recovered from official comparison report reference " + r["model_id"]}
    for pdf in args.reported_pdf:
        cover = subprocess.check_output(["pdftotext", "-layout", "-f", "1", "-l", "1", str(pdf), "-"], text=True)
        ref = re.search(r"Your Reference:\s*(\d+)", cover)
        if not ref or ref[1] not in by_ref:
            raise ValueError("Supplemental PDF does not match a registered printed reference.")
        references[hashlib.sha256(pdf.read_bytes()).hexdigest()] = by_ref[ref[1]]
    processed, accepted = set(), []
    issues = Counter()
    sources = [args.reported_pdf, *(root.rglob("Comparison Report - without commission.pdf") for root in args.roots)]
    for group in sources:
        for pdf in group:
            digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
            if digest not in references or digest in processed:
                continue
            processed.add(digest)
            r = references[digest]
            try:
                rows = comparison.extract(pdf, r["model_id"], int(r["age"]), r["smoker"],
                                          int(r["to_age"]), int(r["life_cover"]), int(r["critical_illness_cover"]),
                                          allow_unlisted=True, include_tpd=True)
            except ValueError as exc:
                issues[str(exc)] += 1
                continue
            if rows[0][0] != r["source_date"]:
                raise ValueError(f"Archive source date mismatch for {r['model_id']}")
            accepted.extend(rows)
    if set(references) != processed:
        raise SystemExit(f"Missing {len(set(references) - processed)} source reports. Supply all archive folders.")
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow((*comparison.FIELDS, "quoted_tpd"))
    writer.writerows(sorted(accepted, key=lambda r: (r[0], r[1], r[7])))
    print(f"{len(processed)} reports matched by SHA-256, {len(accepted)//3} compatible reports", file=sys.stderr)
    for issue, count in sorted(issues.items()):
        print(f"{count} · {issue}", file=sys.stderr)


if __name__ == "__main__":
    main()
