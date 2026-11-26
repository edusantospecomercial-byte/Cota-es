"""Extract UK guaranteed-premium life and critical illness comparisons with a TPD request."""

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
INDEPENDENT_FIELDS = tuple("independent_ci_cover" if field == "earlier_ci_cover" else field for field in FIELDS)
INDEPENDENT_FIELDS = INDEPENDENT_FIELDS[:11] + ("quoted_independent_ci_cover",) + INDEPENDENT_FIELDS[11:]
PRODUCTS = {
    "Zurich": "Zurich Life & CI",
    "Legal & General": "Legal & General Life + CI (Standard)",
    "Aviva": "Aviva Multi-Product with Core CI",
}
BENEFIT = re.compile(
    r"Level Term Assurance: 1st life, (?:£([\d,]+) life & )?£([\d,]+) (life or earlier )?"
    r"critical illness cover \(TPD: own occupation\), policy duration is to age (\d+), premiums are guaranteed"
)
OFFER = re.compile(
    r"£([\d,]+\.\d{2})\s+Guaranteed\s+(Yes|No)\s+Monthly\s+£([\d,]+)\s+£([\d,]+)"
    r"\s+(To Age \d+|\d+ years?)\s+Level\s+(?:(Expiry|\d+|No data)\s+)?(Own|Specified|FATs)\s+No"
)
SINGLE_ACCELERATED_OFFER = re.compile(
    r"£([\d,]+\.\d{2})\s+Guaranteed\s+(Yes|No)\s+Monthly\s+£([\d,]+)"
    r"\s+(To Age \d+|\d+ years?)\s+Level\s+(?:(Expiry|\d+|No data)\s+)?(Own|Specified|FATs)\s+No"
)


INDEPENDENT_OFFER = re.compile(
    r"£([\d,]+\.\d{2})\s+Guaranteed\s+(Yes|No)\s+Monthly\s+£([\d,]+)"
    r"\s+(£[\d,]+|No data)\s+(£[\d,]+|No data)\s+(To Age \d+|\d+ years?)"
    r"\s+Level\s+(?:(Expiry|\d+|No data)\s+)?(Own|Specified|FATs)\s+No"
)


def read_report(path, independent=False):
    text = subprocess.check_output(["pdftotext", "-layout", str(path), "-"], encoding="utf8")
    cover, _, remaining = text.partition("\f")
    if "critical illness cover (TPD: own occupation)" not in cover:
        return []
    # On the first page each bullet is one benefit. Read through soft wraps
    # so an extra rider on a continuation line cannot enter the reference.
    benefits = re.findall(r"^[ \t]*•[ \t]+([^\n]+(?:\n[ \t]{6,}[^\s•][^\n]*)*)", cover, re.M)
    benefit = BENEFIT.fullmatch(" ".join(benefits[0].split())) if len(benefits) == 1 else None
    if not benefit or bool(benefit[3]) == independent or not re.search(r"Quotation basis:\s*Benefit-led", cover) or not re.search(r"Premium frequency:\s*Monthly", cover):
        return []
    person = re.search(r"^Client:.*?\ba (?:Male|Female) (non-smoker|smoker)(?: who has never smoked)?, born on ([\d/]+)", cover, re.M | re.I)
    requested = re.search(r"Date Requested:\s*([\d/]+)", cover)
    reference = re.search(r"Your Reference:\s*(\d+)", cover)
    if not person or not requested or not reference:
        return []
    date, birth = [datetime.strptime(s, "%d/%m/%Y").date() for s in (requested[1], person[2])]
    age = date.year - birth.year - ((date.month, date.day) < (birth.month, birth.day))
    single_accelerated = benefit[1] is None and not independent
    life, ci, end = [int(s.replace(",", "")) for s in (benefit[1] or "0", benefit[2], benefit[4])]
    if (not single_accelerated and life <= 0) or ci <= 0 or age >= end:
        return []
    results, _, unavailable = remaining.partition("Products Not Quoting:")
    if "Non Underwritten Results" not in results:
        return []
    if independent and not re.search(r"Life Cover[ \t]+Critical[ \t]+Life or", results):
        return []
    pattern = INDEPENDENT_OFFER if independent else OFFER
    if single_accelerated:
        header = results.partition("Non Underwritten Results")[0]
        if not re.search(r"Life or[ \t]+Policy", header) or re.search(r"Life Cover|Critical[ \t]+Life or", header):
            return []
        pattern = SINGLE_ACCELERATED_OFFER
    source = hashlib.sha256(path.read_bytes()).hexdigest()
    rows = []
    for provider, product in PRODUCTS.items():
        if single_accelerated and provider == "Aviva":
            product = "Aviva Life Insurance+ with Core CI"
        prefix = r"^[ \t]*" + re.escape(product) + r"[ \t]{2,}"
        lines = {s.strip() for s in re.findall(prefix + r"(£[^\n]+)", results, re.M)}
        if not lines and re.search(prefix + r"\S", unavailable, re.M):
            continue
        if len(lines) != 1:
            return []
        offer = pattern.fullmatch(lines.pop())
        if not offer:
            return []
        values = list(offer.groups())
        if single_accelerated:
            values.insert(2, "0")  # Only the shared life-or-earlier-CI amount is quoted.
        price, rated, quoted_life, *ci_columns, term, waiver, tpd = values
        price = price.replace(",", "")
        quoted_life = int(quoted_life.replace(",", ""))
        returned_ci = tuple(0 if amount == "No data" else int(amount.lstrip("£").replace(",", "")) for amount in ci_columns)
        if sum(amount > 0 for amount in returned_ci) != 1:
            return []
        term_number = int(re.search(r"\d+", term)[0])
        valid_term = term_number == end if term.startswith("To Age") else term_number in (end-age-1, end-age)
        if not valid_term or (not single_accelerated and quoted_life <= 0) or float(price) <= 0:
            return []
        rows.append((date.isoformat(), reference[1], age, "Yes" if person[1].lower() == "smoker" else "No",
                     end, life, ci, provider, product, price, quoted_life, *returned_ci, term,
                     rated, waiver or "not_shown", tpd, source))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", type=Path)
    parser.add_argument("--independent-tpd", action="store_true", help="Extract the separate independent CI request, including the cover actually returned.")
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
        rows = read_report(path, args.independent_tpd)
        if not rows:
            continue
        ref = rows[0][1]
        if ref in reports and [r[:-1] for r in rows] != [r[:-1] for r in reports[ref]]:
            raise ValueError(f"Conflicting versions of reference {ref}")
        if ref not in reports or digest < reports[ref][0][-1]:
            reports[ref] = rows
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(INDEPENDENT_FIELDS if args.independent_tpd else FIELDS)
    for rows in sorted(reports.values(), key=lambda rows: (rows[0][0], rows[0][1])):
        writer.writerows(rows)
    print(f"{len(seen)} distinct PDFs scanned, {len(reports)} qualifying reports", file=sys.stderr)


if __name__ == "__main__":
    main()
