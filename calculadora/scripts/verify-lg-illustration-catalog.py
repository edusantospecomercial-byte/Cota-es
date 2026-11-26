"""Verify archived L&G level-term policy charges against their original illustration PDFs."""
import argparse
import csv
from datetime import datetime
from decimal import Decimal
import hashlib
from pathlib import Path
import re
import subprocess

DATE = r"(\d{2}/\d{2}/\d{4})"
GBP = r"£([\d,]+\.\d{2})"
CAPITAL = r"£([\d,]+)"
BULLETS = ("Life Cover of ", "The life cover", "Critical Illness Cover of ", "Critical Illness Extra of ",
           "The critical illnesses", "Total and Permanent Disability cover", "Terminal illness cover",
           "Children's Critical Illness Cover", "Children's Critical Illness Extra", "Waiver of Premium for ",
           "Guaranteed Insurability Option")


def one(pattern, text):
    found = re.findall(pattern, text, re.M)
    if len(found) != 1:
        raise ValueError("Missing or ambiguous policy field: " + pattern)
    return found[0]


def sum_paid(items):
    return sum((Decimal(item.replace(",", "")) for item in items), Decimal("0.00"))


def policies_from_text(text):
    pages = [page for page in text.split("\f") if "Your Guaranteed Premium of" in page]
    if len(pages) not in (1, 2):
        raise ValueError("Expected one or two printed guaranteed policy premiums")
    insured = set()
    policies = []
    for page in pages:
        one(r"^[ \t]*Life Insurance Quotation[ \t]*$", page)
        if re.search(r"\b(decreasing|indexation|increasing|reviewable|joint)\b", page, re.I):
            raise ValueError("Unsupported cover or premium basis")
        date = datetime.strptime(one(r"Quote Date:\s*" + DATE, page), "%d/%m/%Y").date()
        dob, smoker = one(r"Date of Birth:\s*" + DATE + r"[ \t]+(Non Smoker|Smoker)\*", page)
        born = datetime.strptime(dob, "%d/%m/%Y").date()
        insured.add((date, born, smoker))
        age = date.year - born.year - ((date.month, date.day) < (born.month, born.day))
        years = int(one(r"Length of the Policy:\s*(\d+) years?\b", page))
        capital = one(r"Life Cover:[ \t]*" + CAPITAL, page)
        if one(r"•\s*Life Cover of " + CAPITAL, page) != capital:
            raise ValueError("Life capital differs within the policy")
        ci_title = re.findall(r"^[ \t]*with Critical Illness (Extra|Cover)[ \t]*$", page, re.M)
        ci = re.findall(r"Critical Illness (Extra|Cover):[ \t]*" + CAPITAL, page)
        if len(ci_title) > 1 or ci != [(name, capital) for name in ci_title]:
            raise ValueError("Shared critical illness capital differs from the title or life capital")
        if ci and one(r"•\s*Critical Illness " + ci_title[0] + " of " + CAPITAL, page) != capital:
            raise ValueError("Critical illness benefit differs within the policy")
        discounted = "As you have selected more than one product you are eligible for a discount." in page
        if discounted != (len(pages) > 1) or ("discount" in page.lower()) != discounted:
            raise ValueError("Unresolved multi-product discount")
        total = sum_paid([one(r"Your Guaranteed Premium of\s*" + GBP + r"\s+Payable: monthly", page)])
        waiver = re.findall(r"Waiver of Premium for [^\n]*? is included at " + GBP + " monthly", page)
        tpd = re.findall(r"Total and Permanent Disability cover with (?:an? )?(?:Specified Work Tasks|Own Occupation)"
                         r" definition is included at " + GBP, page)
        bullets = re.findall(r"^[ \t]*•[ \t]*([^\n]+)", page, re.M)
        if (len(waiver) > 1 or len(tpd) > 1 or len(re.findall(r"included at £", page)) != len(waiver) + len(tpd)
                or any(not bullet.startswith(BULLETS) for bullet in bullets)):
            raise ValueError("Unrecognised charged benefit")
        extras = sum_paid(waiver + tpd)
        if total <= extras or age < 18 or years < 1:
            raise ValueError("Invalid price or duration")
        policies.append(dict(date=date.isoformat(), age=age, smoker=smoker == "Smoker", years=years,
                             cover=int(capital.replace(",", "")), ci=ci_title[0] if ci else None,
                             discounted=discounted, total=total, base=total-extras, waiver=sum_paid(waiver),
                             tpd=sum_paid(tpd)))
    if len(insured) != 1 or (len(policies) == 2 and sum(policy["ci"] is None for policy in policies) != 1):
        raise ValueError("Policies disagree on insured profile, or the benefit combination is unsupported")
    return policies


def check_row(row, policies):
    billed = Decimal(row["total_monthly"])
    selected = [policy for policy in policies if policy["total"] == billed]
    if len(selected) != 1:
        if len(selected) > 1 or sum(policy["total"] for policy in policies) != billed:
            raise ValueError("Archive price does not identify a policy or the whole package")
        selected = policies
    first = selected[0]
    life = next((policy for policy in selected if not policy["ci"]), None)
    shared = next((policy for policy in selected if policy["ci"]), None)
    product = "Life"
    if shared:
        product = ("Life + " if life else "") + "Life or Earlier CI " + ("Extra" if shared["ci"] == "Extra" else "Standard")
    if first["discounted"]:
        product += " discounted multiproduct"
    extras = sum(policy["waiver"] + policy["tpd"] for policy in selected)
    features = [label for field, label in (("tpd", "TPD"), ("waiver", "Waiver of Premium"))
                if any(policy[field] for policy in selected)]
    if (row["source_date"] != first["date"] or int(row["age"]) != first["age"]
            or row["smoker"] != str(first["smoker"]).lower() or row["product"] != product
            or any(policy["years"] != int(row["term_years"]) for policy in selected)
            or int(row["life_component"]) != (life or shared)["cover"]
            or int(row["critical_illness_component"]) != (shared["cover"] if shared else 0)
            or Decimal(row["base_life_monthly"]) != (life["base"] if life else 0)
            or Decimal(row["base_ci_monthly"]) != (shared["base"] if shared else 0)
            or row["optional_features"] != (" and ".join(features) or "None")
            or Decimal(row["optional_monthly"]) != extras):
        raise ValueError("Archive coverage, profile or charged components differ from the policy")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdfs", type=Path, nargs="+")
    args = parser.parse_args()
    catalog = Path(__file__).resolve().parents[1] / "data/illustration-validation-2026-11-19.csv"
    with catalog.open() as source:
        by_hash = {}
        for row in csv.DictReader(source):
            if row["provider"] == "Legal & General":
                by_hash.setdefault(row["sha256"], []).append(row)
    checked = set()
    policies_read = records_read = 0
    for path in args.pdfs:
        pdf = path.read_bytes()
        digest = hashlib.sha256(pdf).hexdigest()
        if digest in checked:
            continue
        if digest not in by_hash:
            raise ValueError("PDF is absent from the L&G illustration catalog")
        checked.add(digest)
        text = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=pdf).decode()
        policies = policies_from_text(text)
        for row in by_hash[digest]:
            check_row(row, policies)
        policies_read += len(policies)
        records_read += len(by_hash[digest])
    print(f"{len(checked)} source PDFs, {policies_read} policy sheets, {records_read} catalog records verified.")


if __name__ == "__main__":
    main()
