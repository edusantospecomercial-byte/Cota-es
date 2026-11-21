import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = [
  "solutionbuilder-priority-providers-2026-11-20.csv",
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
];
const first = readFileSync(join(here, `../data/${files[0]}`), "utf8")
  .trim()
  .split(/\r?\n/);
const columns = first.shift().split(",");
const lines = [
  ...first,
  ...readFileSync(join(here, `../data/${files[1]}`), "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1),
];
const rawRows = lines.map((line) => {
  const row = Object.fromEntries(columns.map((column, index) => [column, line.split(",")[index]]));
  return {
    provider: row.provider,
    smoker: row.smoker,
    age: Number(row.age),
    toAge: Number(row.to_age),
    life: Number(row.life_cover),
    ci: Number(row.critical_illness_cover),
    premium: Number(row.monthly_premium),
    modelId: Number(row.model_id),
    sourceDate: row.source_date,
    available: row.available,
  };
}).filter((row) => row.available === "true" && Number.isFinite(row.premium));

const latest = new Map();
for (const row of rawRows) {
  const key = [row.provider, row.smoker, row.age, row.toAge, row.life, row.ci].join("|");
  const previous = latest.get(key);
  if (
    !previous ||
    row.sourceDate > previous.sourceDate ||
    (row.sourceDate === previous.sourceDate && row.modelId > previous.modelId)
  )
    latest.set(key, row);
}
const rows = [...latest.values()];

function interpolate(points, target, axis, maxGap = Infinity, logarithmic = false) {
  const sorted = [...points].sort((a, b) => a[axis] - b[axis]);
  const exact = sorted.find((row) => row[axis] === target);
  if (exact) return exact;
  const below = sorted.filter((row) => row[axis] < target).at(-1);
  const above = sorted.find((row) => row[axis] > target);
  if (!below || !above || above[axis] - below[axis] > maxGap) return null;
  const ratio = (target - below[axis]) / (above[axis] - below[axis]);
  const premium = logarithmic
    ? Math.exp(Math.log(below.premium) + (Math.log(above.premium) - Math.log(below.premium)) * ratio)
    : below.premium + (above.premium - below.premium) * ratio;
  return { premium, [axis]: target };
}

function estimate(provider, target) {
  const candidates = rows.filter((row) =>
    row.provider === provider && row.smoker === target.smoker && row.ci === target.ci
  );
  const terms = [...new Set(candidates.map((row) => row.toAge))].map((toAge) => {
    const atTerm = candidates.filter((row) => row.toAge === toAge);
    const ages = [...new Set(atTerm.map((row) => row.age))].map((age) => {
      const value = interpolate(atTerm.filter((row) => row.age === age), target.life, "life");
      return value ? { ...value, age, toAge } : null;
    }).filter(Boolean);
    const value = interpolate(ages, target.age, "age", 10, true);
    return value ? { ...value, toAge } : null;
  }).filter(Boolean);
  return interpolate(terms, target.toAge, "toAge", 10, true)?.premium ?? null;
}

const providers = ["Legal & General", "Zurich", "Aviva"];
const scenarios = [];
for (const smoker of ["No", "Yes"])
  for (const ci of [0, 10000, 20000])
    for (let age = 25; age <= 63; age += 1)
      for (const toAge of [65, 70, 75, 85]) {
        if (toAge <= age) continue;
        for (const life of [20000, 30000, 50000, 100000, 150000, 200000]) {
          const quotes = providers.map((provider) => estimate(provider, { smoker, ci, age, toAge, life }));
          scenarios.push({ smoker, ci, age, toAge, life, complete: quotes.every((quote) => quote != null) });
        }
      }

const report = {};
for (const smoker of ["No", "Yes"])
  for (const ci of [0, 10000, 20000]) {
    const group = scenarios.filter((row) => row.smoker === smoker && row.ci === ci);
    const complete = group.filter((row) => row.complete).length;
    report[`${smoker === "Yes" ? "smoker" : "nonSmoker"}_ci${ci}`] = {
      complete,
      total: group.length,
      coverage: Number((complete / group.length).toFixed(4)),
    };
  }

const strategicMissing = scenarios
  .filter((row) => !row.complete)
  .sort((a, b) =>
    Number(a.smoker === "Yes") - Number(b.smoker === "Yes") ||
    a.ci - b.ci ||
    Math.abs(a.age - 45) - Math.abs(b.age - 45) ||
    a.toAge - b.toAge ||
    a.life - b.life
  )
  .slice(0, 24);

console.log(JSON.stringify({
  grid: "ages 25-63; to ages 65/70/75/85; life 20k/30k/50k/100k/150k/200k; CI 0/10k/20k",
  anchors: rows.length,
  report,
  strategicMissing,
}, null, 2));
