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

const gaps = [
  ...parseCsv(
    new URL("../data/solutionbuilder-priority-provider-gaps-2026-11-20.csv", import.meta.url),
  ),
  ...parseCsv(
    new URL("../data/solutionbuilder-priority-provider-gap-archive-2026-11-21.csv", import.meta.url),
  ),
];
const official = [
  ...parseCsv(
    new URL("../data/solutionbuilder-priority-providers-2026-11-20.csv", import.meta.url),
  ),
  ...parseCsv(
    new URL("../data/solutionbuilder-priority-provider-archive-2026-11-21.csv", import.meta.url),
  ),
];
const officialModels = new Set(official.map((row) => row.model_id));
const seen = new Set();
const lifeOnlyScenarios = new Set();
const exactPartialScenarios = new Set();
const failures = [];
const allowedProfiles = new Set(["Calibration Profile", "Comparison Report Archive"]);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

for (const row of gaps) {
  if (!row.model_id || seen.has(row.model_id))
    failures.push({ model_id: row.model_id, issue: "missing or duplicate model id" });
  seen.add(row.model_id);
  if (officialModels.has(row.model_id))
    failures.push({ model_id: row.model_id, issue: "excluded model leaked into official calibration" });
  if (row.missing_provider !== "Legal & General")
    failures.push({ model_id: row.model_id, issue: "unexpected missing provider" });
  if (!/^\d+$/.test(row.model_id))
    failures.push({ model_id: row.model_id, issue: "invalid model id" });
  if (!allowedProfiles.has(row.profile))
    failures.push({ model_id: row.model_id, issue: "unexpected profile" });
  if (!isoDate.test(row.source_date) || !Number.isFinite(Date.parse(`${row.source_date}T00:00:00Z`)))
    failures.push({ model_id: row.model_id, issue: "invalid source date" });
  if (!["F", "M"].includes(row.sex))
    failures.push({ model_id: row.model_id, issue: "invalid sex" });
  if (!["No", "Yes"].includes(row.smoker))
    failures.push({ model_id: row.model_id, issue: "invalid smoker status" });
  const age = Number(row.age);
  const toAge = Number(row.to_age);
  const lifeCover = Number(row.life_cover);
  const ciCover = Number(row.critical_illness_cover);
  if (!Number.isInteger(age) || age < 18 || age > 85)
    failures.push({ model_id: row.model_id, issue: "invalid age" });
  if (!Number.isInteger(toAge) || toAge <= age || toAge > 90)
    failures.push({ model_id: row.model_id, issue: "invalid end age" });
  if (!Number.isFinite(lifeCover) || lifeCover <= 0)
    failures.push({ model_id: row.model_id, issue: "invalid life cover" });
  if (!Number.isFinite(ciCover) || ciCover < 0)
    failures.push({ model_id: row.model_id, issue: "invalid critical illness cover" });
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
    lifeOnlyScenarios.add(scenario);
  }
  if (
    row.profile === "Comparison Report Archive" &&
    !/^Official partial comparison report ref \d+ sha256 [a-f0-9]{64}$/.test(
      row.notes,
    )
  )
    failures.push({ model_id: row.model_id, issue: "missing archive provenance" });
  if (row.profile === "Calibration Profile" && !row.notes.trim())
    failures.push({ model_id: row.model_id, issue: "missing capture evidence" });
  exactPartialScenarios.add([
    row.model_id,
    row.age,
    row.smoker,
    row.to_age,
    row.life_cover,
    row.critical_illness_cover,
  ].join("|"));
}

if (exactPartialScenarios.size !== gaps.length)
  failures.push({ issue: "duplicate partial priority scenario" });

const archiveGaps = gaps.filter(
  (row) => row.profile === "Comparison Report Archive",
);
if (archiveGaps.length !== 63)
  failures.push({
    issue: "partial comparison-report archive count changed without review",
    archiveGaps: archiveGaps.length,
  });

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(
  `Priority-provider exclusions passed: ${gaps.length} incomplete quote variants kept out of three-provider calibration; all ${exactPartialScenarios.size} retain exact Zurich and Aviva partial display (${lifeOnlyScenarios.size} unique life-only scenarios).`,
);
