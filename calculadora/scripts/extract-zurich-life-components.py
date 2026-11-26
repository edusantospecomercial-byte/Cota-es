"""Recover guaranteed, standard-rate Zurich life premiums that are itemised in official illustrations."""

import argparse
import csv
import hashlib
import re
import subprocess
import sys
import zipfile
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path


FIELDS = ("source_date", "age", "smoker", "to_age", "life_cover", "base_monthly",
          "additional_monthly", "discount_monthly", "policy_monthly", "policy_count", "sha256")
DATE = r"(\d{1,2} [A-Za-z]+ \d{4})"
MONEY = r"£([\d,]+\.\d{2})"


def field(section, label, pattern):
    match = re.search(r"^[ \t]*" + label + r"[ \t]+" + pattern + r"[ \t]*$",
                      section, re.I | re.M)
    return match[1] if match else None


def parse_date(value):
    for fmt in ("%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError("Unrecognised date format")


def pounds(value):
    return Decimal(value.replace(",", ""))


def parse_illustration(text, digest):
    ref = re.search(r"^\s*Your Zurich quote[ \t]{2,}([A-Z0-9]+)[ \t]*$", text, re.I | re.M)
    if not ref or "your zurich personal protection quote" not in text.lower():
        return None
    if "standard rates and your current age" not in text.lower():
        return None
    dates = set(re.findall(r"\bDate prepared\s+" + DATE + r"\b", text, re.I))
    if len(dates) != 1:
        return None
    issued = parse_date(dates.pop())
    sections = re.split(r"^[ \t]*Date of birth[ \t]+", text, flags=re.I | re.M)[1:]
    rows = []
    for section in sections:
        if field(section, "Cover provided", "(Level Life Cover)") is None:
            continue
        if field(section, "Premium type", "(Guaranteed)") is None:
            continue
        birth = re.match(DATE, section)
        smoker = field(section, "Smoker status", "(Non-Smoker|Smoker)")
        end_age = field(section, "Term", r"To age (\d+)")
        cover = field(section, "Sum assured", MONEY)
        gross = field(section, "Monthly premium for main cover", MONEY)
        main = field(section, "Main cover", MONEY)
        total = field(section, "Total Monthly premium", MONEY)
        if not all((birth, smoker, end_age, cover, gross, total)):
            continue
        birth_date = parse_date(birth[1])
        age = issued.year - birth_date.year - ((issued.month, issued.day) < (birth_date.month, birth_date.day))
        gross, total, cover = map(pounds, (gross, total, cover))
        additional = pounds(field(section, "Additional benefits", MONEY) or "0.00")
        discount = pounds(field(section, "Multi-policy discount", MONEY) or "0.00")
        if (main is not None and pounds(main) != gross) or gross + additional - discount != total:
            continue
        if not (18 <= age < int(end_age) <= 100 and cover > 0 and cover == int(cover) and gross > 0 and total > 0):
            continue
        rows.append((issued.isoformat(), age, "Yes" if smoker.lower() == "smoker" else "No",
                     int(end_age), int(cover), gross, additional, discount, total, len(sections), digest))
    return ref[1], rows


def illustrations(source):
    if source.suffix.lower() == ".pdf":
        yield source.read_bytes()
        return
    # SolutionBuilder also delivers these PDFs inside Supporting Documents ZIPs.
    with zipfile.ZipFile(source) as archive:
        for member in archive.infolist():
            name = member.filename.replace("\\", "/").rsplit("/", 1)[-1].lower()
            if ("illustration" in name and name.endswith(".pdf")
                    and 0 < member.file_size <= 12_000_000 and not member.flag_bits & 1):
                yield archive.read(member)


def earlier_ci_reader(offers):
    def read_pair(illustration, comparison):
        comparison_hash = hashlib.sha256(comparison).hexdigest()
        offer = offers.get(comparison_hash)
        if not offer:
            return None
        quote = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=illustration).decode().replace("\f", "\n")
        if "your zurich personal protection quote" not in quote.lower() or "standard rates and your current age" not in quote.lower():
            return None
        report = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=comparison).decode().split("\f", 1)[0]
        birth = re.search(r"born on (\d{2}/\d{2}/\d{4})", report)
        dates = set(re.findall(r"\bDate prepared\s+" + DATE + r"\b", quote, re.I))
        if not birth or len(dates) != 1:
            return None
        issued = parse_date(dates.pop())
        dob = datetime.strptime(birth[1], "%d/%m/%Y").date()
        expected_age = issued.year - dob.year - ((issued.month, issued.day) < (dob.month, dob.day))
        if issued.isoformat() != offer["source_date"] or expected_age != int(offer["age"]):
            return None
        shared = "Level Life Cover and Critical Illness"
        life = "Level Life Cover"
        expected = {shared: int(offer["quoted_earlier_ci_cover"])}
        if int(offer["quoted_life_cover"]):
            expected[life] = int(offer["quoted_life_cover"])
        parts = re.split(r"^[ \t]*Date of birth[ \t]+", quote, flags=re.I | re.M)[1:]
        if len(parts) != len(expected):
            return None
        zero = Decimal("0.00")
        amounts = dict.fromkeys([life, shared, "waiver", "tpd", "discount", "paid"], zero)
        for part in parts:
            part_birth = re.match(DATE, part)
            kind = field(part, "Cover provided", r"(.+?)")
            smoker = field(part, "Smoker status", "(Non-Smoker|Smoker)")
            sum_assured = field(part, "Sum assured", MONEY)
            base = field(part, "Monthly premium for main cover", MONEY)
            main_cover = field(part, "Main cover", MONEY)
            total = field(part, "Total Monthly premium", MONEY)
            if not all((part_birth, smoker, sum_assured, base, main_cover, total)) or kind not in expected:
                return None
            if (parse_date(part_birth[1]) != dob or (smoker.lower() == "smoker") != (offer["smoker"] == "Yes")
                    or field(part, "Term", r"To age (\d+)") != offer["to_age"] or not field(part, "Premium type", "(Guaranteed)")
                    or pounds(sum_assured) != expected.pop(kind) or pounds(base) != pounds(main_cover)):
                return None
            waiver = pounds(field(part, "Waiver of Premium", MONEY) or "0")
            tpd = re.findall(r"^[ \t]*Total Permanent Disability[^£\n]*?" + MONEY +
                             r"(?:[ \t]+payable until [^\n]+)?[ \t]*$", part, re.I | re.M)
            if len(tpd) > 1:
                return None
            disability = pounds(tpd[0]) if tpd else zero
            additional = pounds(field(part, "Additional benefits", MONEY) or "0")
            discount = pounds(field(part, "Multi-policy discount", MONEY) or "0")
            if waiver + disability != additional or pounds(base) + additional - discount != pounds(total):
                return None
            amounts[kind] += pounds(base)
            amounts["waiver"] += waiver
            amounts["tpd"] += disability
            amounts["discount"] += discount
            amounts["paid"] += pounds(total)
        if expected or amounts["paid"] != pounds(offer["monthly_premium"]):
            return None
        return (offer["source_date"], offer["age"], offer["smoker"], offer["to_age"], offer["quoted_life_cover"],
                offer["quoted_earlier_ci_cover"], amounts[life], amounts[shared], offer["reference"], amounts["waiver"],
                amounts["tpd"], amounts["discount"], amounts["paid"], hashlib.sha256(illustration).hexdigest(), comparison_hash)
    return read_pair


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("folders", type=Path, nargs="+")
    cli.add_argument("--paired-earlier-ci", action="store_true", help="Reconcile itemised shared life/CI cover against the original comparison.")
    args = cli.parse_args()
    if args.paired_earlier_ci:
        from illustration_pairs import extract_pairs
        fields = ("source_date", "age", "smoker", "to_age", "life_cover", "earlier_ci_cover", "life_monthly",
                  "earlier_ci_monthly", "reference", "waiver_monthly", "tpd_monthly", "discount_monthly",
                  "total_monthly", "sha256", "comparison_sha256")
        with (Path(__file__).resolve().parents[1] / "data/accelerated-comparisons.csv").open() as source:
            offers = {r["sha256"]: r for r in csv.DictReader(source) if r["provider"] == "Zurich"}
        extract_pairs("Zurich Life & CI", fields, earlier_ci_reader(offers), __doc__, args.folders)
        return
    listing = subprocess.run(["rg", "--files", "--null", "--hidden", "--no-ignore",
                              "--glob", "!**/.git/**", "--glob", "!**/node_modules/**",
                              "--iglob", "*illustration*.pdf", "--iglob", "*supporting documents*.zip",
                              *map(str, args.folders)],
                             capture_output=True)
    if listing.returncode not in (0, 1):
        sys.exit(listing.stderr.decode())
    seen_digests = set()
    by_reference = defaultdict(dict)
    for name in sorted(filter(None, listing.stdout.decode().split("\0"))):
        for pdf in illustrations(Path(name)):
            digest = hashlib.sha256(pdf).hexdigest()
            if digest in seen_digests:
                continue
            seen_digests.add(digest)
            extracted = subprocess.run(["pdftotext", "-layout", "-", "-"], input=pdf, capture_output=True)
            if extracted.returncode:
                continue
            parsed = parse_illustration(extracted.stdout.decode("utf-8"), digest)
            if parsed:
                ref, rows = parsed
                if rows:
                    by_reference[ref][digest] = rows
    unique = {}
    conflicting = 0
    for versions in by_reference.values():
        signatures = {tuple(sorted(row[:-1] for row in rows)) for rows in versions.values()}
        if len(signatures) != 1:
            conflicting += 1
            continue
        for row in versions[min(versions)]:
            # Different PDFs can repeat the same policy economics on the same day.
            key = row[:-1]
            if key not in unique or row[-1] < unique[key][-1]:
                unique[key] = row
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(FIELDS)
    writer.writerows(sorted(unique.values()))
    print(f"{len(unique)} itemised life premiums. {conflicting} conflicting reference groups excluded.",
          file=sys.stderr)


if __name__ == "__main__":
    main()
