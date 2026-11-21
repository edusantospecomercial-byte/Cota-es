import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
const catalog = JSON.parse(readFileSync(join(dataDir, "models.json"), "utf8"));
const lines = readFileSync(
  join(dataDir, "illustration-validation-2026-11-19.csv"),
  "utf8",
).trim().split(/\r?\n/);
const columns = lines.shift().split(",");
const rows = lines.map((line) => {
  const values = line.split(",");
  return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
});

const families = [
  {
    name: "life",
    model: catalog.models.life_only,
    filter: (row) =>
      Number(row.life_component) > 0 &&
      Number(row.critical_illness_component) === 0 &&
      !/discounted|multipolicy/i.test(row.product),
    comparablePremium: (row) =>
      Number(row.base_life_monthly) || Number(row.total_monthly),
  },
  {
    name: "standardCombined",
    model: catalog.models["life_plus_standalone_ci:standard_core_ci"],
    filter: (row) =>
      Number(row.life_component) > 0 &&
      Number(row.critical_illness_component) > 0 &&
      !/enhanced|upgraded|extra|child|discounted|multipolicy/i.test(row.product),
    comparablePremium: (row) =>
      Number(row.base_life_monthly) + Number(row.base_ci_monthly) ||
      Number(row.total_monthly),
  },
];

const report = {};
const failures = [];
for (const family of families) {
  const expectedByKey = new Map();
  for (const row of rows.filter(family.filter)) {
    const key = [
      row.age,
      row.to_age,
      row.life_component,
      row.critical_illness_component,
      row.smoker === "true" ? 1 : 0,
    ].join("|");
    const premium = family.comparablePremium(row);
    const previous = expectedByKey.get(key);
    if (!previous || premium < previous.premium)
      expectedByKey.set(key, { premium, provider: row.provider, product: row.product });
  }

  const comparisons = [...expectedByKey].map(([key, expected]) => {
    const actual = Number(family.model.lookup?.[key]);
    const overestimate = (actual - expected.premium) / expected.premium;
    return { key, expected: expected.premium, actual, overestimate, ...expected };
  });
  const outsideTolerance = comparisons.filter(
    (comparison) =>
      !Number.isFinite(comparison.actual) || comparison.overestimate > 0.2,
  );
  const worst = [...comparisons].sort(
    (a, b) => b.overestimate - a.overestimate,
  )[0];
  report[family.name] = {
    keysCompared: comparisons.length,
    within20: comparisons.length - outsideTolerance.length,
    maxOverestimate: Number(worst.overestimate.toFixed(4)),
    worstKey: worst.key,
  };
  if (outsideTolerance.length)
    failures.push({ family: family.name, outsideTolerance });
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, report }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  method: "direct lookup overestimate versus minimum comparable non-discounted archive premium",
  tolerance: 0.2,
  report,
}, null, 2));
