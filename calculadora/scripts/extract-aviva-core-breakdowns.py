"""Reconcile the separate Aviva policy premiums in life-or-earlier-CI illustrations."""
import argparse
import csv
from datetime import datetime
from decimal import Decimal
import hashlib
from pathlib import Path
import re
import subprocess

from illustration_pairs import extract_pairs

FIELDS = ("source_date", "age", "smoker", "to_age", "life_cover", "earlier_ci_cover", "life_monthly",
          "earlier_ci_monthly", "reference", "waiver_monthly", "tpd_monthly", "total_monthly", "sha256", "comparison_sha256")
MONEY = r"£([\d,]+\.\d{2})"
DATE = r"(\d{1,2} [A-Za-z]+ \d{4})"
LIFE = "Life cover"
SHARED = "Life and critical illness cover"
INDEPENDENT = "Critical illness cover"
WAIVER = "Waiver of Premium"
TPD = "Total permanent disability"


def pounds(value):
    return Decimal(value.replace(",", ""))


def pdf_text(document):
    return subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=document).decode("utf-8")


def read_pair(illustration, comparison, offers=None, fracture_requested=False, policy_premiums=False):
    digest = hashlib.sha256(comparison).hexdigest()
    if fracture_requested:
        from fracture_comparison import read_offer
        offer = read_offer(comparison, "Aviva")
    else:
        offer = offers.get(digest)
    if not offer or offer.get("response", "quoted") != "quoted":
        return None
    cover = pdf_text(comparison).split("\f", 1)[0]
    dob = re.search(r"born on (\d{2}/\d{2}/\d{4})", cover)
    if not dob:
        return None
    birth = datetime.strptime(dob[1], "%d/%m/%Y").date()
    text = pdf_text(illustration)
    if "your quick quote illustration" not in text.lower():
        return None
    sections = re.split(r"^[ \t]*Page 1 of \d+[ \t]*$", text.replace("\f", "\n"), flags=re.M)
    policies = [part for part in sections if "How your premium is made up" in part]
    expected = {}
    if int(offer["quoted_earlier_ci_cover"]):
        expected[SHARED] = int(offer["quoted_earlier_ci_cover"])
    if int(offer["quoted_life_cover"]):
        expected[LIFE] = int(offer["quoted_life_cover"])
    if policy_premiums and int(offer.get("quoted_independent_ci_cover", 0)):
        expected[INDEPENDENT] = int(offer["quoted_independent_ci_cover"])
    if len(policies) != len(expected) or text.count("Date of birth:") != len(policies):
        return None
    totals = {label: Decimal("0.00") for label in (LIFE, SHARED, WAIVER, TPD)}
    if INDEPENDENT in expected:
        totals[INDEPENDENT] = Decimal("0.00")
    billed = {}
    if fracture_requested:
        totals["Fracture cover"] = Decimal("0.00")
    paid = Decimal("0.00")
    for policy in policies:
        details, breakdown = policy.split("How your premium is made up", 1)
        prepared = re.search(r"Date prepared[ \t]*\n[^\n]*?" + DATE, details)
        born = re.search(r"Date of birth:[ \t]*" + DATE, details)
        smoking = re.search(r"Smoker status:[ \t]*(Non-Smoker|Smoker)\b", details, re.I)
        amount = re.search(r"^[ \t]*Cover amount[ \t]+" + MONEY + r"[ \t]*$", details, re.M)
        end = re.search(r"^[ \t]*Expiry age[ \t]+(\d+)[ \t]*$", details, re.M)
        monthly = re.search(r"^[ \t]*Monthly premium[ \t]+" + MONEY + r"[ \t]*$", details, re.M)
        if not all((prepared, born, smoking, amount, end, monthly)) or not re.search(r"^[ \t]*Cover type[ \t]+Level[ \t]*$", details, re.M):
            return None
        issued = datetime.strptime(prepared[1], "%d %B %Y").date()
        age = issued.year - birth.year - ((issued.month, issued.day) < (birth.month, birth.day))
        if issued.isoformat() != offer["source_date"] or age != int(offer["age"]):
            return None
        if (datetime.strptime(born[1], "%d %B %Y").date() != birth or end[1] != offer["to_age"]
                or (smoking[1].lower() == "smoker") != (offer["smoker"] == "Yes")):
            return None
        items = re.findall(r"^[ \t]*§[ \t]*(\S[^\n]*?)[ \t]{2,}" + MONEY + r"[ \t]*$", breakdown, re.M)
        labels = [label.strip() for label, _ in items]
        base = [label for label in labels if label in (LIFE, SHARED, INDEPENDENT)]
        if len(base) != 1 or base[0] not in expected or pounds(amount[1]) != expected.pop(base[0]):
            return None
        if set(labels) - totals.keys() or len(set(labels)) != len(labels) or sum(pounds(n) for _, n in items) != pounds(monthly[1]):
            return None
        for (label, value) in items:
            totals[label.strip()] += pounds(value)
        billed[base[0]] = pounds(monthly[1])
        paid += pounds(monthly[1])
    if expected or paid != pounds(offer["monthly_premium"]) or paid != sum(totals.values()):
        return None
    if policy_premiums:
        return tuple(billed.get(label, Decimal("0.00")) for label in (LIFE, SHARED, INDEPENDENT))
    if fracture_requested:
        from fracture_comparison import fracture_row
        return fracture_row(offer, totals[LIFE], totals[SHARED], totals[WAIVER], totals[TPD],
                            Decimal("0.00"), totals["Fracture cover"], paid, illustration)
    return (offer["source_date"], offer["age"], offer["smoker"], offer["to_age"], offer["quoted_life_cover"],
            offer["quoted_earlier_ci_cover"], totals[LIFE], totals[SHARED], offer["reference"],
            totals[WAIVER], totals[TPD], paid, hashlib.sha256(illustration).hexdigest(), digest)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", type=Path)
    parser.add_argument("--paired-fracture", action="store_true")
    args = parser.parse_args()
    folders = ("Aviva Multi-Product with Core CI", "Aviva Life Insurance+ with Core CI")
    if args.paired_fracture:
        from fracture_comparison import FRACTURE_FIELDS
        extract_pairs(folders + ("Aviva Life Insurance+",), FRACTURE_FIELDS,
                      lambda i, c: read_pair(i, c, fracture_requested=True), __doc__, args.roots)
    else:
        with (Path(__file__).resolve().parents[1] / "data/accelerated-comparisons.csv").open() as source:
            offers = {r["sha256"]: r for r in csv.DictReader(source) if r["provider"] == "Aviva"}
        extract_pairs(folders, FIELDS, lambda i, c: read_pair(i, c, offers), __doc__, args.roots)
