"""Match Legal & General life illustrations to the term and waiver actually offered."""

from datetime import datetime
from decimal import Decimal
import hashlib
import re
import subprocess

from illustration_pairs import extract_pairs

FIELDS = ("source_date", "age", "smoker", "to_age", "life_cover", "base_monthly", "waiver_monthly",
          "policy_monthly", "reference", "term_years", "reported_tpd", "sha256", "comparison_sha256")
DATE = r"(\d{2}/\d{2}/\d{4})"
AMOUNT = r"£([\d,]+)"
MONEY = r"£([\d,]+\.\d{2})"


def layout(data):
    return subprocess.check_output(["pdftotext", "-layout", "-", "-"], input=data).decode("utf8")


def number(value):
    return Decimal(value.replace(",", ""))


def read_pair(illustration, comparison, tpd_column="None", offered_life=None):
    first = layout(illustration).partition("\f")[0]
    report, _, results = layout(comparison).partition("\f")
    if "Life Insurance Quotation" not in first or "Non Underwritten Results" not in results:
        return None
    birth = re.findall(r"Date of Birth:\s*" + DATE + r"[ \t]+(Non Smoker|Smoker)\*", first)
    issued = re.search(r"Quote Date:\s*" + DATE, first)
    amount = re.search(r"^\s*Life Cover:\s*" + AMOUNT + r"\s*$", first, re.M)
    term = re.search(r"Length of the Policy:\s*(\d+) years?\b", first)
    total = re.search(r"Your Guaranteed Premium of\s*" + MONEY + r"\s+Payable: monthly", first)
    if len(birth) != 1 or not all((issued, amount, term, total)):
        return None
    benefit_lines = re.findall(r"^[ \t]*•[ \t]+([^\n]+(?:\n[ \t]{6,}[^\s•][^\n]*)*)", report, re.M)
    benefit = re.fullmatch(r"Level Term Assurance: 1st life, " + AMOUNT +
                           r" life cover, policy duration is to age (\d+), premiums are guaranteed",
                           " ".join(benefit_lines[0].split())) if len(benefit_lines) == 1 else None
    client = re.search(r"^Client:.*?\ba (?:Male|Female) (smoker|non-smoker)(?: who has never smoked)?, born on " + DATE, report, re.M | re.I)
    date = re.search(r"Date Requested:\s*" + DATE, report)
    ref = re.search(r"Your Reference:\s*(\d+)", report)
    if not all((benefit, client, date, ref)) or date[1] != issued[1] or birth[0][0] != client[2]:
        return None
    smoker = birth[0][1] == "Smoker"
    expected_life = number(benefit[1]) if offered_life is None else Decimal(offered_life)
    if smoker != (client[1].lower() == "smoker") or number(amount[1]) != expected_life:
        return None
    offers = set(re.findall(r"^[ \t]*Legal & General Life[ \t]{2,}([^\n]+)",
                            results.partition("Products Not Quoting:")[0], re.M))
    if len(offers) != 1:
        return None
    offer = re.fullmatch(MONEY + r"\s+Guaranteed\s+No\s+Monthly\s+" + AMOUNT +
                         r"\s+(\d+) years?\s+Level\s+(?:(Expiry)\s+)?" + re.escape(tpd_column) +
                         r"\s+No", offers.pop().strip())
    if not offer or number(offer[1]) != number(total[1]) or number(offer[2]) != number(amount[1]) or offer[3] != term[1]:
        return None
    optional = re.findall(r"•\s+Waiver of Premium for [^\n]+? is included at " + MONEY + r" monthly", first)
    if len(optional) != int(bool(offer[4])) or ("Waiver of Premium" in first) != bool(optional):
        return None
    # If a new priced rider appears, do not attribute its charge to the life component.
    bullets = re.findall(r"^[ \t]*•[ \t]*([^\n]+)", first, re.M)
    allowed = ("Life Cover of ", "The life cover will be payable", "Terminal illness cover of ",
               "Waiver of Premium for ", "Guaranteed Insurability Option")
    if any(not b.startswith(allowed) for b in bullets) or any(
            "no extra cost" not in b for b in bullets if b.startswith(("Terminal illness", "Guaranteed Insurability"))):
        return None
    quoted, born = [datetime.strptime(s, "%d/%m/%Y").date() for s in (date[1], birth[0][0])]
    age = quoted.year - born.year - ((quoted.month, quoted.day) < (born.month, born.day))
    duration, end = int(term[1]), int(benefit[2])
    premium, waiver = number(total[1]), number(optional[0]) if optional else Decimal("0.00")
    if duration not in (end-age-1, end-age) or not 18 <= age < end or not 0 <= waiver < premium:
        return None
    return (quoted.isoformat(), age, "Yes" if smoker else "No", end, int(number(amount[1])), premium-waiver,
            waiver, premium, ref[1], duration, hashlib.sha256(illustration).hexdigest(), hashlib.sha256(comparison).hexdigest())


def read_printed_terms(illustration, comparison):
    for basis in ("None", "Own"):
        row = read_pair(illustration, comparison, tpd_column=basis)
        if row:
            return (*row[:-2], basis, *row[-2:])
    return None


if __name__ == "__main__":
    extract_pairs("Legal & General Life", FIELDS, read_printed_terms, __doc__)
