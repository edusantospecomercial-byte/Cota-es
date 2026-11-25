"""Extract historical UK life-or-earlier-CI comparisons at guaranteed monthly premiums."""

import argparse
import csv
from datetime import datetime
import hashlib
from pathlib import Path
import re
import subprocess
import sys


FIELDS = ("source_date", "reference", "age", "smoker", "to_age", "life_cover",
          "earlier_ci_cover", "provider", "product", "monthly_premium",
          "quoted_life_cover", "quoted_earlier_ci_cover", "quoted_term",
          "occupation_rated", "waiver_to", "tpd_basis", "sha256")
PRODUCTS = {
    "Zurich": "Zurich Life & CI",
    "Legal & General": "Legal & General Life + CI (Standard)",
    "Aviva": "Aviva Multi-Product with Core CI",
}
BENEFIT = re.compile(
    r"Level Term Assurance: 1st life, £([\d,]+) life & £([\d,]+) life or earlier "
    r"critical illness cover \(TPD: own occupation\), policy duration is to age (\d+), premiums are guaranteed"
)
OFFER = re.compile(
    r"£([\d,]+\.\d{2})\s+Guaranteed\s+(Yes|No)\s+Monthly\s+£([\d,]+)\s+£([\d,]+)"
    r"\s+(To Age \d+|\d+ years?)\s+Level\s+(?:(Expiry|\d+|No data)\s+)?(Own|Specified|FATs)\s+No"
)


def read_report(path):
    text = subprocess.check_output(["pdftotext", "-layout", str(path), "-"], encoding="utf8")
    cover, _, remaining = text.partition("\f")
    if "life or earlier critical illness cover" not in cover:
        return []
    # On the first page each bullet is one benefit. Read through soft wraps
    # so an extra rider on a continuation line cannot enter the reference.
    benefits = re.findall(r"^[ \t]*•[ \t]+([^\n]+(?:\n[ \t]{6,}[^\s•][^\n]*)*)", cover, re.M)
    benefit = BENEFIT.fullmatch(" ".join(benefits[0].split())) if len(benefits) == 1 else None
    if not benefit or not re.search(r"Quotation basis:\s*Benefit-led", cover) or not re.search(r"Premium frequency:\s*Monthly", cover):
        return []
    person = re.search(r"^Client:.*?\ba (?:Male|Female) (non-smoker|smoker)(?: who has never smoked)?, born on ([\d/]+)", cover, re.M | re.I)
    requested = re.search(r"Date Requested:\s*([\d/]+)", cover)
    reference = re.search(r"Your Reference:\s*(\d+)", cover)
    if not person or not requested or not reference:
        return []
    date, birth = [datetime.strptime(s, "%d/%m/%Y").date() for s in (requested[1], person[2])]
    age = date.year - birth.year - ((date.month, date.day) < (birth.month, birth.day))
    life, ci, end = [int(s.replace(",", "")) for s in benefit.groups()]
    if min(life, ci) <= 0 or age >= end:
        return []
    results, _, unavailable = remaining.partition("Products Not Quoting:")
    if "Non Underwritten Results" not in results:
        return []
    source = hashlib.sha256(path.read_bytes()).hexdigest()
    rows = []
    for provider, product in PRODUCTS.items():
        prefix = r"^[ \t]*" + re.escape(product) + r"[ \t]{2,}"
        lines = {s.strip() for s in re.findall(prefix + r"(£[^\n]+)", results, re.M)}
        if not lines and re.search(prefix + r"\S", unavailable, re.M):
            continue
        if len(lines) != 1:
            return []
        offer = OFFER.fullmatch(lines.pop())
        if not offer:
            return []
        price, rated, quoted_life, quoted_ci, term, waiver, tpd = offer.groups()
        price = price.replace(",", "")
        quoted_life, quoted_ci = int(quoted_life.replace(",", "")), int(quoted_ci.replace(",", ""))
        term_number = int(re.search(r"\d+", term)[0])
        valid_term = term_number == end if term.startswith("To Age") else term_number in (end-age-1, end-age)
        if not valid_term or min(quoted_life, quoted_ci) <= 0 or float(price) <= 0:
            return []
        rows.append((date.isoformat(), reference[1], age, "Yes" if person[1].lower() == "smoker" else "No",
                     end, life, ci, provider, product, price, quoted_life, quoted_ci, term,
                     rated, waiver or "not_shown", tpd, source))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", type=Path)
    args = parser.parse_args()
    files = subprocess.run(["rg", "--files", "--hidden", "--no-ignore", "-0", "-g", "!**/.git/**",
                            "-g", "!**/node_modules/**", "-g", "Comparison Report - without commission.pdf",
                            *map(str, args.roots)], capture_output=True, check=False)
    if files.returncode not in (0, 1):
        raise SystemExit(files.stderr.decode())
    seen, reports = set(), {}
    for name in sorted(set(files.stdout.decode().split("\0")) - {""}):
        path = Path(name)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        rows = read_report(path)
        if not rows:
            continue
        ref = rows[0][1]
        if ref in reports and [r[:-1] for r in rows] != [r[:-1] for r in reports[ref]]:
            raise ValueError(f"Conflicting versions of reference {ref}")
        if ref not in reports or digest < reports[ref][0][-1]:
            reports[ref] = rows
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(FIELDS)
    for rows in sorted(reports.values(), key=lambda rows: (rows[0][0], rows[0][1])):
        writer.writerows(rows)
    print(f"{len(seen)} distinct PDFs scanned, {len(reports)} qualifying reports", file=sys.stderr)


if __name__ == "__main__":
    main()
