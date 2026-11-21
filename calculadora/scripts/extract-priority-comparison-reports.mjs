import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const roots = [
  join(homedir(), "Desktop"),
  join(homedir(), "Downloads"),
  join(homedir(), "Documents", "Codex"),
].filter(existsSync);

function pdfText(file) {
  return execFileSync("pdftotext", ["-layout", file, "-"], {
    encoding: "utf8",
    maxBuffer: 8_000_000,
  });
}

function ageOnDate(birth, requested) {
  let age = requested.year - birth.year;
  if (
    requested.month < birth.month ||
    (requested.month === birth.month && requested.day < birth.day)
  )
    age -= 1;
  return age;
}

function parseDate(match) {
  return match
    ? { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) }
    : null;
}

function premium(text, pattern) {
  const value = text.match(pattern)?.[1];
  return value == null ? null : Number(value.replaceAll(",", ""));
}

function amount(value) {
  return value == null ? NaN : Number(value.replaceAll(",", ""));
}

function benefitAmounts(text) {
  const combined = text.match(
    /£\s*([\d,]+)\s+life\s*&\s*£\s*([\d,]+)\s+(?:life or earlier )?critical illness cover/i,
  );
  const lifeOnly = text.match(/£\s*([\d,]+)\s+life cover/i);
  return {
    life: amount(combined?.[1] || lifeOnly?.[1]),
    ci: combined ? amount(combined[2]) : 0,
  };
}

if (process.argv.includes("--self-test")) {
  const cases = [
    ["£100,000 life cover", 100000, 0],
    ["£100000 life & £10000 critical illness cover", 100000, 10000],
    ["£200,000 life & £20,000 life or earlier critical illness cover", 200000, 20000],
  ];
  for (const [text, life, ci] of cases) {
    const parsed = benefitAmounts(text);
    if (parsed.life !== life || parsed.ci !== ci)
      throw new Error(JSON.stringify({ text, expected: { life, ci }, parsed }));
  }
  console.log(JSON.stringify({ ok: true, benefitSummaryCases: cases.length }));
  process.exit(0);
}

function parseReport(file) {
  const text = pdfText(file);
  const reference = text.match(/Your Reference:\s*(\d+)/)?.[1];
  const requested = parseDate(
    text.match(/Date Requested:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i),
  );
  const birth = parseDate(
    text.match(/born on\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i),
  );
  const sex = text.match(/Client:\s+.*?\ba (Female|Male)\b/i)?.[1]?.[0]?.toUpperCase();
  const smoker = /\bnon-smoker\b/i.test(text)
    ? "No"
    : /\ba (?:Female|Male) smoker\b/i.test(text)
      ? "Yes"
      : null;
  const toAge = Number(text.match(/policy duration is to age\s*(\d+)/i)?.[1]);
  const { life, ci } = benefitAmounts(text);
  const missing = [
    ["reference", reference],
    ["requested", requested],
    ["birth", birth],
    ["sex", sex],
    ["smoker", smoker],
    ["toAge", Number.isFinite(toAge) ? toAge : null],
    ["life", Number.isFinite(life) && life > 0 ? life : null],
  ]
    .filter(([, value]) => value == null)
    .map(([field]) => field);
  if (missing.length)
    return { status: "ambiguous", reference, missing, file };

  const patterns = ci
    ? {
        "Legal & General": /^\s*Legal & General Life \+ CI \(Standard\)\s+£([\d.]+)/m,
        Zurich: /^\s*Zurich Life & CI\s+£([\d.]+)/m,
        Aviva: /^\s*Aviva Multi-Product with Core CI\s+£([\d.]+)/m,
      }
    : {
        "Legal & General": /^\s*Legal & General Life\s+£([\d.]+)/m,
        Zurich: /^\s*Zurich Life\s+£([\d.]+)/m,
        Aviva: /^\s*Aviva Life Insurance\+\s+£([\d.]+)/m,
      };
  const prices = Object.fromEntries(
    Object.entries(patterns).map(([provider, pattern]) => [
      provider,
      premium(text, pattern),
    ]),
  );
  const available = Object.values(prices).filter(Number.isFinite).length;
  return {
    status: available === 3 ? "complete" : available ? "partial" : "no-prices",
    sourceDate: `${requested.year}-${String(requested.month).padStart(2, "0")}-${String(requested.day).padStart(2, "0")}`,
    reference,
    age: ageOnDate(birth, requested),
    sex,
    smoker,
    toAge,
    life,
    ci,
    prices,
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
    file,
  };
}

const files = execFileSync(
  "find",
  [...roots, "-type", "f", "-iname", "Comparison Report - without commission.pdf", "-print0"],
  { encoding: "utf8", maxBuffer: 50_000_000 },
)
  .split("\0")
  .filter(Boolean);
const parsed = files.map((file) => {
  try {
    return parseReport(file);
  } catch {
    return { status: "unreadable", file };
  }
});
const referenceGroups = new Map();
for (const row of parsed) {
  if (!row.reference) continue;
  const group = referenceGroups.get(row.reference) || [];
  group.push(row);
  referenceGroups.set(row.reference, group);
}
const statusRank = { complete: 3, partial: 2, "no-prices": 1 };
function preferCandidate(candidate, previous) {
  const rankDifference =
    (statusRank[candidate.status] || 0) - (statusRank[previous.status] || 0);
  if (rankDifference) return rankDifference > 0;
  if ((candidate.sourceDate || "") !== (previous.sourceDate || ""))
    return (candidate.sourceDate || "") > (previous.sourceDate || "");
  return (candidate.sha256 || "") < (previous.sha256 || "");
}
const byReference = new Map();
for (const row of parsed) {
  if (!row.reference) continue;
  const previous = byReference.get(row.reference);
  if (!previous || preferCandidate(row, previous))
    byReference.set(row.reference, row);
}
const unique = [...byReference.values()];
const duplicateGroups = [...referenceGroups.values()].filter(
  (group) => group.length > 1,
);
function materialFingerprint(row) {
  return JSON.stringify({
    status: row.status,
    sourceDate: row.sourceDate,
    age: row.age,
    sex: row.sex,
    smoker: row.smoker,
    toAge: row.toAge,
    life: row.life,
    ci: row.ci,
    prices: row.prices,
    missing: row.missing,
  });
}
const materiallyConflictingDuplicates = duplicateGroups.filter(
  (group) => new Set(group.map(materialFingerprint)).size > 1,
);
const summary = {
  files: files.length,
  uniqueReferences: unique.length,
  duplicateFiles: files.length - referenceGroups.size,
  duplicateReferences: duplicateGroups.length,
  duplicateReferencesWithDifferentHashes: duplicateGroups.filter(
    (group) => new Set(group.map((row) => row.sha256).filter(Boolean)).size > 1,
  ).length,
  duplicateReferencesWithDifferentDates: duplicateGroups.filter(
    (group) =>
      new Set(group.map((row) => row.sourceDate).filter(Boolean)).size > 1,
  ).length,
  duplicateReferencesWithDifferentMaterialData:
    materiallyConflictingDuplicates.length,
  complete: unique.filter((row) => row.status === "complete").length,
  partial: unique.filter((row) => row.status === "partial").length,
  noPrices: unique.filter((row) => row.status === "no-prices").length,
  ambiguousOrUnreadable: parsed.filter((row) =>
    ["ambiguous", "unreadable"].includes(row.status),
  ).length,
  completeLife: unique.filter((row) => row.status === "complete" && row.ci === 0)
    .length,
  completeCombined: unique.filter((row) => row.status === "complete" && row.ci > 0)
    .length,
  completeSmoker: unique.filter(
    (row) => row.status === "complete" && row.smoker === "Yes",
  ).length,
};

if (
  materiallyConflictingDuplicates.length &&
  (process.argv.includes("--csv") || process.argv.includes("--partial-csv"))
) {
  throw new Error(
    `Conflicting duplicate comparison references: ${materiallyConflictingDuplicates
      .map((group) => group[0].reference)
      .join(", ")}`,
  );
}

if (process.argv.includes("--partial-csv")) {
  console.log(
    "source_date,model_id,profile,age,sex,smoker,to_age,life_cover,critical_illness_cover,missing_provider,reason,zurich_premium,aviva_premium,notes",
  );
  const latest = new Map();
  for (const row of unique.filter(
    (candidate) =>
      candidate.status === "partial" &&
      Number.isFinite(candidate.prices.Zurich) &&
      Number.isFinite(candidate.prices.Aviva),
  )) {
    const key = [row.age, row.smoker, row.toAge, row.life, row.ci].join("|");
    const previous = latest.get(key);
    if (
      !previous ||
      row.sourceDate > previous.sourceDate ||
      (row.sourceDate === previous.sourceDate &&
        Number(row.reference) > Number(previous.reference))
    )
      latest.set(key, row);
  }
  for (const row of [...latest.values()].sort(
    (left, right) => Number(left.reference) - Number(right.reference),
  )) {
    console.log(
      [
        row.sourceDate,
        row.reference,
        "Comparison Report Archive",
        row.age,
        row.sex,
        row.smoker,
        row.toAge,
        row.life,
        row.ci,
        "Legal & General",
        "Provider did not return a quote",
        row.prices.Zurich.toFixed(2),
        row.prices.Aviva.toFixed(2),
        `Official partial comparison report ref ${row.reference} sha256 ${row.sha256}`,
      ].join(","),
    );
  }
} else if (process.argv.includes("--csv")) {
  console.log(
    "source_date,model_id,profile,age,sex,smoker,to_age,life_cover,critical_illness_cover,provider,product,monthly_premium,available,notes",
  );
  const products = {
    "Legal & General": (ci) =>
      ci ? "Legal & General Life + CI (Standard)" : "Legal & General Life",
    Zurich: (ci) => (ci ? "Zurich Life & CI" : "Zurich Life"),
    Aviva: (ci) =>
      ci ? "Aviva Multi-Product with Core CI" : "Aviva Life Insurance+",
  };
  const currentReferences = new Set(
    readFileSync(
      join(here, "../data/solutionbuilder-priority-providers-2026-11-20.csv"),
      "utf8",
    ).match(/\b\d{10}\b/g) || [],
  );
  for (const row of unique
    .filter(
      (candidate) =>
        candidate.status === "complete" &&
        !currentReferences.has(candidate.reference),
    )
    .sort((left, right) => Number(left.reference) - Number(right.reference))) {
    for (const provider of ["Legal & General", "Zurich", "Aviva"]) {
      console.log(
        [
          row.sourceDate,
          row.reference,
          "Comparison Report Archive",
          row.age,
          row.sex,
          row.smoker,
          row.toAge,
          row.life,
          row.ci,
          provider,
          products[provider](row.ci),
          row.prices[provider].toFixed(2),
          "true",
          `Official comparison report ref ${row.reference} sha256 ${row.sha256}`,
        ].join(","),
      );
    }
  }
} else if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, reports: unique }, null, 2));
} else {
  console.log(JSON.stringify(summary, null, 2));
}
