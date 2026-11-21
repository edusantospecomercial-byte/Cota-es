import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
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

const latestBySex = new Map();
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
  const previous = latestBySex.get(key);
  if (
    !previous ||
    row.sourceDate > previous.sourceDate ||
    (row.sourceDate === previous.sourceDate &&
      Number(row.modelId) > Number(previous.modelId))
  )
    latestBySex.set(key, row);
}

const paired = new Map();
for (const row of latestBySex.values()) {
  const key = [
    row.provider,
    row.smoker,
    row.age,
    row.toAge,
    row.life,
    row.ci,
  ].join("|");
  const pair = paired.get(key) || {};
  pair[row.sex] = row;
  paired.set(key, pair);
}
const differences = [...paired.values()]
  .filter((pair) => pair.F && pair.M)
  .map((pair) =>
    Math.abs(pair.M.premium - pair.F.premium) /
    ((pair.M.premium + pair.F.premium) / 2),
  );
const metrics = {
  matchedProviderAnchors: differences.length,
  meanSymmetricDifference: Number(
    (
      differences.reduce((sum, value) => sum + value, 0) / differences.length
    ).toFixed(4),
  ),
  maximumSymmetricDifference: Number(Math.max(...differences).toFixed(4)),
  within10: Number(
    (
      differences.filter((value) => value <= 0.1).length / differences.length
    ).toFixed(4),
  ),
};

if (
  metrics.matchedProviderAnchors < 50 ||
  metrics.meanSymmetricDifference > 0.05 ||
  metrics.maximumSymmetricDifference > 0.15 ||
  metrics.within10 < 0.95
)
  throw new Error(
    JSON.stringify({ issue: "sex-neutral input sensitivity regression", metrics }, null, 2),
  );

const catalog = JSON.parse(readFileSync(join(here, "../data/models.json"), "utf8"));
const published = catalog.audit?.priorityProviderSexSensitivity;
if (JSON.stringify(published) !== JSON.stringify(metrics))
  throw new Error(
    JSON.stringify(
      {
        issue: "published sex-sensitivity metrics are stale",
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
      method: "latest matched female-versus-male official anchors",
      ...metrics,
    },
    null,
    2,
  ),
);
