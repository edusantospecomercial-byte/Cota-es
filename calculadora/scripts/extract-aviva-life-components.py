"""Reconcile Aviva's itemised standalone life illustrations to their comparison PDFs."""

from datetime import datetime
from decimal import Decimal
import hashlib
import re
import subprocess
from illustration_pairs import extract_pairs

FIELDS = ("source_date", "age", "smoker", "to_age", "life_cover", "base_monthly", "additional_monthly",
          "policy_monthly", "reference", "sha256", "comparison_sha256")
MONEY = r"£([\d,]+\.\d{2})"
BRITISH_DATE = r"(\d{1,2} [A-Za-z]+ \d{4})"


def extract_text(data):
    return subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=data).decode("utf-8")


def price(value):
    return Decimal(value.replace(",", ""))


def life_premium_without_breakdown(text, paid):
    # For a policy with no paid extras Aviva can omit the entire breakdown.
    # Accept only the complete life-only schedule; an unfamiliar line needs review.
    heading, details, rest = text.partition("Cover details")
    if not details or "your quick quote illustration for life" not in heading.lower():
        return None
    schedule, end, _ = rest.partition("Total premiums")
    schedule = re.sub(r"^[ \t]*Life cover for[ \t]+[^\n]+$", "Life cover", schedule, flags=re.M)
    pattern = (r"Life cover Cover type Level Cover amount " + MONEY + r" Expiry age \d+ "
               r"(?:The policy ends when the eldest life covered reaches the expiry age\. )?"
               r"How much will it cost\? Monthly premium " + MONEY)
    match = re.fullmatch(pattern, " ".join(schedule.split()))
    return paid if end and match and price(match[2]) == paid else None


def read_pair(illustration, comparison):
    text = extract_text(illustration)
    heading = "How your premium is made up"
    if "your quick quote illustration" not in text.lower() or text.count(heading) > 1:
        return None
    if len(re.findall(r"Date of birth:", text)) != 1 or not re.search(r"^\s*Cover type\s+Level[ \t]*$", text, re.M):
        return None
    birth = re.search(r"Date of birth:[ \t]*" + BRITISH_DATE, text)
    prepared = re.search(r"Date prepared[ \t]*\n[^\n]*?" + BRITISH_DATE, text)
    smoker = re.search(r"Smoker status:[ \t]*(Non-Smoker|Smoker)\b", text, re.I)
    life = re.search(r"^\s*Cover amount[ \t]+" + MONEY + r"[ \t]*$", text, re.M)
    end = re.search(r"^\s*Expiry age[ \t]+(\d+)[ \t]*$", text, re.M)
    total = re.search(r"^\s*Monthly premium[ \t]+" + MONEY + r"[ \t]*$", text, re.M)
    if not all((prepared, birth, smoker, life, end, total)):
        return None
    paid = price(total[1])
    if heading in text:
        breakdown = text.split(heading, 1)[1]
        items = re.findall(r"^[ \t]*§[ \t]*(.+?)[ \t]{2,}" + MONEY + r"[ \t]*$", breakdown, re.M)
        bases = [price(value) for label, value in items if label.strip().lower() == "life cover"]
        if len(bases) != 1 or paid != sum(price(value) for _, value in items):
            return None
        base = bases[0]
    else:
        base = life_premium_without_breakdown(text, paid)
    if base is None or not 0 < base <= paid:
        return None
    lump, to_age = price(life[1]), int(end[1])
    if lump != int(lump) or lump <= 0:
        return None
    report = extract_text(comparison)
    cover, _, results = report.partition("\f")
    if "Non Underwritten Results" not in results:
        return None
    benefits = [" ".join(line.split()) for line in re.findall(
        r"^[ \t]*•[ \t]+([^\n]+(?:\n[ \t]{6,}[^\s•][^\n]*)*)", cover, re.M)]
    benefit = re.fullmatch(r"Level Term Assurance: 1st life, £([\d,]+) life cover, policy duration is to age (\d+), premiums are guaranteed(?:, Fracture Cover selected)?", benefits[0].strip()) if len(benefits) == 1 else None
    ref = re.search(r"Your Reference:\s*(\d+)", cover)
    dated = re.search(r"Date Requested:\s*([\d/]+)", cover)
    person = re.search(r"^Client:.*?\ba (?:Male|Female) (smoker|non-smoker)(?: who has never smoked)?, born on ([\d/]+)", cover, re.M | re.I)
    # The provider can increase the capital to reach its minimum premium.
    # Only the amount printed in both the offer and illustration may enter the lookup.
    if not benefit or price(benefit[1]) <= 0 or int(benefit[2]) != to_age or not all((ref, dated, person)):
        return None
    issued, born = [datetime.strptime(m[1], "%d %B %Y").date() for m in (prepared, birth)]
    if (issued != datetime.strptime(dated[1], "%d/%m/%Y").date() or
            born != datetime.strptime(person[2], "%d/%m/%Y").date() or
            smoker[1].lower() != person[1].lower()):
        return None
    rows = set(re.findall(r"^[ \t]*Aviva Life Insurance\+[ \t]{2,}([^\n]+)",
                          results.partition("Products Not Quoting:")[0], re.M))
    if len(rows) != 1:
        return None
    offer = re.fullmatch(MONEY + r"\s+Guaranteed\s+No\s+Monthly\s+£([\d,]+)\s+To Age (\d+)\s+Level\s+(?:(\d+|Expiry|No data)\s+)?None\s+No", rows.pop().strip())
    if not offer or price(offer[1]) != paid or price(offer[2]) != lump or int(offer[3]) != to_age:
        return None
    # "No data" does not establish a waiver either way. The insurer's complete
    # schedule above supplies the separate evidence for the life-only premium.
    if heading not in text and (offer[4] not in (None, "No data") or "Fracture Cover selected" in benefit[0]):
        return None
    age = issued.year - born.year - ((issued.month, issued.day) < (born.month, born.day))
    if not 18 <= age < to_age:
        return None
    return (issued.isoformat(), age, "Yes" if smoker[1].lower() == "smoker" else "No", to_age,
            int(lump), base, paid - base, paid, ref[1], hashlib.sha256(illustration).hexdigest(),
            hashlib.sha256(comparison).hexdigest())


if __name__ == "__main__":
    extract_pairs("Aviva Life Insurance+", FIELDS, read_pair, __doc__)
