import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(
  here,
  "..",
  "data",
  "solutionbuilder-priority-providers-2026-11-20.csv",
);
const [header, ...lines] = readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
const columns = header.split(",");
const rows = lines.map((line) => {
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

const failures = [];

function checkIncreasing(groupKeys, varyingKey, label) {
  const groups = new Map();
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
      if (
        current[varyingKey] > previous[varyingKey] &&
        current.monthly_premium + 0.01 < previous.monthly_premium
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
}

checkIncreasing(
  ["provider", "smoker", "age", "to_age", "critical_illness_cover"],
  "life_cover",
  "capital",
);
checkIncreasing(
  ["provider", "smoker", "age", "life_cover", "critical_illness_cover"],
  "to_age",
  "term",
);

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
      row.smoker,
      row.age,
      row.to_age,
      row.critical_illness_cover,
    ].join("|");
    const capitals = capitalGroups.get(capitalKey) ?? new Set();
    capitals.add(row.life_cover);
    capitalGroups.set(capitalKey, capitals);

    const termKey = [
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

console.log(
  `Priority-provider curves passed: ${rows.length} prices, ${ageInterpolationSegments.size} age, ${capitalInterpolationSegments.size} capital and ${termInterpolationSegments.size} term interpolation segments.`,
);
