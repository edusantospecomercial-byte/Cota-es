"""Export comparable UK level-life quotes with an explicit waiver from local PDFs."""

import argparse
import csv
import hashlib
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path


PRODUCTS = {
    "Legal & General Life": "Legal & General",
    "Aviva Life Insurance+": "Aviva",
    "Zurich Life": "Zurich",
}
COLUMNS = ("source_date", "age", "smoker", "to_age", "life_cover", "provider",
           "product", "monthly_premium", "quoted_term", "waiver_to", "sha256")


def read_comparison(path, partial=False):
    pages = subprocess.check_output(
        ["pdftotext", "-layout", str(path), "-"],
        encoding="utf-8",
    ).split("\f")
    if len(pages) < 2:
        return None
    cover = pages[0]
    results = "\n".join(pages[1:]).partition("Products Not Quoting:")[0]
    benefits = [" ".join(line.split()) for line in re.findall(
        r"^[ \t]*•[ \t]+([^\n]+(?:\n[ \t]{6,}[^\s•][^\n]*)*)", cover, re.M
    )]
    if len(benefits) != 1 or not re.search(r"Quotation basis:\s*Benefit-led", cover):
        return None
    benefit = re.fullmatch(
        r"Level Term Assurance: 1st life, £([\d,]+) life cover, "
        r"policy duration is to age (\d+), premiums are guaranteed", benefits[0].strip(),
    )
    client = re.search(r"^Client:.*?\ba (?:Male|Female) (non-smoker|smoker)(?: who has never smoked)?, born on ([\d/]+)", cover, re.M | re.I)
    date = re.search(r"Date Requested:\s*([\d/]+)", cover)
    reference = re.search(r"Your Reference:\s*(\d+)", cover)
    if not all((benefit, client, date, reference)) or "Non Underwritten Results" not in results:
        return None
    requested = datetime.strptime(date[1], "%d/%m/%Y").date()
    birth = datetime.strptime(client[2], "%d/%m/%Y").date()
    age = requested.year - birth.year - ((requested.month, requested.day) < (birth.month, birth.day))
    life, end = int(benefit[1].replace(",", "")), int(benefit[2])
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    rows = []
    for product, provider in PRODUCTS.items():
        # Full rows only. Match the actual waiver column; a blank cell is common.
        pattern = (r"^\s*" + re.escape(product)
                   + r"\s+£(\d+\.\d{2})\s+Guaranteed\s+No\s+Monthly\s+£([\d,]+)"
                     r"\s+(To Age \d+|\d+ years?)\s+Level\s+(Expiry|\d+)\s+None\s+No[ \t]*$")
        matches = re.findall(pattern, results.split("Non Underwritten Results", 1)[1], re.M)
        if not matches and partial:
            continue
        if len(set(matches)) != 1:
            return None
        price, amount, term, waiver = matches[0]
        duration = int(re.search(r"\d+", term)[0])
        valid_term = duration == end if term.startswith("To Age") else duration in (end - age, end - age - 1)
        if not valid_term or float(price) <= 0:
            return None
        if int(amount.replace(",", "")) != life:
            if partial:
                continue
            return None
        rows.append((requested.isoformat(), age, client[1].lower() == "smoker", end,
                     life, provider, product, price, term, waiver, digest))
    return (reference[1], rows) if rows else None


def main(roots, supplemental=False):
    paths = subprocess.run(
        ["rg", "--files", "--hidden", "--no-ignore", "-0", "-g", "!**/.git/**",
         "-g", "Comparison Report - without commission.pdf", *roots],
        capture_output=True, check=False,
    )
    if paths.returncode not in (0, 1):
        raise SystemExit(paths.stderr.decode())
    reports = {}
    represented = set()
    if supplemental:
        with (Path(__file__).resolve().parent.parent / "data/comparisons-with-waiver.csv").open() as source:
            represented = {row["sha256"] for row in csv.DictReader(source)}
    seen = set()
    for filename in sorted(set(paths.stdout.decode().split("\0")) - {""}):
        path = Path(filename)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in seen or digest in represented:
            continue
        seen.add(digest)
        result = read_comparison(path, partial=supplemental)
        if result is None:
            continue
        reference, rows = result
        previous = reports.get(reference)
        if previous and [r[:-1] for r in previous] != [r[:-1] for r in rows]:
            raise ValueError("Conflicting copies of a comparison report")
        if not previous or rows[0][-1] < previous[0][-1]:
            reports[reference] = rows
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(COLUMNS)
    for rows in sorted(reports.values(), key=lambda r: (r[0][0], r[0][-1])):
        writer.writerows(rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", type=Path)
    parser.add_argument("--supplemental", action="store_true", help="Include individually verified offers outside the complete-report dataset.")
    options = parser.parse_args()
    main(options.roots, options.supplemental)
