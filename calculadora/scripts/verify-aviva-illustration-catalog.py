"""Check Aviva's archived level-cover policy schedules against the original PDF charges."""

import argparse
import csv
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
import re
import subprocess


GBP = r"£([\d,]+\.\d{2})"
DATE = r"(\d{1,2} [A-Za-z]+ \d{4})"
LIFE = "Life cover"
SHARED = "Life and critical illness cover"
CI = "Critical illness cover"
EXTRAS = ("Upgraded critical illness benefit", "Upgraded children's benefit", "Fracture cover",
          "Total permanent disability", "Waiver of Premium")


def single(pattern, text):
    values = re.findall(pattern, text, re.M)
    if len(values) != 1:
        raise ValueError(f"Missing or ambiguous field: {pattern}")
    return values[0]


def amount(number):
    return Decimal(number.replace(",", ""))


def policies_from_text(text):
    sections = re.split(r"^[ \t]*Page 1 of \d+[ \t]*$", text.replace("\f", "\n"), flags=re.M)
    sections = [part for part in sections if "Cover details" in part]
    if len(sections) not in (1, 2) or text.count("Date of birth:") != len(sections):
        raise ValueError("Unsupported number of schedules or insured lives")
    insured = set()
    policies = []
    for part in sections:
        if "your quick quote illustration" not in part.lower():
            raise ValueError("Missing insurer illustration heading")
        prepared = single(r"Date prepared[ \t]*\n[^\n]*?" + DATE, part)
        birth = single(r"Date of birth:[ \t]*" + DATE, part)
        smoker = single(r"Smoker status:[ \t]*(Smoker|Non-Smoker)\b", part)
        issued, born = (datetime.strptime(item, "%d %B %Y").date() for item in (prepared, birth))
        age = issued.year - born.year - ((issued.month, issued.day) < (born.month, born.day))
        _, marker, after = part.partition("Cover details")
        # A page footer may sit between the selected options, premium and its itemisation.
        footer = (r"^[ \t]*LAB1 - LAXX[^\n]+Members of the Association of British Insurers[ \t]*\n"
                  r"[ \t]*Aviva Life & Pensions UK Limited\.[^\n]+\n"
                  r"[ \t]*Authorised by the Prudential Regulation Authority[^\n]+\n"
                  r"[ \t]*Prudential Regulation Authority\. Firm Reference Number[^\n]+\s+Page \d+ of \d+[ \t]*$")
        after = re.sub(footer, "", after, flags=re.M)
        section = re.split(r"^[ \t]*(?:Total premiums payable over the term of the policy|Introducing Aviva DigiCare\+|How much does it cost to arrange this cover)", after, maxsplit=1, flags=re.M)
        if not marker or len(section) != 2:
            raise ValueError("Incomplete schedule or payment section")
        schedule = section[0]
        kind, named = single(r"^[ \t]*(Life cover|Life and critical illness cover|Critical illness cover) for[ \t]+([^\n]+)", schedule)
        insured.add((born, issued, smoker, named.strip()))
        if single(r"^[ \t]*Cover type[ \t]+([^\n]+)", schedule).strip() != "Level":
            raise ValueError("Only level cover is comparable")
        cap = amount(single(r"^[ \t]*Cover amount[ \t]+" + GBP + r"[ \t]*$", schedule))
        end = int(single(r"^[ \t]*Expiry age[ \t]+(\d+)[ \t]*$", schedule))
        paid = amount(single(r"^[ \t]*Monthly premium[ \t]+" + GBP + r"[ \t]*$", schedule))
        if not 18 <= age < end or cap != int(cap) or cap <= 0 or paid <= 0:
            raise ValueError("Invalid insured age, term, capital or premium")
        chosen, sep, charges = schedule.partition("How much will it cost?")
        declared = [s.strip() for s in re.findall(r"^[ \t]*§[ \t]*([^\n]+)$", chosen, re.M)]
        if not sep or any(label not in EXTRAS for label in declared):
            raise ValueError("Unknown or missing schedule of benefits")
        _, itemised, lines = charges.partition("How your premium is made up")
        if itemised:
            pairs = [single(r"^[ \t]*§[ \t]*(.+?)[ \t]{2,}" + GBP + r"[ \t]*$", line)
                     for line in lines.splitlines() if line.strip()]
            if [label.strip() for label, _ in pairs] != [kind] + declared or len(set(declared)) != len(declared):
                raise ValueError("Itemised charges differ from selected benefits")
            amounts = {label.strip(): amount(value) for label, value in pairs}
        else:
            if kind != LIFE or declared or not re.fullmatch(r"\s*Monthly premium[ \t]+" + GBP + r"\s*", charges):
                raise ValueError("Missing breakdown for cover with extra benefits")
            amounts = {kind: paid}
        if sum(amounts.values()) != paid or min(amounts.values()) <= 0:
            raise ValueError("Itemised amounts do not reconcile with the policy premium")
        policies.append(dict(date=issued.isoformat(), age=age, smoker=smoker == "Smoker", end=end,
                             capital=int(cap), kind=kind, paid=paid, amounts=amounts))
    if len(insured) != 1 or len({p["end"] for p in policies}) != 1 or len({p["kind"] for p in policies}) != len(policies):
        raise ValueError("Incompatible insured people, expiry ages or policy combination")
    if len(policies) > 1:
        package = single(r"^[ \t]*" + GBP + r"[ \t]*\n[ \t]*You could get all of this cover for monthly", text)
        if amount(package) != sum(p["paid"] for p in policies):
            raise ValueError("Cover summary differs from the individual policy charges")
    return policies


def catalog_fields(policies, selected):
    first = selected[0]
    life = next((p for p in selected if p["kind"] == LIFE), None)
    diagnosis = next((p for p in selected if p["kind"] != LIFE), None)
    product = "Life Insurance+"
    if diagnosis:
        if diagnosis["kind"] == SHARED:
            product = ("Life + " if life else "") + "Life or Earlier CI"
            product += " Upgraded" if EXTRAS[0] in diagnosis["amounts"] else " Core"
        else:
            product = ("Life + " if life else "") + "Critical Illness+ Core"
    if len(policies) > 1 and len(selected) == 1:
        product += " (package component)"
    life_capital = life["capital"] if life else 0
    if not life and diagnosis["kind"] == SHARED:
        life_capital = diagnosis["capital"]
    extras = {label: sum(p["amounts"].get(label, 0) for p in selected) for label in EXTRAS}
    return dict(source_date=first["date"], age=first["age"], smoker=str(first["smoker"]).lower(),
                to_age=first["end"], term_years=first["end"] - first["age"], product=product,
                life_component=life_capital, critical_illness_component=diagnosis["capital"] if diagnosis else 0,
                total_monthly=sum(p["paid"] for p in selected),
                base_life_monthly=life["amounts"][LIFE] if life else 0,
                base_ci_monthly=diagnosis["amounts"][diagnosis["kind"]] if diagnosis else 0,
                optional_monthly=sum(extras.values()), optional_features=" and ".join(k for k, v in extras.items() if v) or "None")


def select_policies(billed, policies):
    matches = [p for p in policies if p["paid"] == billed]
    if len(matches) == 1:
        return matches
    if matches or len(policies) == 1 or sum(p["paid"] for p in policies) != billed:
        raise ValueError("Recorded premium does not identify a policy or package")
    return policies


def check_row(row, policies):
    expected = catalog_fields(policies, select_policies(amount(row["total_monthly"]), policies))
    for key, value in expected.items():
        observed = row[key] if isinstance(value, str) else amount(row[key])
        if observed != value:
            raise ValueError(f"Archived {key} differs from the illustration")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdfs", nargs="+", type=Path)
    args = parser.parse_args()
    with (Path(__file__).resolve().parents[1] / "data/illustration-validation-2026-11-19.csv").open() as fp:
        sources = {}
        for row in csv.DictReader(fp):
            if row["provider"] == "Aviva":
                sources.setdefault(row["sha256"], []).append(row)
    checked = set()
    sheets = rows = 0
    for pdf in args.pdfs:
        data = pdf.read_bytes()
        digest = sha256(data).hexdigest()
        if digest in checked:
            continue
        if digest not in sources:
            raise ValueError("Input is absent from the Aviva catalog")
        text = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=data).decode()
        policies = policies_from_text(text)
        for row in sources[digest]:
            check_row(row, policies)
        checked.add(digest)
        sheets += len(policies)
        rows += len(sources[digest])
    print(f"{len(checked)} original PDFs, {sheets} policy schedules, {rows} Aviva catalog records verified.")


if __name__ == "__main__":
    main()
