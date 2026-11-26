"""Read the named Aviva or Zurich offer from an official report requesting fracture cover."""

import argparse
import csv
from datetime import datetime
from pathlib import Path
import hashlib
import re
import subprocess
import sys


LIFE = r"£([\d,]+) life cover"
ACCELERATED = r"(?:£([\d,]+) life & )?£([\d,]+) life or earlier critical illness cover \(TPD: own occupation\)"
ENDING = r", policy duration is to age (\d+), premiums are guaranteed, Fracture Cover selected"


def amount(value):
    return int((value or "0").replace(",", ""))


def read_offer(comparison, provider, text=None):
    if text is None:
        text = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=comparison).decode()
    cover, _, results = text.partition("\f")
    benefits = re.findall(r"^[ \t]*•[ \t]+([^\n]+(?:\n[ \t]{6,}[^\s•][^\n]*)*)", cover, re.M)
    if len(benefits) != 1 or not re.search(r"Quotation basis:\s*Benefit-led", cover) or not re.search(r"Premium frequency:\s*Monthly", cover):
        return None
    benefit = " ".join(benefits[0].split())
    life = re.fullmatch("Level Term Assurance: 1st life, " + LIFE + ENDING, benefit)
    shared = re.fullmatch("Level Term Assurance: 1st life, " + ACCELERATED + ENDING, benefit)
    if not (life or shared):
        return None
    requested_life = amount(life[1] if life else shared[1])
    requested_ci = amount(shared[2]) if shared else 0
    end = int((life or shared).groups()[-1])
    client = re.search(r"^Client:.*?\ba (?:Male|Female) (non-smoker|smoker)(?: who has never smoked)?, born on ([\d/]+)", cover, re.M | re.I)
    date = re.search(r"Date Requested:\s*([\d/]+)", cover)
    reference = re.search(r"Your Reference:\s*(\d+)", cover)
    if not all((client, date, reference)):
        return None
    issued, born = [datetime.strptime(value, "%d/%m/%Y").date() for value in (date[1], client[2])]
    age = issued.year - born.year - ((issued.month, issued.day) < (born.month, born.day))
    if not (18 <= age < end <= 100):
        return None
    table = results.partition("Products Not Quoting:")[0]
    header, found, table = table.partition("Non Underwritten Results")
    if not found or bool(re.search(r"\bLife Cover\b", header)) != bool(requested_life) or bool(re.search(r"\bLife or\b", header)) != bool(requested_ci):
        return None
    if provider == "Zurich":
        product = "Zurich Life & CI" if shared else "Zurich Life"
    elif provider == "Aviva":
        product = ("Aviva Multi-Product with Core CI" if requested_life else "Aviva Life Insurance+ with Core CI") if shared else "Aviva Life Insurance+"
    elif provider == "Legal & General":
        product = "Legal & General Life + CI (Standard)" if shared else "Legal & General Life"
    else:
        raise ValueError("Unsupported illustration provider")
    lines = set(re.findall(r"^[ \t]*" + re.escape(product) + r"[ \t]{2,}(£[^\n]+)", table, re.M))
    base = dict(source_date=issued.isoformat(), age=str(age), smoker="Yes" if client[1].lower() == "smoker" else "No",
                to_age=str(end), life_cover=str(requested_life), earlier_ci_cover=str(requested_ci), provider=provider,
                reference=reference[1], product=product, sha256=hashlib.sha256(comparison).hexdigest())
    if not lines:
        reasons = set(re.findall(r"^[ \t]*" + re.escape(product) + r"[ \t]{2,}(\S[^\n]*)",
                                 results.partition("Products Not Quoting:")[2], re.M))
        reported = {reason.strip().rstrip(".") for reason in reasons}
        reason_codes = {"Level Term Benefit - Fracture Cover is not supported": "fracture_not_supported",
                        "Aviva are unable to offer cover for that age": "age_not_supported",
                        "The policy term selected is not supported": "term_not_supported"}
        if len(reported) == 1 and (reason := reported.pop()) in reason_codes:
            return dict(base, response=reason_codes[reason])
        return None
    if len(lines) != 1:
        return None
    caps = (r"£([\d,]+)\s+" if requested_life else "") + (r"£([\d,]+)\s+" if requested_ci else "")
    offered = re.fullmatch(r"£([\d,]+\.\d{2})\s+Guaranteed\s+(Yes|No)\s+Monthly\s+" + caps +
        r"(To Age \d+|\d+ years?)\s+Level\s+(?:(Expiry|\d+|No data)\s+)?(Own|Specified|None|FATs)\s+No", lines.pop().strip())
    if not offered:
        return None
    price, rated, *capitals, term, waiver, tpd = offered.groups()
    duration = int(re.search(r"\d+", term)[0])
    valid_term = duration == end if term.startswith("To Age ") else duration in (end - age - 1, end - age)
    if not valid_term:
        return None
    return dict(base, response="quoted", monthly_premium=price.replace(",", ""), occupation_rated=rated,
                quoted_life_cover=str(amount(capitals[0]) if requested_life else 0),
                quoted_earlier_ci_cover=str(amount(capitals[-1]) if requested_ci else 0),
                quoted_term=term, waiver_to=waiver or "not_shown", tpd_basis=tpd)


FRACTURE_FIELDS = ("source_date", "age", "smoker", "to_age", "life_cover", "earlier_ci_cover", "life_monthly",
                   "earlier_ci_monthly", "reference", "waiver_monthly", "tpd_monthly", "discount_monthly", "fracture_monthly",
                   "total_monthly", "provider", "quoted_life_cover", "quoted_earlier_ci_cover", "quoted_term", "occupation_rated",
                   "waiver_to", "tpd_basis", "fracture_to_age", "sha256", "comparison_sha256")


def fracture_row(offer, base_life, base_ci, waiver, disability, discount, fracture, paid, illustration, fracture_to_age=""):
    if fracture <= 0:
        return None
    return (offer["source_date"], offer["age"], offer["smoker"], offer["to_age"], offer["life_cover"], offer["earlier_ci_cover"],
            base_life, base_ci, offer["reference"], waiver, disability, discount, fracture, paid, offer["provider"],
            offer["quoted_life_cover"], offer["quoted_earlier_ci_cover"], offer["quoted_term"], offer["occupation_rated"],
            offer["waiver_to"], offer["tpd_basis"], fracture_to_age, hashlib.sha256(illustration).hexdigest(), offer["sha256"])


OFFER_FIELDS = ("source_date", "reference", "age", "smoker", "to_age", "life_cover", "earlier_ci_cover", "provider",
                "product", "response", "monthly_premium", "quoted_life_cover", "quoted_earlier_ci_cover", "quoted_term",
                "occupation_rated", "waiver_to", "tpd_basis", "sha256")


def export_reports(roots):
    listing = subprocess.run(["rg", "--files", "--hidden", "--no-ignore", "-0", "-g", "!**/.git/**",
                              "-g", "!**/node_modules/**", "--iglob", "*compar*without*commiss*.pdf", *roots], capture_output=True)
    if listing.returncode not in (0, 1):
        raise SystemExit(listing.stderr.decode())
    seen, reports = set(), {}
    for name in sorted(filter(None, listing.stdout.decode().split("\0"))):
        data = Path(name).read_bytes()
        digest = hashlib.sha256(data).digest()
        if digest in seen:
            continue
        seen.add(digest)
        text = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=data).decode()
        if "Fracture Cover selected" not in " ".join(text.partition("\f")[0].split()):
            continue
        for provider in ("Aviva", "Legal & General", "Zurich"):
            row = read_offer(data, provider, text)
            if not row:
                continue
            key = row["reference"], provider
            if key in reports:
                if any(row.get(k) != reports[key].get(k) for k in OFFER_FIELDS if k != "sha256"):
                    raise ValueError(f"Conflicting answers for {key}")
                if reports[key]["sha256"] < row["sha256"]:
                    continue
            reports[key] = row
    writer = csv.DictWriter(sys.stdout, fieldnames=OFFER_FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(sorted(reports.values(), key=lambda r: (r["source_date"], r["reference"], r["provider"])))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", type=Path, nargs="+")
    export_reports(parser.parse_args().roots)
