import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [header, ...lines] = readFileSync(
  join(here, "../data/next-priority-collection-2026-11-21.csv"),
  "utf8",
).trim().split(/\r?\n/);
const columns = header.split(",");
const rows = lines.map((line) => Object.fromEntries(
  line.split(",").map((value, index) => [columns[index], value]),
));

const [priorityHeader, ...priorityLines] = readFileSync(
  join(here, "../data/solutionbuilder-priority-providers-2026-11-20.csv"),
  "utf8",
).trim().split(/\r?\n/);
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
if (
  (projectedTestable.smokerLife || 0) < 24 ||
  (projectedTestable.nonSmokerCI || 0) < 21 ||
  (projectedTestable.smokerCI || 0) < 6
) problems.push({ insufficientValidationGain: projectedTestable });

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
  mix,
}, null, 2));
