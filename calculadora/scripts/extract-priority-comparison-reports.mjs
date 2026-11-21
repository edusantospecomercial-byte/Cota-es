import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const roots = [
  "/Users/eduardosantos/Desktop",
  "/Users/eduardosantos/Downloads",
  "/Users/eduardosantos/Documents/Codex",
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
  return value == null ? null : Number(value);
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
  const combined = text.match(
    /£\s*(\d+)\s+life\s*&\s*£\s*(\d+)\s+life or earlier critical illness cover/i,
  );
  const lifeOnly = text.match(/£\s*(\d+)\s+life cover/i);
  const life = Number(combined?.[1] || lifeOnly?.[1]);
  const ci = Number(combined?.[2] || 0);
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
const byReference = new Map();
for (const row of parsed) {
  if (!row.reference) continue;
  const previous = byReference.get(row.reference);
  if (!previous || row.status === "complete") byReference.set(row.reference, row);
}
const unique = [...byReference.values()];
const summary = {
  files: files.length,
  uniqueReferences: unique.length,
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
