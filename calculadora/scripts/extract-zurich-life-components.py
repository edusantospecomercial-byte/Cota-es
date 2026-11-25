"""Recover guaranteed, standard-rate Zurich life premiums that are itemised in official illustrations."""

import argparse
import csv
import hashlib
import re
import subprocess
import sys
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


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("folders", type=Path, nargs="+")
    args = cli.parse_args()
    listing = subprocess.run(["rg", "--files", "--null", "--hidden", "--no-ignore",
                              "--glob", "!**/.git/**", "--glob", "!**/node_modules/**",
                              "--iglob", "*illustration*.pdf", *map(str, args.folders)],
                             capture_output=True)
    if listing.returncode not in (0, 1):
        sys.exit(listing.stderr.decode())
    seen_digests = set()
    by_reference = defaultdict(dict)
    for name in sorted(filter(None, listing.stdout.decode().split("\0"))):
        digest = hashlib.sha256(Path(name).read_bytes()).hexdigest()
        if digest in seen_digests:
            continue
        seen_digests.add(digest)
        extracted = subprocess.run(["pdftotext", "-layout", name, "-"], capture_output=True, text=True)
        if extracted.returncode:
            continue
        parsed = parse_illustration(extracted.stdout, digest)
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
