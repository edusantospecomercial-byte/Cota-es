"""Extract UK guaranteed-premium life and critical illness comparisons with a TPD request."""

import argparse
import csv
from datetime import datetime
from decimal import Decimal
from functools import partial
import hashlib
from pathlib import Path
import re
import runpy
import subprocess
import sys


FIELDS = ("source_date", "reference", "age", "smoker", "to_age", "life_cover",
          "earlier_ci_cover", "provider", "product", "monthly_premium",
          "quoted_life_cover", "quoted_earlier_ci_cover", "quoted_term",
          "occupation_rated", "waiver_to", "tpd_basis", "sha256")
INDEPENDENT_FIELDS = tuple("independent_ci_cover" if field == "earlier_ci_cover" else field for field in FIELDS)
INDEPENDENT_FIELDS = INDEPENDENT_FIELDS[:11] + ("quoted_independent_ci_cover",) + INDEPENDENT_FIELDS[11:]
POLICY_FIELDS = ("life_policy_monthly", "earlier_ci_policy_monthly", "independent_ci_policy_monthly", "illustration_sha256")
DECLINE_FIELDS = FIELDS[:9] + ("maturity_reason", "waiver_column", "sha256")
PRODUCTS = {
    "Zurich": "Zurich Life & CI",
    "Legal & General": "Legal & General Life + CI (Standard)",
    "Aviva": "Aviva Multi-Product with Core CI",
}
BENEFIT = re.compile(
    r"Level Term Assurance: 1st life, (?:£([\d,]+) life & )?£([\d,]+) (life or earlier )?"
    r"critical illness cover \(TPD: own occupation\), policy duration is to age (\d+), premiums are guaranteed"
)
def offer_pattern(independent, single):
    prefix = r"£([\d,]+\.\d{2})\s+Guaranteed\s+(Yes|No)\s+Monthly\s+"
    life = "" if single else r"£([\d,]+)\s+"
    ci = r"(£[\d,]+|No data)\s+(£[\d,]+|No data)" if independent else r"(£[\d,]+)"
    terms = (r"\s+(To Age \d+|\d+ years?)\s+Level\s+(?:(Expiry|\d+|No data)\s+)?"
             r"(Own|Specified|FATs|None)\s+No")
    return re.compile(prefix + life + ci + terms)


def maturity_reason(rows):
    if len(rows) != 1:
        return None
    reason = rows.pop().strip()
    limit = re.fullmatch(r"(?:First/Second client age plus term exceeds the maximum maturity age of |"
                         r"Age at expiry exceeds maximum allowed )(\d+)\.?", reason, re.I)
    if limit:
        return "maximum_maturity_" + limit[1]
    if reason == "The age of the client(s) at policy termination is not supported.":
        return "maturity_not_supported"
    return None


def read_report(path, independent=False, maturity_declines=False):
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
    single = benefit[1] is None
    life, ci, end = [int(s.replace(",", "")) for s in (benefit[1] or "0", benefit[2], benefit[4])]
    if (not single and life <= 0) or ci <= 0 or age >= end:
        return []
    results, _, unavailable = remaining.partition("Products Not Quoting:")
    if "Non Underwritten Results" not in results:
        return []
    header = results.partition("Non Underwritten Results")[0]
    if independent and not re.search(r"Critical[ \t]+Life or", header):
        return []
    if bool(re.search(r"Life Cover[ \t]+", header)) == single:
        return []
    if single and not independent and (not re.search(r"Life or[ \t]+Policy", header) or re.search(r"Critical[ \t]+Life or", header)):
        return []
    pattern = offer_pattern(independent, single)
    source = hashlib.sha256(path.read_bytes()).hexdigest()
    rows, declines = [], []
    for provider, product in PRODUCTS.items():
        if single:
            if independent and provider == "Zurich":
                product = "Zurich Critical Illness"
            if provider == "Aviva":
                product = "Aviva Critical Illness+ Core" if independent else "Aviva Life Insurance+ with Core CI"
        prefix = r"^[ \t]*" + re.escape(product) + r"[ \t]{2,}"
        lines = {s.strip() for s in re.findall(prefix + r"(£[^\n]+)", results, re.M)}
        if not lines and re.search(prefix + r"\S", unavailable, re.M):
            if maturity_declines:
                reason = maturity_reason(set(re.findall(prefix + r"(\S[^\n]*)", unavailable, re.M)))
                if reason:
                    declines.append((date.isoformat(), reference[1], age, "Yes" if person[1].lower() == "smoker" else "No",
                                    end, life, ci, provider, product, reason, "Yes" if re.search(r"\bWaiver\b", header, re.I) else "No", source))
            continue
        if len(lines) != 1:
            return []
        offer = pattern.fullmatch(lines.pop())
        if not offer:
            return []
        values = list(offer.groups())
        if single:
            values.insert(2, "0")  # The report has no separate life capital column.
        price, rated, quoted_life, *ci_columns, term, waiver, tpd = values
        price = price.replace(",", "")
        quoted_life = int(quoted_life.replace(",", ""))
        returned_ci = tuple(0 if amount == "No data" else int(amount.lstrip("£").replace(",", "")) for amount in ci_columns)
        if sum(amount > 0 for amount in returned_ci) != 1:
            return []
        term_number = int(re.search(r"\d+", term)[0])
        valid_term = term_number == end if term.startswith("To Age") else term_number in (end-age-1, end-age)
        if not valid_term or (not single and quoted_life <= 0) or float(price) <= 0:
            return []
        rows.append((date.isoformat(), reference[1], age, "Yes" if person[1].lower() == "smoker" else "No",
                     end, life, ci, provider, product, price, quoted_life, *returned_ci, term,
                     rated, waiver or "not_shown", tpd, source))
    if maturity_declines:
        return declines if len(declines) == len(PRODUCTS) and not rows else []
    return rows


def billed_policy_premiums(reports, roots):
    """Identify policy-level charges in the insurer PDF supplied with the same comparison."""
    from illustration_pairs import illustration_files, pairs
    directory = Path(__file__).parent
    sources = illustration_files(roots)
    records = [dict(zip(INDEPENDENT_FIELDS, map(str, row))) for rows in reports.values() for row in rows]
    folders = {"Aviva": ("Aviva Multi-Product with Core CI", "Aviva Critical Illness+ Core", "Aviva Life Insurance+ with Core CI"),
               "Zurich": ("Zurich Life & CI", "Zurich Critical Illness"),
               "Legal & General": ("Legal & General Life + CI (Standard)",)}
    premiums = {}
    for provider, names in folders.items():
        offers = {r["sha256"]: r for r in records if r["provider"] == provider}
        if provider == "Zurich":
            factory = runpy.run_path(str(directory / "extract-zurich-life-components.py"))["earlier_ci_reader"]
            verify = factory(offers, policy_premiums=True)
        else:
            script = "extract-aviva-core-breakdowns.py" if provider == "Aviva" else "extract-lg-core-breakdowns.py"
            reader = runpy.run_path(str(directory / script))["read_pair"]
            verify = partial(reader, offers=offers, policy_premiums=True)
        checked = set()
        for illustration, comparison in pairs(sources, names):
            digest = hashlib.sha256(comparison).hexdigest()
            if digest not in offers:
                continue
            proof = hashlib.sha256(illustration).hexdigest()
            if (digest, proof) in checked:
                continue
            checked.add((digest, proof))
            charges = verify(illustration, comparison)
            if charges is None:
                continue
            offer = offers[digest]
            capitals = ("quoted_life_cover", "quoted_earlier_ci_cover", "quoted_independent_ci_cover")
            if sum(charges) != Decimal(offer["monthly_premium"]) or any(
                    (charge > 0) != (int(offer[field]) > 0) for charge, field in zip(charges, capitals)):
                raise ValueError("Policy payments do not reconcile with the offered benefits")
            key = (digest, provider)
            if key in premiums and premiums[key][:-1] != charges:
                raise ValueError("Different policy payments in two copies of the insurer illustration")
            if key not in premiums or proof < premiums[key][-1]:
                premiums[key] = (*charges, proof)
    return premiums


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", type=Path)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--maturity-declines", action="store_true", help="Return reports with explicit maturity refusals from all three providers.")
    selection.add_argument("--independent-tpd", action="store_true", help="Extract the separate independent CI request, including the cover actually returned.")
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
        rows = read_report(path, args.independent_tpd, args.maturity_declines)
        if not rows:
            continue
        ref = rows[0][1]
        if ref in reports and [r[:-1] for r in rows] != [r[:-1] for r in reports[ref]]:
            raise ValueError(f"Conflicting versions of reference {ref}")
        if ref not in reports or digest < reports[ref][0][-1]:
            reports[ref] = rows
    writer = csv.writer(sys.stdout, lineterminator="\n")
    premiums = billed_policy_premiums(reports, args.roots) if args.independent_tpd else {}
    writer.writerow(DECLINE_FIELDS if args.maturity_declines else INDEPENDENT_FIELDS + POLICY_FIELDS if args.independent_tpd else FIELDS)
    for rows in sorted(reports.values(), key=lambda rows: (rows[0][0], rows[0][1])):
        for row in rows:
            extra = premiums.get((row[-1], row[7]), ("",) * len(POLICY_FIELDS)) if args.independent_tpd else ()
            writer.writerow((*row, *extra))
    print(f"{len(seen)} distinct PDFs scanned, {len(reports)} qualifying reports", file=sys.stderr)


if __name__ == "__main__":
    main()
