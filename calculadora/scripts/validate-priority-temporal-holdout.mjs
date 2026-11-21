import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "../data");
const cutoff = "2026-10-01";
const files = [
  "solutionbuilder-priority-providers-2026-11-20.csv",
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
];

const rows = files.flatMap((file) => {
  const [header, ...lines] = readFileSync(join(dataDir, file), "utf8").trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => {
    const row = Object.fromEntries(line.split(",").map((value, index) => [columns[index], value]));
    return {
      date: row.source_date,
      id: Number(row.model_id),
      provider: row.provider,
      smoker: row.smoker,
      age: Number(row.age),
      toAge: Number(row.to_age),
      life: Number(row.life_cover),
      ci: Number(row.critical_illness_cover),
      premium: Number(row.monthly_premium),
    };
  });
});

function latest(source) {
  const selected = new Map();
  for (const row of source) {
    const key = [row.provider, row.smoker, row.age, row.toAge, row.life, row.ci].join("|");
    const previous = selected.get(key);
    if (!previous || row.date > previous.date || (row.date === previous.date && row.id > previous.id))
      selected.set(key, row);
  }
  return [...selected.values()];
}

function interpolate(points, target, axis, maxGap = Infinity, logarithmic = false) {
  const sorted = [...points].sort((left, right) => left[axis] - right[axis]);
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

function estimate(pool, target) {
  const comparable = pool.filter((row) =>
    row.provider === target.provider && row.smoker === target.smoker && row.ci === target.ci
  );
  const terms = [...new Set(comparable.map((row) => row.toAge))].map((toAge) => {
    const atTerm = comparable.filter((row) => row.toAge === toAge);
    const ages = [...new Set(atTerm.map((row) => row.age))].map((age) => {
      const value = interpolate(atTerm.filter((row) => row.age === age), target.life, "life");
      return value ? { ...value, age, toAge } : null;
    }).filter(Boolean);
    const value = interpolate(ages, target.age, "age", 10, true);
    return value ? { ...value, toAge } : null;
  }).filter(Boolean);
  return interpolate(terms, target.toAge, "toAge", 10, true)?.premium ?? null;
}

function quantile(values, probability) {
  const index = (values.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

const training = latest(rows.filter((row) => row.date < cutoff));
const testing = latest(rows.filter((row) => row.date >= cutoff));
const errors = [];
for (const target of testing) {
  const pool = training.filter((row) => !(
    row.provider === target.provider && row.smoker === target.smoker && row.age === target.age &&
    row.toAge === target.toAge && row.life === target.life && row.ci === target.ci
  ));
  const predicted = estimate(pool, target);
  if (predicted != null) errors.push(Math.abs(predicted - target.premium) / target.premium);
}
errors.sort((left, right) => left - right);
const calculated = {
  cutoff,
  trainingAnchors: training.length,
  laterAnchors: testing.length,
  predicted: errors.length,
  mape: Number((errors.reduce((sum, value) => sum + value, 0) / errors.length).toFixed(4)),
  median: Number(quantile(errors, 0.5).toFixed(4)),
  p90: Number(quantile(errors, 0.9).toFixed(4)),
  p95: Number(quantile(errors, 0.95).toFixed(4)),
  within20: Number((errors.filter((value) => value <= 0.2).length / errors.length).toFixed(4)),
  maximum: Number(Math.max(...errors).toFixed(4)),
};

const catalog = JSON.parse(readFileSync(join(dataDir, "models.json"), "utf8"));
const published = catalog.audit?.priorityProviderTemporalHoldout;
const stale = Object.entries(calculated).some(([key, value]) => published?.[key] !== value);
if (stale || calculated.predicted < 100 || calculated.mape > 0.08 || calculated.p95 > 0.15 || calculated.within20 < 0.98 || calculated.maximum > 0.25) {
  console.error(JSON.stringify({ ok: false, stale, published, calculated }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, method: "forward temporal holdout", ...calculated }, null, 2));
