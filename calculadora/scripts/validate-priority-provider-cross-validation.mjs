import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportOnly = process.argv.includes("--report-only");
const catalog = JSON.parse(
  readFileSync(join(scriptDir, "../data/models.json"), "utf8"),
);
const priorityFiles = [
  "solutionbuilder-priority-providers-2026-11-20.csv",
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
];
const rows = priorityFiles
  .flatMap((file) =>
    readFileSync(join(scriptDir, `../data/${file}`), "utf8")
      .trim()
      .split(/\r?\n/)
      .slice(1),
  )
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
  if (
    !previous ||
    row.sourceDate > previous.sourceDate ||
    (row.sourceDate === previous.sourceDate &&
      Number(row.modelId) > Number(previous.modelId))
  )
    latest.set(key, row);
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

function quantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
function summarize(values) {
  if (!values.length)
    return {
      tested: 0,
      mape: null,
      within20: null,
      p90: null,
      p95: null,
      maximum: null,
      bias: null,
    };
  const errors = values.map((row) => row.ape);
  const signedErrors = values.map(
    (row) => (row.predicted - row.premium) / row.premium,
  );
  return {
    tested: values.length,
    mape: errors.reduce((sum, value) => sum + value, 0) / values.length,
    within20: values.filter((row) => row.ape <= 0.2).length / values.length,
    p90: quantile(errors, 0.9),
    p95: quantile(errors, 0.95),
    maximum: Math.max(...errors),
    bias:
      signedErrors.reduce((sum, value) => sum + value, 0) /
      signedErrors.length,
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
const byProvider = Object.fromEntries(
  ["Legal & General", "Zurich", "Aviva"].map((provider) => [
    provider,
    summarize(results.filter((row) => row.provider === provider)),
  ]),
);
const overallMape = results.reduce((sum, row) => sum + row.ape, 0) / results.length;
const overallWithin20 = results.filter((row) => row.ape <= 0.2).length / results.length;
const absolutePercentageErrors = results.map((row) => row.ape);
const errorDistribution = {
  median: Number(quantile(absolutePercentageErrors, 0.5).toFixed(4)),
  p90: Number(quantile(absolutePercentageErrors, 0.9).toFixed(4)),
  p95: Number(quantile(absolutePercentageErrors, 0.95).toFixed(4)),
  maximum: Number(Math.max(...absolutePercentageErrors).toFixed(4)),
};
const signedPercentageErrors = results.map(
  (row) => (row.predicted - row.premium) / row.premium,
);
const bias = {
  mean: Number(
    (
      signedPercentageErrors.reduce((sum, value) => sum + value, 0) /
      signedPercentageErrors.length
    ).toFixed(4),
  ),
  median: Number(quantile(signedPercentageErrors, 0.5).toFixed(4)),
  underestimates: Number(
    (
      signedPercentageErrors.filter((value) => value < 0).length /
      signedPercentageErrors.length
    ).toFixed(4),
  ),
  overestimates: Number(
    (
      signedPercentageErrors.filter((value) => value > 0).length /
      signedPercentageErrors.length
    ).toFixed(4),
  ),
};
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
if (!reportOnly && (
  published?.tested !== results.length ||
  Math.abs(published?.mape - Number(overallMape.toFixed(4))) > 0.00001 ||
  Math.abs(published?.within20 - Number(overallWithin20.toFixed(4))) > 0.00001 ||
  Object.entries(errorDistribution).some(
    ([metric, value]) => {
      const saved = published?.errorDistribution?.[metric];
      return !Number.isFinite(saved) || Math.abs(saved - value) > 0.00001;
    },
  ) ||
  Object.entries(bias).some(([metric, value]) => {
    const saved = published?.bias?.[metric];
    return !Number.isFinite(saved) || Math.abs(saved - value) > 0.00001;
  }) ||
  Object.entries(bySegment).some(([segment, metrics]) => {
    const saved = published?.bySegment?.[segment];
    return ["tested", "mape", "within20", "p90", "p95", "maximum", "bias"].some(
      (metric) => {
        const calculated =
          metric === "tested"
            ? metrics[metric]
            : metrics[metric] == null
              ? null
              : Number(metrics[metric].toFixed(4));
        return saved?.[metric] !== calculated;
      },
    );
  }) ||
  Object.entries(byProvider).some(([provider, metrics]) => {
    const saved = published?.byProvider?.[provider];
    return ["tested", "mape", "within20", "p90", "p95", "maximum", "bias"].some(
      (metric) => {
        const calculated =
          metric === "tested"
            ? metrics[metric]
            : metrics[metric] == null
              ? null
              : Number(metrics[metric].toFixed(4));
        return saved?.[metric] !== calculated;
      },
    );
  })
)) {
  throw new Error(JSON.stringify({
    issue: "published cross-validation metrics are stale",
    published,
    calculated: {
      tested: results.length,
      mape: Number(overallMape.toFixed(4)),
      within20: Number(overallWithin20.toFixed(4)),
      errorDistribution,
      bias,
    },
  }, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  method: "leave-one-anchor-out trilinear interpolation",
  tested: results.length,
  overallMape: Number(overallMape.toFixed(4)),
  overallWithin20: Number(overallWithin20.toFixed(4)),
  errorDistribution,
  bias,
  worstCases,
  byProvider: Object.fromEntries(Object.entries(byProvider).map(([provider, metrics]) => [provider, {
    tested: metrics.tested,
    mape: Number(metrics.mape.toFixed(4)),
    within20: Number(metrics.within20.toFixed(4)),
    p90: Number(metrics.p90.toFixed(4)),
    p95: Number(metrics.p95.toFixed(4)),
    maximum: Number(metrics.maximum.toFixed(4)),
    bias: Number(metrics.bias.toFixed(4)),
  }])),
  bySegment: Object.fromEntries(Object.entries(bySegment).map(([segment, metrics]) => [segment, {
    tested: metrics.tested,
    mape: metrics.mape == null ? null : Number(metrics.mape.toFixed(4)),
    within20: metrics.within20 == null ? null : Number(metrics.within20.toFixed(4)),
    p90: metrics.p90 == null ? null : Number(metrics.p90.toFixed(4)),
    p95: metrics.p95 == null ? null : Number(metrics.p95.toFixed(4)),
    maximum: metrics.maximum == null ? null : Number(metrics.maximum.toFixed(4)),
    bias: metrics.bias == null ? null : Number(metrics.bias.toFixed(4)),
  }])),
}, null, 2));
