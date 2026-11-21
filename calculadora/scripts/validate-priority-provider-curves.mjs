import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const csvPaths = [
  "solutionbuilder-priority-providers-2026-11-20.csv",
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
].map((file) => join(here, "..", "data", file));
const [header] = readFileSync(csvPaths[0], "utf8").trim().split(/\r?\n/);
const lines = csvPaths.flatMap((csvPath) =>
  readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1),
);
const columns = header.split(",");
const allRows = lines.map((line) => {
  const row = Object.fromEntries(
    line.split(",").map((value, index) => [columns[index], value]),
  );
  for (const key of [
    "age",
    "to_age",
    "life_cover",
    "critical_illness_cover",
    "monthly_premium",
  ])
    row[key] = Number(row[key]);
  return row;
});
const latest = new Map();
for (const row of allRows) {
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
const rows = [...latest.values()];

const failures = [];

function checkIncreasing(groupKeys, varyingKey, label) {
  const groups = new Map();
  let comparedPairs = 0;
  for (const row of rows) {
    const key = groupKeys.map((field) => row[field]).join("|");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    group.sort((a, b) => a[varyingKey] - b[varyingKey]);
    for (let index = 1; index < group.length; index += 1) {
      const previous = group[index - 1];
      const current = group[index];
      if (current[varyingKey] > previous[varyingKey]) comparedPairs += 1;
      if (
        current[varyingKey] > previous[varyingKey] &&
        // Reports come from different real client occupations and quote dates.
        // Ignore only sub-5p rounding/rating noise; material reversals still fail.
        current.monthly_premium + 0.05 < previous.monthly_premium
      ) {
        failures.push({
          curve: label,
          group: key,
          previous: {
            value: previous[varyingKey],
            premium: previous.monthly_premium,
          },
          current: {
            value: current[varyingKey],
            premium: current.monthly_premium,
          },
        });
      }
    }
  }
  return comparedPairs;
}

const capitalCurvePairs = checkIncreasing(
  ["provider", "sex", "smoker", "age", "to_age", "critical_illness_cover"],
  "life_cover",
  "capital",
);
const termCurvePairs = checkIncreasing(
  ["provider", "sex", "smoker", "age", "life_cover", "critical_illness_cover"],
  "to_age",
  "term",
);
const criticalIllnessCurvePairs = checkIncreasing(
  ["provider", "sex", "smoker", "age", "to_age", "life_cover"],
  "critical_illness_cover",
  "critical illness",
);

const ageGroups = new Map();
for (const row of rows) {
  const key = [
    row.provider,
    row.sex,
    row.smoker,
    row.to_age,
    row.life_cover,
    row.critical_illness_cover,
  ].join("|");
  const group = ageGroups.get(key) ?? [];
  group.push(row);
  ageGroups.set(key, group);
}
let adjacentAgePairs = 0;
const ageReversals = [];
for (const [key, group] of ageGroups) {
  group.sort((left, right) => left.age - right.age);
  for (let index = 1; index < group.length; index += 1) {
    adjacentAgePairs += 1;
    const previous = group[index - 1];
    const current = group[index];
    if (current.monthly_premium + 0.05 < previous.monthly_premium)
      ageReversals.push({
        group: key,
        fromAge: previous.age,
        toAge: current.age,
        relativeDrop:
          (previous.monthly_premium - current.monthly_premium) /
          previous.monthly_premium,
      });
  }
}
const ageReversalRate = ageReversals.length / adjacentAgePairs;
const maximumAgeReversal = Math.max(
  0,
  ...ageReversals.map((row) => row.relativeDrop),
);
if (ageReversalRate > 0.05 || maximumAgeReversal > 0.06)
  failures.push({
    curve: "age consistency",
    adjacentAgePairs,
    reversals: ageReversals.length,
    ageReversalRate,
    maximumAgeReversal,
  });

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

const ageInterpolationSegments = new Set();
const capitalInterpolationSegments = new Set();
const termInterpolationSegments = new Set();
for (const provider of ["Legal & General", "Zurich", "Aviva"]) {
  const providerRows = rows.filter((row) => row.provider === provider);
  const groups = new Map();
  for (const row of providerRows) {
    const key = [
      row.sex,
      row.smoker,
      row.to_age,
      row.life_cover,
      row.critical_illness_cover,
    ].join("|");
    const ages = groups.get(key) ?? new Set();
    ages.add(row.age);
    groups.set(key, ages);
  }
  for (const [key, ages] of groups) {
    const sorted = [...ages].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index] - sorted[index - 1] <= 10)
        ageInterpolationSegments.add(
          `${provider}|${key}|${sorted[index - 1]}-${sorted[index]}`,
        );
    }
  }

  const capitalGroups = new Map();
  const termGroups = new Map();
  for (const row of providerRows) {
    const capitalKey = [
      row.sex,
      row.smoker,
      row.age,
      row.to_age,
      row.critical_illness_cover,
    ].join("|");
    const capitals = capitalGroups.get(capitalKey) ?? new Set();
    capitals.add(row.life_cover);
    capitalGroups.set(capitalKey, capitals);

    const termKey = [
      row.sex,
      row.smoker,
      row.age,
      row.life_cover,
      row.critical_illness_cover,
    ].join("|");
    const terms = termGroups.get(termKey) ?? new Set();
    terms.add(row.to_age);
    termGroups.set(termKey, terms);
  }
  for (const [key, capitals] of capitalGroups) {
    const sorted = [...capitals].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1)
      capitalInterpolationSegments.add(
        `${provider}|${key}|${sorted[index - 1]}-${sorted[index]}`,
      );
  }
  for (const [key, terms] of termGroups) {
    const sorted = [...terms].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index] - sorted[index - 1] <= 10)
        termInterpolationSegments.add(
          `${provider}|${key}|${sorted[index - 1]}-${sorted[index]}`,
        );
    }
  }
}

const coverageMinimums = {
  age: 150,
  capital: 150,
  term: 150,
};
const coverageActual = {
  age: ageInterpolationSegments.size,
  capital: capitalInterpolationSegments.size,
  term: termInterpolationSegments.size,
};
for (const [dimension, minimum] of Object.entries(coverageMinimums)) {
  if (coverageActual[dimension] < minimum)
    failures.push({
      coverageRegression: dimension,
      minimum,
      actual: coverageActual[dimension],
    });
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(
  `Priority-provider curves passed: ${rows.length} prices, ${ageInterpolationSegments.size} age, ${capitalInterpolationSegments.size} capital and ${termInterpolationSegments.size} term interpolation segments; ${capitalCurvePairs} capital, ${termCurvePairs} term and ${criticalIllnessCurvePairs} CI monotonic pairs; ${ageReversals.length}/${adjacentAgePairs} adjacent age pairs reverse (${(ageReversalRate * 100).toFixed(2)}%, max ${(maximumAgeReversal * 100).toFixed(2)}%).`,
);
