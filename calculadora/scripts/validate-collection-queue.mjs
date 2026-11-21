import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const providers = ["Legal & General", "Zurich", "Aviva"];
const [header, ...lines] = readFileSync(
  join(here, "../data/next-priority-collection-2026-11-21.csv"),
  "utf8",
).trim().split(/\r?\n/);
const columns = header.split(",");
const rows = lines.map((line) => Object.fromEntries(
  line.split(",").map((value, index) => [columns[index], value]),
));

const priorityFiles = [
  "solutionbuilder-priority-providers-2026-11-20.csv",
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
];
const [priorityHeader] = readFileSync(
  join(here, `../data/${priorityFiles[0]}`),
  "utf8",
).trim().split(/\r?\n/);
const priorityLines = priorityFiles.flatMap((file) =>
  readFileSync(join(here, `../data/${file}`), "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1),
);
const priorityColumns = priorityHeader.split(",");
const priorityRows = priorityLines.map((line) =>
  Object.fromEntries(
    line.split(",").map((value, index) => [priorityColumns[index], value]),
  ),
);
const collectedScenarioKeys = new Set(priorityRows.map((row) => {
  return [
    row.age,
    row.smoker,
    row.to_age,
    row.life_cover,
    row.critical_illness_cover,
  ].join("|");
}));

const scenarioKeys = rows.map((row) => [
  row.age,
  row.smoker,
  row.to_age,
  row.life_cover,
  row.critical_illness_cover,
].join("|"));
const problems = [];
if (new Set(scenarioKeys).size !== rows.length) problems.push("duplicate scenarios");
const alreadyCollected = scenarioKeys.filter((key) => collectedScenarioKeys.has(key));
if (alreadyCollected.length) problems.push({ alreadyCollected });
if (rows.some((row, index) => Number(row.priority) !== index + 1)) problems.push("non-sequential priorities");
if (rows.some((row) => row.providers !== "Legal & General|Zurich|Aviva")) problems.push("wrong provider priority");
if (rows.some((row) => row.status !== "pending_authentication")) problems.push("unexpected queue status");

const mix = rows.reduce((counts, row) => {
  const key = `${row.smoker === "Yes" ? "smoker" : "nonSmoker"}${Number(row.critical_illness_cover) > 0 ? "CI" : "Life"}`;
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});
if (!mix.smokerLife || !mix.smokerCI || !mix.nonSmokerCI) problems.push("missing strategic segment");

function interpolatePoint(points, target, axis, maxGap = Infinity) {
  const sorted = [...points].sort((a, b) => a[axis] - b[axis]);
  const exact = sorted.find((row) => row[axis] === target);
  if (exact) return exact;
  const below = sorted.filter((row) => row[axis] < target).at(-1);
  const above = sorted.find((row) => row[axis] > target);
  if (!below || !above || above[axis] - below[axis] > maxGap) return null;
  return {
    age: axis === "age" ? target : below.age,
    life: axis === "life" ? target : below.life,
    toAge: axis === "toAge" ? target : below.toAge,
  };
}

function canInterpolate(pool, target) {
  const comparable = pool.filter((row) =>
    row.provider === target.provider &&
    row.smoker === target.smoker &&
    row.ci === target.ci
  );
  const byTerm = [...new Set(comparable.map((row) => row.toAge))]
    .map((toAge) => {
      const atTerm = comparable.filter((row) => row.toAge === toAge);
      const byAge = [...new Set(atTerm.map((row) => row.age))]
        .map((age) => {
          const value = interpolatePoint(
            atTerm.filter((row) => row.age === age),
            target.life,
            "life",
          );
          return value ? { ...value, age, toAge } : null;
        })
        .filter(Boolean);
      const value = interpolatePoint(byAge, target.age, "age", 10);
      return value ? { ...value, toAge } : null;
    })
    .filter(Boolean);
  return Boolean(interpolatePoint(byTerm, target.toAge, "toAge", 10));
}

function countTestable(anchors) {
  const counts = {};
  for (let index = 0; index < anchors.length; index += 1) {
    const target = anchors[index];
    if (!canInterpolate(anchors.filter((_, candidate) => candidate !== index), target)) continue;
    const segment = `${target.smoker === "Yes" ? "smoker" : "nonSmoker"}${target.ci > 0 ? "CI" : "Life"}`;
    counts[segment] = (counts[segment] || 0) + 1;
  }
  return counts;
}

function coverageReport(anchors) {
  const ages = Array.from({ length: 39 }, (_, index) => index + 25);
  const toAges = [65, 70, 75, 85];
  const lifeCovers = [20000, 30000, 50000, 100000, 150000, 200000];
  const report = {};
  for (const smoker of ["No", "Yes"]) {
    for (const ci of [0, 10000, 20000]) {
      let complete = 0;
      let total = 0;
      for (const age of ages) {
        for (const toAge of toAges) {
          if (toAge <= age) continue;
          for (const life of lifeCovers) {
            total += 1;
            if (providers.every((provider) =>
              canInterpolate(anchors, { provider, smoker, ci, age, toAge, life })
            )) complete += 1;
          }
        }
      }
      const key = `${smoker === "Yes" ? "smoker" : "nonSmoker"}_ci${ci}`;
      report[key] = {
        complete,
        total,
        coverage: Number((complete / total).toFixed(4)),
      };
    }
  }
  return report;
}

const currentAnchors = priorityRows
  .filter((row) => row.available === "true")
  .map((row) => ({
    provider: row.provider,
    smoker: row.smoker,
    age: Number(row.age),
    toAge: Number(row.to_age),
    life: Number(row.life_cover),
    ci: Number(row.critical_illness_cover),
  }));
const queuedAnchors = rows.flatMap((row) => row.providers.split("|").map((provider) => ({
  provider,
  smoker: row.smoker,
  age: Number(row.age),
  toAge: Number(row.to_age),
  life: Number(row.life_cover),
  ci: Number(row.critical_illness_cover),
})));
const projectedTestable = countTestable([...currentAnchors, ...queuedAnchors]);
const currentCoverage = coverageReport(currentAnchors);
const projectedCoverage = coverageReport([...currentAnchors, ...queuedAnchors]);
const prefixGains = [4, 8, 12, 16, 20, 24, 26, 29, 33, 37].map((scenarios) => {
  const anchors = [
    ...currentAnchors,
    ...queuedAnchors.slice(0, scenarios * providers.length),
  ];
  return {
    scenarios,
    prices: scenarios * providers.length,
    testable: countTestable(anchors),
    coverage: coverageReport(anchors),
  };
});
if (
  (projectedTestable.smokerLife || 0) < 24 ||
  (projectedTestable.nonSmokerCI || 0) < 21 ||
  (projectedTestable.smokerCI || 0) < 6
) problems.push({ insufficientValidationGain: projectedTestable });
if (
  projectedCoverage.smoker_ci0.coverage < 0.0342 ||
  projectedCoverage.smoker_ci10000.coverage < 0.0673 ||
  projectedCoverage.smoker_ci20000.coverage < 0.0673 ||
  projectedCoverage.nonSmoker_ci10000.coverage < 0.0363 ||
  projectedCoverage.nonSmoker_ci20000.coverage < 0.0171
) problems.push({ insufficientCoverageGain: projectedCoverage });
const prefix4 = prefixGains.find((row) => row.scenarios === 4);
const prefix24 = prefixGains.find((row) => row.scenarios === 24);
const prefix26 = prefixGains.find((row) => row.scenarios === 26);
const prefix33 = prefixGains.find((row) => row.scenarios === 33);
if (
  prefix4.coverage.smoker_ci0.complete < 14 ||
  (prefix4.testable.smokerLife || 0) < 12 ||
  prefix24.coverage.smoker_ci10000.complete < 63 ||
  prefix24.coverage.smoker_ci20000.complete < 63 ||
  (prefix26.testable.smokerCI || 0) < 6 ||
  (prefix33.testable.nonSmokerCI || 0) < 21
) problems.push({ inefficientQueueOrder: prefixGains });

if (problems.length) {
  console.error(JSON.stringify({ ok: false, problems, mix }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  queuedScenarios: rows.length,
  maximumPrices: rows.length * 3,
  existingScenariosChecked: collectedScenarioKeys.size,
  projectedTestable,
  currentCoverage,
  projectedCoverage,
  prefixGains,
  mix,
}, null, 2));
