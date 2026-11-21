import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(scriptDir, "../data/models.json"), "utf8"),
);
const rows = readFileSync(
  join(scriptDir, "../data/solutionbuilder-priority-providers-2026-11-20.csv"),
  "utf8",
)
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [sourceDate, modelId, profile, age, sex, smoker, toAge, life, ci, provider, product, premium, available] = line.split(",");
    return {
      sourceDate,
      modelId,
      profile,
      age: Number(age),
      sex,
      smoker,
      toAge: Number(toAge),
      life: Number(life),
      ci: Number(ci),
      provider,
      product,
      premium: Number(premium),
      available,
    };
  })
  .filter((row) => row.available === "true" && Number.isFinite(row.premium));

function interpolate1d(points, target, axis, maxGap = Infinity) {
  const sorted = [...points].sort((a, b) => a[axis] - b[axis]);
  const exact = sorted.find((row) => row[axis] === target);
  if (exact) return exact;
  const below = sorted.filter((row) => row[axis] < target).at(-1);
  const above = sorted.find((row) => row[axis] > target);
  if (!below || !above || above[axis] - below[axis] > maxGap) return null;
  const ratio = (target - below[axis]) / (above[axis] - below[axis]);
  return {
    premium:
      axis === "life"
        ? below.premium + (above.premium - below.premium) * ratio
        : Math.exp(
            Math.log(below.premium) +
              (Math.log(above.premium) - Math.log(below.premium)) * ratio,
          ),
    age: axis === "age" ? target : below.age,
    life: axis === "life" ? target : below.life,
    toAge: axis === "toAge" ? target : below.toAge,
  };
}

function estimate(pool, target) {
  const comparable = pool.filter(
    (row) =>
      row.provider === target.provider &&
      row.smoker === target.smoker &&
      row.ci === target.ci,
  );
  const byTerm = [...new Set(comparable.map((row) => row.toAge))]
    .map((toAge) => {
      const atTerm = comparable.filter((row) => row.toAge === toAge);
      const byAge = [...new Set(atTerm.map((row) => row.age))]
        .map((age) => {
          const atAge = atTerm.filter((row) => row.age === age);
          const value = interpolate1d(atAge, target.life, "life");
          return value ? { ...value, age, toAge } : null;
        })
        .filter(Boolean);
      const value = interpolate1d(byAge, target.age, "age", 10);
      return value ? { ...value, toAge } : null;
    })
    .filter(Boolean);
  return interpolate1d(byTerm, target.toAge, "toAge", 10)?.premium ?? null;
}

const latest = new Map();
for (const row of rows) {
  const key = [row.provider, row.smoker, row.age, row.toAge, row.life, row.ci].join("|");
  const previous = latest.get(key);
  if (!previous || Number(row.modelId) > Number(previous.modelId)) latest.set(key, row);
}
const anchors = [...latest.values()];
const results = [];
for (let index = 0; index < anchors.length; index += 1) {
  const actual = anchors[index];
  const predicted = estimate(anchors.filter((_, candidate) => candidate !== index), actual);
  if (predicted == null) continue;
  const ape = Math.abs(predicted - actual.premium) / actual.premium;
  results.push({ ...actual, predicted, ape });
}

const byProvider = Object.fromEntries(
  ["Legal & General", "Zurich", "Aviva"].map((provider) => {
    const values = results.filter((row) => row.provider === provider);
    const mape = values.reduce((sum, row) => sum + row.ape, 0) / values.length;
    const within20 = values.filter((row) => row.ape <= 0.2).length / values.length;
    return [provider, { tested: values.length, mape, within20 }];
  }),
);
function summarize(values) {
  if (!values.length) return { tested: 0, mape: null, within20: null };
  return {
    tested: values.length,
    mape: values.reduce((sum, row) => sum + row.ape, 0) / values.length,
    within20: values.filter((row) => row.ape <= 0.2).length / values.length,
  };
}
const bySegment = Object.fromEntries(
  [
    ["nonSmokerLife", (row) => row.smoker === "No" && row.ci === 0],
    ["nonSmokerCI", (row) => row.smoker === "No" && row.ci > 0],
    ["smokerLife", (row) => row.smoker === "Yes" && row.ci === 0],
    ["smokerCI", (row) => row.smoker === "Yes" && row.ci > 0],
  ].map(([name, predicate]) => [name, summarize(results.filter(predicate))]),
);
const overallMape = results.reduce((sum, row) => sum + row.ape, 0) / results.length;
const overallWithin20 = results.filter((row) => row.ape <= 0.2).length / results.length;
const worstCases = [...results]
  .sort((a, b) => b.ape - a.ape)
  .slice(0, 5)
  .map((row) => ({
    provider: row.provider,
    smoker: row.smoker,
    age: row.age,
    toAge: row.toAge,
    life: row.life,
    ci: row.ci,
    actual: row.premium,
    predicted: Number(row.predicted.toFixed(2)),
    ape: Number(row.ape.toFixed(4)),
  }));

if (results.length < 90 || overallMape > 0.13 || overallWithin20 < 0.8) {
  throw new Error(JSON.stringify({ results: results.length, overallMape, overallWithin20, byProvider }, null, 2));
}

const published = catalog.audit?.priorityProviderCrossValidation;
if (
  published?.tested !== results.length ||
  Math.abs(published?.mape - Number(overallMape.toFixed(4))) > 0.00001 ||
  Math.abs(published?.within20 - Number(overallWithin20.toFixed(4))) > 0.00001 ||
  Object.entries(bySegment).some(([segment, metrics]) => {
    const saved = published?.bySegment?.[segment];
    return saved?.tested !== metrics.tested ||
      (metrics.mape == null
        ? saved?.mape !== null
        : Math.abs(saved?.mape - Number(metrics.mape.toFixed(4))) > 0.00001) ||
      (metrics.within20 == null
        ? saved?.within20 !== null
        : Math.abs(saved?.within20 - Number(metrics.within20.toFixed(4))) > 0.00001);
  })
) {
  throw new Error(JSON.stringify({
    issue: "published cross-validation metrics are stale",
    published,
    calculated: {
      tested: results.length,
      mape: Number(overallMape.toFixed(4)),
      within20: Number(overallWithin20.toFixed(4)),
    },
  }, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  method: "leave-one-anchor-out trilinear interpolation",
  tested: results.length,
  overallMape: Number(overallMape.toFixed(4)),
  overallWithin20: Number(overallWithin20.toFixed(4)),
  worstCases,
  byProvider: Object.fromEntries(Object.entries(byProvider).map(([provider, metrics]) => [provider, {
    tested: metrics.tested,
    mape: Number(metrics.mape.toFixed(4)),
    within20: Number(metrics.within20.toFixed(4)),
  }])),
  bySegment: Object.fromEntries(Object.entries(bySegment).map(([segment, metrics]) => [segment, {
    tested: metrics.tested,
    mape: metrics.mape == null ? null : Number(metrics.mape.toFixed(4)),
    within20: metrics.within20 == null ? null : Number(metrics.within20.toFixed(4)),
  }])),
}, null, 2));
