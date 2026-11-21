import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "../data");
const files = [
  "solutionbuilder-priority-providers-2026-11-20.csv",
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
];
const rows = files.flatMap((file) => {
  const [header, ...lines] = readFileSync(join(dataDir, file), "utf8")
    .trim()
    .split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => {
    const row = Object.fromEntries(
      line.split(",").map((value, index) => [columns[index], value]),
    );
    return {
      ...row,
      monthly_premium: Number(row.monthly_premium),
    };
  });
});

const latest = new Map();
for (const row of rows) {
  const key = [
    row.provider,
    row.sex,
    row.smoker,
    row.age,
    row.to_age,
    row.life_cover,
    row.critical_illness_cover,
  ].join("|");
  const previous = latest.get(key);
  if (
    !previous ||
    row.source_date > previous.source_date ||
    (row.source_date === previous.source_date &&
      Number(row.model_id) > Number(previous.model_id))
  )
    latest.set(key, row);
}

const groups = new Map();
for (const row of latest.values()) {
  const key = [
    row.sex,
    row.smoker,
    row.age,
    row.to_age,
    row.life_cover,
    row.critical_illness_cover,
  ].join("|");
  const group = groups.get(key) || [];
  group.push(row);
  groups.set(key, group);
}
const spreads = [...groups.values()]
  .filter((group) => new Set(group.map((row) => row.provider)).size === 3)
  .map((group) => {
    const premiums = group.map((row) => row.monthly_premium);
    const minimum = Math.min(...premiums);
    const maximum = Math.max(...premiums);
    return {
      relative: (maximum - minimum) / minimum,
      absolute: maximum - minimum,
    };
  });
function quantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
const relative = spreads.map((row) => row.relative);
const absolute = spreads.map((row) => row.absolute);
const metrics = {
  uniqueComparableScenarios: spreads.length,
  relativeMedian: Number(quantile(relative, 0.5).toFixed(4)),
  relativeP90: Number(quantile(relative, 0.9).toFixed(4)),
  relativeP95: Number(quantile(relative, 0.95).toFixed(4)),
  relativeMaximum: Number(Math.max(...relative).toFixed(4)),
  absoluteMedian: Number(quantile(absolute, 0.5).toFixed(2)),
  absoluteP95: Number(quantile(absolute, 0.95).toFixed(2)),
  absoluteMaximum: Number(Math.max(...absolute).toFixed(2)),
};
const failures = [];
if (metrics.uniqueComparableScenarios < 300)
  failures.push({ issue: "too few complete provider-spread scenarios" });
if (metrics.relativeP95 > 0.35)
  failures.push({ issue: "provider spread P95 exceeds 35%" });
if (metrics.relativeMaximum > 0.6)
  failures.push({ issue: "provider spread maximum exceeds 60%" });

const catalog = JSON.parse(readFileSync(join(dataDir, "models.json"), "utf8"));
const published = catalog.audit?.priorityProviderSpread;
if (JSON.stringify(published) !== JSON.stringify(metrics))
  failures.push({ issue: "published provider-spread audit is stale", published, metrics });

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, priorityProviderSpread: metrics }, null, 2));
