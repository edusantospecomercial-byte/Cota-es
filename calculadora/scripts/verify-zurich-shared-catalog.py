"""Reconcile archived Zurich shared-cover entries and their accompanying life policies."""

import argparse
import csv
import hashlib
from pathlib import Path
import re
import subprocess
from decimal import Decimal
from importlib import import_module

zurich = import_module("extract-zurich-life-components")
SHARED = "Level Life Cover and Critical Illness"
LIFE = "Level Life Cover"


def field(part, label, pattern):
    regular = zurich.field(part, label, pattern)
    if regular is not None:
        return regular
    # Some older PDFs place the value one line above the label.
    found = re.findall(r"^[ \t]+" + pattern + r"[ \t]*\n[ \t]*" + label + r"[ \t]*$", part, re.M)
    return found[0] if len(found) == 1 else None


def fields_from_pdf(text, paid):
    text = text.replace("\f", "\n")
    if "your zurich personal protection quote" not in text.lower() or "standard rates and your current age" not in text.lower():
        raise ValueError("Not a standard-rate Zurich quote")
    dates = set(re.findall(r"\bDate prepared\s+" + zurich.DATE, text))
    if len(dates) != 1:
        raise ValueError("Missing or ambiguous quote date")
    issued = zurich.parse_date(dates.pop())
    front, *parts = re.split(r"^[ \t]*Date of birth[ \t]+", text, flags=re.M | re.I)
    if len(parts) not in (1, 2):
        raise ValueError("Unsupported number of policies")
    policies = []
    insured = set()
    for part in parts:
        kind = field(part, "Cover provided", r"(.+?)")
        dob = re.match(zurich.DATE, part)
        smoker = field(part, "Smoker status", r"(Smoker|Non-Smoker)")
        end = field(part, "Term", r"To age (\d+)")
        capital = field(part, "Sum assured", zurich.MONEY)
        gross = field(part, "Monthly premium for main cover", zurich.MONEY)
        guaranteed = field(part, "Premium type", "(Guaranteed)")
        if kind not in (SHARED, LIFE) or not all((dob, smoker, end, capital, gross, guaranteed)):
            raise ValueError("Unsupported or incomplete life/CI schedule")
        birth = zurich.parse_date(dob[1])
        insured.add((birth, smoker, end))
        cap = zurich.pounds(capital)
        if cap != int(cap) or cap <= 0:
            raise ValueError("Invalid insured capital")
        billed = zurich.field(part, "Total Monthly premium", zurich.MONEY)
        statement = re.split(r"^[ \t]*What will it cost\?[ \t]*$", part, maxsplit=1, flags=re.M)
        if len(statement) != 2:
            raise ValueError("Missing Zurich premium statement")
        menu, prices = statement
        chosen = re.split(r"^[ \t]*Additional benefits[ \t]*$", menu, maxsplit=1, flags=re.M)
        if len(chosen) != 2:
            raise ValueError("Missing optional benefits schedule")
        menu = re.sub(r"(Total Permanent Disability - (?:Own|Work))[ \t]*\n[ \t]*(Occupation|Tasks)", r"\1 \2", chosen[1])
        features = {}
        labels = {"Waiver of Premium": "Waiver of Premium", "Multi-Fracture Cover": "Fracture cover",
                  "Children's Cover": "Children's Cover", "Total Permanent Disability - Own": "TPD",
                  "Total Permanent Disability - Work": "TPD"}
        for line in menu.splitlines():
            if "£" not in line:
                continue
            charge = re.fullmatch(r"[ \t]*(.+?)[ \t]{2,}" + zurich.MONEY +
                                  r"(?:[ \t]+(?:payable until .*|for £[\d,.]+ sum assured))?[ \t]*", line)
            if not charge:
                raise ValueError("Unrecognised additional charge")
            label = next((v for k, v in labels.items() if charge[1].strip() == k or
                          (k.startswith("Total Permanent Disability") and charge[1].strip() in (k + " Occupation", k + " Tasks"))), None)
            if not label or label in features:
                raise ValueError("Unrecognised or duplicate price component")
            features[label] = zurich.pounds(charge[2])
        extras = sum(features.values(), Decimal(0))
        gross = zurich.pounds(gross)
        discount = zurich.pounds(zurich.field(prices, "Multi-policy discount", zurich.MONEY) or "0")
        if billed:
            stated_main = zurich.field(prices, "Main cover", zurich.MONEY)
            add = zurich.pounds(zurich.field(prices, "Additional benefits", zurich.MONEY) or "0")
            billed = zurich.pounds(billed)
            if (stated_main and zurich.pounds(stated_main) != gross) or extras != add or gross + add - discount != billed:
                raise ValueError("Policy charges do not sum to the monthly premium")
        else:
            # An incomplete policy footer can coexist with a fully documented second policy.
            # The front-page item establishes its price only for disambiguating the selected policy.
            marker = "Level Life Cover and Critical" if kind == SHARED else "Level Life Cover"
            summary = re.findall(re.escape(marker) + r"[ \t]{2,}To age[ \t]+£" + re.escape(capital) +
                                 r"[ \t]+" + zurich.MONEY + r"[ \t]*$", front, re.M)
            if len(summary) != 1:
                raise ValueError("Missing policy price in summary")
            billed = zurich.pounds(summary[0])
            discount = None
        policies.append(dict(kind=kind, capital=int(cap), gross=gross, discount=discount, billed=billed, extras=features))
    if len(insured) != 1 or len({p["kind"] for p in policies}) != len(policies):
        raise ValueError("Ambiguous Zurich package")
    selected = [p for p in policies if p["billed"] == paid]
    if not selected and sum(p["billed"] for p in policies) == paid:
        selected = policies
    if not selected or any(p["discount"] is None for p in selected) or sum(p["billed"] for p in selected) != paid:
        raise ValueError("Catalog entry cannot be matched to a documented policy")
    pure = next((p for p in selected if p["kind"] == LIFE), None)
    earlier = next((p for p in selected if p["kind"] == SHARED), None)
    product = "Life"
    if earlier:
        product = ("Life + " if pure else "") + "Life or Earlier CI"
    if any(p["discount"] > 0 for p in selected):
        product += " discounted multipolicy"
    birth, smoke, end = insured.pop()
    age = issued.year - birth.year - ((issued.month, issued.day) < (birth.month, birth.day))
    if not 18 <= age < int(end):
        raise ValueError("Invalid policy age")
    extras = set(label for p in selected for label in p["extras"])
    return dict(source_date=issued.isoformat(), age=str(age), smoker=str(smoke == "Smoker").lower(), to_age=end,
                term_years=str(int(end) - age), product=product, life_component=str((pure or earlier)["capital"]),
                critical_illness_component=str(earlier["capital"] if earlier else 0), total_monthly=paid,
                base_life_monthly=pure["gross"] - pure["discount"] if pure else Decimal(0),
                base_ci_monthly=earlier["gross"] - earlier["discount"] if earlier else Decimal(0),
                optional_monthly=sum(sum(p["extras"].values()) for p in selected),
                optional_features=" and ".join(sorted(extras)) or "None")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--policy", action="append", nargs=2, metavar=("PDF", "MONTHLY_PREMIUM"), required=True)
    args = parser.parse_args()
    catalog = Path(__file__).resolve().parents[1] / "data/illustration-validation-2026-11-19.csv"
    with catalog.open() as fp:
        rows = {(r["sha256"], Decimal(r["total_monthly"])): r for r in csv.DictReader(fp) if r["provider"] == "Zurich"}
    checked = set()
    for path, monthly in args.policy:
        pdf = Path(path).read_bytes()
        digest, paid = hashlib.sha256(pdf).hexdigest(), Decimal(monthly)
        key = (digest, paid)
        if key not in rows:
            raise ValueError("Input and billed premium absent from the Zurich catalog")
        if key in checked:
            continue
        text = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=pdf).decode()
        expected = fields_from_pdf(text, paid)
        for column, value in expected.items():
            actual = rows[key][column]
            if (actual if isinstance(value, str) else Decimal(actual)) != value:
                raise ValueError(f"Archived {column} differs from the Zurich PDF")
        checked.add(key)
    print(f"{len(checked)} Zurich catalog entries matched to original policy and billed premium.")


if __name__ == "__main__":
    main()
