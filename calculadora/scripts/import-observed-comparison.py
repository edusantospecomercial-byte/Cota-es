"""Validate a SolutionBuilder comparison against the requested inputs and export it."""

import argparse
import csv
import hashlib
import io
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path


FIELDS = ("source_date", "model_id", "age", "smoker", "to_age", "life_cover",
          "critical_illness_cover", "provider", "product", "monthly_premium",
          "available", "quoted_term", "occupation_rated", "sha256", "unavailable_reason",
          "quoted_life_cover", "quoted_critical_illness_cover")
PRODUCTS = {
    "Zurich": ("Zurich Life", "Zurich Life & CI", "Zurich Critical Illness"),
    "Legal & General": ("Legal & General Life", "Legal & General Life + CI (Standard)", "Legal & General CI (Standard)"),
    "Aviva": ("Aviva Life Insurance+", "Aviva Multi-Product with Core CI", "Aviva Critical Illness+ Core"),
}


def extract(path, model_id, age, smoker, to_age, life, ci):
    text = subprocess.check_output(["pdftotext", "-layout", str(path), "-"], encoding="utf-8")
    cover = text.split("\f", 1)[0]
    result, _, unavailable = text.partition("Products Not Quoting:")
    summary = re.findall(r"^\s*•\s*([^\n]+)", cover, re.M)
    pattern = (r"Level Term Assurance: 1st life, £([\d,]+) life"
               r"(?: & £([\d,]+) critical illness)? cover, policy duration is to age (\d+), premiums are guaranteed")
    if not life and ci > 0:
        pattern = (r"Level Term Assurance: 1st life, £([\d,]+) critical illness cover, policy duration is to age (\d+),"
                   r" premiums are guaranteed")
    benefit = re.fullmatch(pattern, summary[0].strip()) if len(summary) == 1 else None
    if not benefit or [int((v or "0").replace(",", "")) for v in benefit.groups()] != ([life, ci, to_age] if life else [ci, to_age]):
        raise ValueError("Benefit structure or requested capital/term differs from the report.")
    if not all(re.search(p, cover) for p in (r"Quotation basis:\s*Benefit-led", r"Premium frequency:\s*Monthly")):
        raise ValueError("Unexpected quote basis or frequency.")
    if "Non Underwritten Results" not in result or not re.fullmatch(r"\d+", model_id):
        raise ValueError("Missing indicative results or reference.")
    client = re.search(r"^Client:.*?\ba (?:Male|Female) (non-smoker|smoker)(?: who has never smoked)?, born on ([\d/]+)", cover, re.M | re.I)
    quoted = re.search(r"Date Requested:\s*([\d/]+)", cover)
    if not (quoted and client):
        raise ValueError("Report does not specify the age and smoking profile.")
    date, birth = [datetime.strptime(value, "%d/%m/%Y").date() for value in (quoted[1], client[2])]
    actual_age = date.year - birth.year - ((date.month, date.day) < (birth.month, birth.day))
    if actual_age != age or (client[1].lower() == "smoker") != (smoker == "Yes"):
        raise ValueError("Age or smoking status differs from the requested scenario.")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    data = []
    for provider, products in PRODUCTS.items():
        product = products[2 if not life else int(bool(ci))]
        prefix = r"^[ \t]*" + re.escape(product) + r"[ \t]{2,}"
        lines = re.findall(prefix + r"(£[^\n]+)", result, re.M)
        base = [date.isoformat(), model_id, age, smoker, to_age, life, ci, provider, product]
        if not lines:
            reason = re.search(prefix + r"(\S[^\n]*)", unavailable, re.M)
            if not reason:
                raise ValueError(f"Missing explicit unavailable result for {provider}.")
            limit = re.search(r"(?:maturity age of|expiry exceeds maximum allowed)\s+(\d+)", reason[1], re.I)
            if limit:
                code = "maximum_end_age_" + limit[1]
            elif "policy termination is not supported" in reason[1].lower():
                code = "end_age_not_supported"
            else:
                code = "product_not_quoted"
            data.append(base + ["", "false", "", "", digest, code, "", ""])
            continue
        if len(set(lines)) != 1:
            raise ValueError(f"Conflicting prices for {provider}.")
        capitals = r"£([\d,]+)" + (r"\s+£([\d,]+)\s+No data" if ci else "")
        if not life:
            capitals = r"£([\d,]+)\s+No data"
        entry = re.fullmatch(
            r"£([\d,]+\.\d{2})\s+Guaranteed\s+(Yes|No)\s+Monthly\s+" + capitals
            + r"\s+(To Age \d+|\d+ years?)\s+Level\s+None\s+No\s*", lines[0])
        if not entry:
            raise ValueError(f"Unrecognised product terms for {provider}.")
        price, based_on_job, *sums, term = entry.groups()
        returned = [int(v.replace(",", "")) for v in sums]
        if not ci:
            returned.append(0)
        if not life:
            returned.insert(0, 0)
        if (life and returned[0] <= 0) or (ci and returned[1] <= 0):
            raise ValueError(f"Invalid returned capital for {provider}.")
        if term.startswith("To Age"):
            valid_term = term == f"To Age {to_age}"
        else:
            valid_term = int(term.split()[0]) in (to_age - age, to_age - age - 1)
        if not valid_term or float(price.replace(",", "")) <= 0:
            raise ValueError(f"Term mismatch or invalid premium for {provider}.")
        data.append(base + [price.replace(",", ""), "true", term, based_on_job, digest, "", *returned])
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("model_id")
    parser.add_argument("age", type=int)
    parser.add_argument("smoker", choices=["Yes", "No"])
    parser.add_argument("to_age", type=int)
    parser.add_argument("life", type=int)
    parser.add_argument("ci", type=int)
    args = parser.parse_args()
    parsed = extract(args.pdf, args.model_id, args.age, args.smoker, args.to_age, args.life, args.ci)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(FIELDS)
    writer.writerows(parsed)
    sys.stdout.write(buffer.getvalue())


if __name__ == "__main__":
    main()
