"""Export comparable UK level-life quotes with an explicit waiver from local PDFs."""

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


def read_comparison(path):
    pages = subprocess.check_output(
        ["pdftotext", "-layout", "-f", "1", "-l", "2", str(path), "-"],
        encoding="utf-8",
    ).split("\f")
    if len(pages) < 2:
        return None
    cover, results = pages[:2]
    benefits = re.findall(r"^\s*•\s*([^\n]+)", cover, re.M)
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
        if len(matches) != 1:
            return None
        price, amount, term, waiver = matches[0]
        duration = int(re.search(r"\d+", term)[0])
        valid_term = duration == end if term.startswith("To Age") else duration in (end - age, end - age - 1)
        if int(amount.replace(",", "")) != life or not valid_term or float(price) <= 0:
            return None
        rows.append((requested.isoformat(), age, client[1].lower() == "smoker", end,
                     life, provider, product, price, term, waiver, digest))
    return reference[1], rows


def main(roots):
    paths = subprocess.run(
        ["rg", "--files", "--hidden", "--no-ignore", "-0", "-g", "!**/.git/**",
         "-g", "Comparison Report - without commission.pdf", *roots],
        capture_output=True, check=False,
    )
    if paths.returncode not in (0, 1):
        raise SystemExit(paths.stderr.decode())
    reports = {}
    for filename in sorted(set(paths.stdout.decode().split("\0")) - {""}):
        result = read_comparison(Path(filename))
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
    if len(sys.argv) < 2:
        raise SystemExit("Pass one or more directories holding Comparison Reports.")
    main(sys.argv[1:])
