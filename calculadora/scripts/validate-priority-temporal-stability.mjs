import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const reportOnly = process.argv.includes("--report-only");
const files = [
  "solutionbuilder-priority-providers-2026-11-20.csv",
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
];
const rows = files.flatMap((file) => {
  const [header, ...lines] = readFileSync(join(here, `../data/${file}`), "utf8")
    .trim()
    .split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => {
    const row = Object.fromEntries(
      line.split(",").map((value, index) => [columns[index], value]),
    );
    return {
      sourceDate: row.source_date,
      modelId: row.model_id,
      provider: row.provider,
      sex: row.sex,
      smoker: row.smoker,
      age: Number(row.age),
      toAge: Number(row.to_age),
      life: Number(row.life_cover),
      ci: Number(row.critical_illness_cover),
      premium: Number(row.monthly_premium),
    };
  });
});

const groups = new Map();
for (const row of rows) {
  const key = [
    row.provider,
    row.sex,
    row.smoker,
    row.age,
    row.toAge,
    row.life,
    row.ci,
  ].join("|");
  const group = groups.get(key) || [];
  group.push(row);
  groups.set(key, group);
}

const comparisons = [...groups.values()]
  .filter((group) => new Set(group.map((row) => row.modelId)).size > 1)
  .map((group) => {
    group.sort(
      (left, right) =>
        left.sourceDate.localeCompare(right.sourceDate) ||
        Number(left.modelId) - Number(right.modelId),
    );
    const first = group[0];
    const latest = group.at(-1);
    return {
      ...latest,
      firstDate: first.sourceDate,
      firstPremium: first.premium,
      absolutePercentageChange:
        Math.abs(latest.premium - first.premium) / first.premium,
    };
  });

function summarize(values) {
  const meanAbsolutePercentageChange =
    values.reduce((sum, row) => sum + row.absolutePercentageChange, 0) /
    values.length;
  const within10 =
    values.filter((row) => row.absolutePercentageChange <= 0.1).length /
    values.length;
  const within20 =
    values.filter((row) => row.absolutePercentageChange <= 0.2).length /
    values.length;
  return {
    repeatedAnchors: values.length,
    meanAbsolutePercentageChange: Number(
      meanAbsolutePercentageChange.toFixed(4),
    ),
    within10: Number(within10.toFixed(4)),
    within20: Number(within20.toFixed(4)),
  };
}
const metrics = {
  ...summarize(comparisons),
  byProvider: Object.fromEntries(
    ["Legal & General", "Zurich", "Aviva"].map((provider) => [
      provider,
      summarize(comparisons.filter((row) => row.provider === provider)),
    ]),
  ),
};

if (
  comparisons.length < 100 ||
  metrics.meanAbsolutePercentageChange > 0.05 ||
  metrics.within10 < 0.9 ||
  metrics.within20 < 0.98 ||
  Object.values(metrics.byProvider).some(
    (provider) =>
      provider.repeatedAnchors < 30 ||
      provider.meanAbsolutePercentageChange > 0.06 ||
      provider.within10 < 0.85 ||
      provider.within20 < 0.95,
  )
)
  throw new Error(
    JSON.stringify({ issue: "priority price stability regression", metrics }, null, 2),
  );

const catalog = JSON.parse(readFileSync(join(here, "../data/models.json"), "utf8"));
const published = catalog.audit?.priorityProviderTemporalStability;
if (!reportOnly && JSON.stringify(published) !== JSON.stringify(metrics))
  throw new Error(
    JSON.stringify(
      {
        issue: "published temporal stability metrics are stale",
        published,
        calculated: metrics,
      },
      null,
      2,
    ),
  );

console.log(
  JSON.stringify(
    {
      ok: true,
      method: "earliest-versus-latest repeated official anchor",
      ...metrics,
    },
    null,
    2,
  ),
);
