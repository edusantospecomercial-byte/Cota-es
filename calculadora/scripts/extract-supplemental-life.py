"""Extract previously uncounted, guaranteed level-life offers from original comparison PDFs.

Read comparison paths on stdin, and pass --illustration-root for each document archive.
The paired illustration is required to confirm an otherwise unspecified waiver. Public
output includes fingerprints and economic terms only. Add its comparison PDFs to the
source index with index-comparison-pdfs.py after refreshing the data.
"""
import argparse
import csv
from datetime import datetime
from hashlib import sha256
from pathlib import Path
import re
import runpy
import subprocess
import sys

from illustration_pairs import pairs


DATA = Path(__file__).resolve().parents[1] / "data"
BASE = ("solutionbuilder-observed-2026-11-24", "verified-archive-terms", "comparisons-with-waiver",
        "waiver-individual-offers", "accelerated-comparisons", "accelerated-maturity-declines",
        "independent-ci-tpd", "fracture-comparisons")
PRODUCTS = {"Zurich Life": "Zurich", "Aviva Life Insurance+": "Aviva", "Legal & General Life": "Legal & General"}
FIELDS = ("source_date", "reference", "sha256", "provider", "product", "age", "smoker", "to_age",
          "life_cover", "quoted_life_cover", "monthly_premium", "quoted_term", "waiver_to", "occupation_rated", "quoted_tpd")


def recorded_keys():
    with (DATA / "comparison-pdf-index.csv").open() as stream:
        index = {r["sha256"]: r["report_key"] for r in csv.DictReader(stream)}
    keys = set()
    for name in BASE:
        with (DATA / (name + ".csv")).open() as stream:
            for r in csv.DictReader(stream):
                keys.add((index[r["sha256"]], r["provider"]))
    return keys


def extract(text, digest):
    cover, _, tables = text.partition("\f")
    benefits = re.findall(r"^[ \t]*•[ \t]+([^\n]+(?:\n[ \t]{6,}[^\s•][^\n]*)*)", cover, re.M)
    if len(benefits) != 1 or not re.search(r"Quotation basis:\s*Benefit-led", cover) or not re.search(r"Premium frequency:\s*Monthly", cover):
        return []
    benefit = re.fullmatch(r"Level Term Assurance: 1st life, £([\d,]+) life cover, policy duration is to age (\d+), premiums are guaranteed", " ".join(benefits[0].split()))
    ref = re.search(r"Your Reference:\s*(\d+)", cover)
    issued = re.search(r"Date Requested:\s*([\d/]+)", cover)
    insured = re.search(r"^Client:.*?\ba (?:Male|Female) (non-smoker|smoker)(?: who has never smoked)?, born on ([\d/]+)", cover, re.I | re.M)
    if not all((benefit, issued, ref, insured)):
        return []
    date, birth = [datetime.strptime(v, "%d/%m/%Y").date() for v in (issued[1], insured[2])]
    age = date.year - birth.year - ((date.month, date.day) < (birth.month, birth.day))
    end, requested = int(benefit[2]), int(benefit[1].replace(",", ""))
    head, marker, table = tables.partition("Non Underwritten Results")
    head = " ".join(head.partition("Provider / Product")[2].split())
    if not marker or not re.search(r"Life Cover Policy Indexation (?:Waiver )?TPD Low", head) or not 18 <= age < end <= 100:
        return []
    waiver_column = "Indexation Waiver TPD" in head
    table = table.partition("Products Not Quoting:")[0]
    out = []
    for product, provider in PRODUCTS.items():
        lines = set(re.findall(r"^[ \t]*" + re.escape(product) + r"[ \t]{2,}(£[^\n]+)", table, re.M))
        if len(lines) != 1:
            continue
        match = re.fullmatch(r"£([\d,]+\.\d{2})\s+Guaranteed\s+(No)\s+Monthly\s+£([\d,]+)\s+(To Age \d+|\d+ years?)\s+Level\s+" +
                             (r"(Expiry|\d+|No data)\s+" if waiver_column else "") + r"(None|Own)\s+No", lines.pop().strip())
        if not match:
            continue
        price, rated, capital, term, *waiver, tpd = match.groups()
        if tpd == "Own" and provider != "Legal & General":
            continue
        offered = int(capital.replace(",", ""))
        duration = int(re.search(r"\d+", term)[0])
        if not (float(price.replace(",", "")) > 0 and offered > 0 and requested > 0 and
                (duration == end if term.startswith("To Age") else duration in (end-age, end-age-1))):
            continue
        out.append(dict(source_date=date.isoformat(), reference=ref[1], sha256=digest, provider=provider, product=product,
                        age=age, smoker="Yes" if insured[1].lower()=="smoker" else "No", to_age=end, life_cover=requested,
                        quoted_life_cover=offered, monthly_premium=price.replace(",",""), quoted_term=term,
                        waiver_to=waiver[0] if waiver else "not_requested", occupation_rated=rated, quoted_tpd=tpd))
    return out


def illustration_paths(roots):
    if not roots:
        return []
    documents = subprocess.run(["rg", "--files", "--hidden", "--no-ignore", "-0", "-g", "!**/.git/**",
                                "-g", "!**/node_modules/**", "--iglob", "Illustration.pdf",
                                "--iglob", "*supporting*documents*.zip", *roots], capture_output=True)
    if documents.returncode not in (0, 1):
        raise SystemExit(documents.stderr.decode())
    return sorted(Path(n) for n in documents.stdout.decode().split("\0") if n)


def confirm_zurich_benefits(offers, paths):
    """Resolve an unspecified waiver only with the illustration bundled with the same comparison."""
    if not paths:
        return {}
    reader = runpy.run_path(str(Path(__file__).with_name("extract-zurich-life-components.py")))
    wanted = {r["sha256"]: r for r in offers if r["provider"] == "Zurich" and r["waiver_to"] == "No data"}
    confirmed, seen = {}, set()
    for illustration, comparison in pairs(paths, "Zurich Life"):
        source = sha256(comparison).hexdigest()
        row = wanted.get(source)
        if not row:
            continue
        proof = sha256(illustration).hexdigest()
        if (proof, source) in seen:
            continue
        seen.add((proof, source))
        text = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=illustration).decode()
        if "you haven't chosen any additional benefits available to you" not in text.lower().replace("’", "'"):
            continue
        result = reader["parse_illustration"](text, proof)
        if not result or len(result[1]) != 1:
            continue
        issued, age, smoker, end, life, gross, riders, discount, monthly, policies, _ = result[1][0]
        if (issued != row["source_date"] or age != row["age"] or smoker != row["smoker"] or
                end != row["to_age"] or life != row["quoted_life_cover"] or row["quoted_term"] != f"To Age {end}" or
                policies != 1 or riders or discount or gross != monthly or str(monthly) != row["monthly_premium"]):
            continue
        first_page = subprocess.check_output(["pdftotext", "-f", "1", "-l", "1", "-layout", "-", "-"], input=comparison).decode()
        comparison_birth = re.search(r"born on ([\d/]+)", first_page, re.I)
        policy_birth = re.search(r"Date of birth\s+" + reader["DATE"], text, re.I)
        if comparison_birth and policy_birth and datetime.strptime(comparison_birth[1], "%d/%m/%Y").date() == reader["parse_date"](policy_birth[1]):
            confirmed[source] = min(proof, confirmed.get(source, proof))
    return confirmed


def confirm_lg_waiver(offers, paths):
    """Confirm the actual waiver charge separately from the comparison's TPD column."""
    reader = runpy.run_path(str(Path(__file__).with_name("extract-lg-life-components.py")))["read_pair"]
    wanted = {r["sha256"]: r for r in offers if r["provider"] == "Legal & General" and r["quoted_tpd"] == "Own"}
    checked, results = set(), {}
    for illustration, comparison in pairs(paths, "Legal & General Life"):
        source = sha256(comparison).hexdigest()
        if source not in wanted:
            continue
        proof = sha256(illustration).hexdigest()
        if (source, proof) in checked:
            continue
        checked.add((source, proof))
        matched = reader(illustration, comparison, tpd_column="Own")
        if not matched:
            continue
        if str(matched[7]) != wanted[source]["monthly_premium"] or matched[6] <= 0:
            continue
        details = {"illustrated_waiver_monthly": str(matched[6]), "waiver_illustration_sha256": proof}
        if source in results:
            if results[source]["illustrated_waiver_monthly"] != details["illustrated_waiver_monthly"]:
                raise ValueError("Different waiver prices for the same comparison")
            if proof >= results[source]["waiver_illustration_sha256"]:
                continue
        results[source] = details
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path)
    parser.add_argument("--stdin", action="store_true", help="Read additional PDF paths, one per line.")
    parser.add_argument("--illustration-root", type=Path, action="append", default=[], help="Search accompanying insurer illustrations for explicit benefit selections.")
    args = parser.parse_args()
    existing = recorded_keys()
    seen, kept = set(), {}
    paths = args.paths + ([Path(s.rstrip("\n")) for s in sys.stdin if s.strip()] if args.stdin else [])
    for root in paths:
        for path in ([root] if root.is_file() else root.rglob("Comparison Report*.pdf")):
            binary = path.read_bytes()
            digest = sha256(binary).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            text = subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=binary).decode()
            for r in extract(text, digest):
                report_key = sha256(("solutionbuilder-comparison:"+r["reference"]).encode("ascii")).hexdigest()[:32]
                key = (report_key, r["provider"])
                if key in existing:
                    continue
                if key in kept and any(r[c] != kept[key][c] for c in FIELDS if c != "sha256"):
                    raise ValueError("Conflicting official offers for reference " + r["reference"])
                if key not in kept or digest < kept[key]["sha256"]:
                    kept[key] = r
    paths = illustration_paths(args.illustration_root)
    confirmed = confirm_zurich_benefits(kept.values(), paths)
    lg_charges = confirm_lg_waiver(kept.values(), paths)
    public_fields = [f for f in FIELDS if f != "reference"] + ["no_riders_illustration_sha256", "illustrated_waiver_monthly", "waiver_illustration_sha256"]
    writer = csv.DictWriter(sys.stdout, fieldnames=public_fields, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in sorted(kept.values(), key=lambda r: (r["source_date"], r["reference"], r["provider"])):
        charges = lg_charges.get(row["sha256"], {}) if row["provider"] == "Legal & General" else {}
        writer.writerow({**row, **charges, "no_riders_illustration_sha256": confirmed.get(row["sha256"], "") if row["provider"] == "Zurich" else ""})


if __name__ == "__main__":
    main()
