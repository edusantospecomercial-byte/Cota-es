"""Read the billed policy premiums in matched Legal & General life and earlier critical illness quotations."""
import csv
from datetime import datetime
from decimal import Decimal
import hashlib
from pathlib import Path
import re
import subprocess

from illustration_pairs import extract_pairs

FIELDS = ("source_date", "age", "smoker", "to_age", "life_cover", "earlier_ci_cover", "life_policy_monthly",
          "earlier_ci_policy_monthly", "reference", "term_years", "total_monthly", "sha256", "comparison_sha256")
DATE = r"(\d{2}/\d{2}/\d{4})"
MONEY = r"£([\d,]+\.\d{2})"


def read_pair(illustration, comparison):
    digest = hashlib.sha256(comparison).hexdigest()
    offer = offers.get(digest)
    if not offer:
        return None
    report = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=comparison).decode().split("\f", 1)[0]
    birth = re.search(r"born on " + DATE, report)
    quoted_term = re.fullmatch(r"(\d+) years?", offer["quoted_term"])
    if not birth or not quoted_term:
        return None
    text = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=illustration).decode()
    policies = [page for page in text.split("\f") if "Your Guaranteed Premium of" in page]
    wanted = {"shared": int(offer["quoted_earlier_ci_cover"])}
    if int(offer["quoted_life_cover"]):
        wanted["life"] = int(offer["quoted_life_cover"])
    if len(wanted) != len(policies):
        return None
    billed = {}
    for page in policies:
        personal = re.findall(r"Date of Birth:\s*" + DATE + r"[ \t]+(Non Smoker|Smoker)\*", page)
        issued = re.search(r"Quote Date:[ \t]*" + DATE, page)
        term = re.search(r"Length of the Policy:[ \t]*(\d+) years?\b", page)
        premium = re.search(r"Your Guaranteed Premium of\s*" + MONEY + r"\s+Payable: monthly", page)
        life = re.search(r"\bLife Cover:[ \t]*£([\d,]+)", page)
        ci = re.search(r"\bCritical Illness Cover:[ \t]*£([\d,]+)", page)
        if len(personal) != 1 or not (issued and term and premium and life):
            return None
        if personal[0][0] != birth[1] or (personal[0][1] == "Smoker") != (offer["smoker"] == "Yes"):
            return None
        date = datetime.strptime(issued[1], "%d/%m/%Y").date()
        dob = datetime.strptime(birth[1], "%d/%m/%Y").date()
        age = date.year - dob.year - ((date.month, date.day) < (dob.month, dob.day))
        if date.isoformat() != offer["source_date"] or age != int(offer["age"]) or term[1] != quoted_term[1]:
            return None
        kind = "shared" if ci else "life"
        if ci and ci[1] != life[1]:
            return None
        if kind not in wanted or int(life[1].replace(",", "")) != wanted.pop(kind):
            return None
        billed[kind] = Decimal(premium[1].replace(",", ""))
    total = sum(billed.values())
    if wanted or total != Decimal(offer["monthly_premium"]):
        return None
    return (offer["source_date"], offer["age"], offer["smoker"], offer["to_age"], offer["quoted_life_cover"],
            offer["quoted_earlier_ci_cover"], billed.get("life", Decimal("0.00")), billed["shared"], offer["reference"],
            quoted_term[1], total, hashlib.sha256(illustration).hexdigest(), digest)


if __name__ == "__main__":
    with (Path(__file__).resolve().parents[1] / "data/accelerated-comparisons.csv").open() as source:
        offers = {r["sha256"]: r for r in csv.DictReader(source) if r["provider"] == "Legal & General"}
    extract_pairs("Legal & General Life + CI (Standard)", FIELDS, read_pair, __doc__)
