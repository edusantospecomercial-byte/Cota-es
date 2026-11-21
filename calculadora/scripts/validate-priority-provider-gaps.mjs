import fs from "node:fs";

function parseCsv(path) {
  const [header, ...lines] = fs
    .readFileSync(path, "utf8")
    .trim()
    .split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? ""]));
  });
}

const gaps = parseCsv(
  new URL("../data/solutionbuilder-priority-provider-gaps-2026-11-20.csv", import.meta.url),
);
const official = parseCsv(
  new URL("../data/solutionbuilder-priority-providers-2026-11-20.csv", import.meta.url),
);
const officialModels = new Set(official.map((row) => row.model_id));
const seen = new Set();
const lifeOnlyScenarios = new Set();
const failures = [];

for (const row of gaps) {
  if (!row.model_id || seen.has(row.model_id))
    failures.push({ model_id: row.model_id, issue: "missing or duplicate model id" });
  seen.add(row.model_id);
  if (officialModels.has(row.model_id))
    failures.push({ model_id: row.model_id, issue: "excluded model leaked into official calibration" });
  if (row.missing_provider !== "Legal & General")
    failures.push({ model_id: row.model_id, issue: "unexpected missing provider" });
  if (
    !row.reason
    || !Number.isFinite(Number(row.zurich_premium))
    || Number(row.zurich_premium) <= 0
    || !Number.isFinite(Number(row.aviva_premium))
    || Number(row.aviva_premium) <= 0
  )
    failures.push({ model_id: row.model_id, issue: "incomplete exclusion evidence" });
  if (Number(row.critical_illness_cover) === 0) {
    const scenario = [row.age, row.smoker, row.to_age, row.life_cover].join("|");
    if (lifeOnlyScenarios.has(scenario))
      failures.push({ model_id: row.model_id, issue: "duplicate life-only gap scenario" });
    lifeOnlyScenarios.add(scenario);
  }
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(
  `Priority-provider exclusions passed: ${gaps.length} incomplete scenarios kept out of calibration; ${lifeOnlyScenarios.size} life-only gaps safe for exact partial display.`,
);
