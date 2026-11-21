import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "../data");
const providers = ["Legal & General", "Zurich", "Aviva"];
const csvMode = process.argv.includes("--csv");

function readCsv(name) {
  const [header, ...lines] = readFileSync(join(dataDir, name), "utf8")
    .trim()
    .split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) =>
    Object.fromEntries(
      line.split(",").map((value, index) => [columns[index], value]),
    ),
  );
}

const capture = readCsv("next-priority-results-2026-11-21.csv");
const current = readCsv("solutionbuilder-priority-providers-2026-11-20.csv");
const currentKeys = new Set(
  current.map((row) =>
    [row.age, row.smoker, row.to_age, row.life_cover, row.critical_illness_cover, row.provider].join("|"),
  ),
);

const groups = new Map();
for (const row of capture) {
  const key = [row.priority, row.age, row.smoker, row.to_age, row.life_cover, row.critical_illness_cover].join("|");
  const group = groups.get(key) || [];
  group.push(row);
  groups.set(key, group);
}

const ready = [];
const pending = [];
const unavailable = [];
const invalid = [];
const duplicate = [];

for (const [key, rows] of groups) {
  const statuses = new Set(rows.map((row) => row.status));
  if (statuses.has("unavailable")) {
    unavailable.push({ key, providers: rows.filter((row) => row.status === "unavailable").map((row) => row.provider) });
    continue;
  }
  if (!rows.every((row) => row.status === "captured")) {
    pending.push({ key, captured: rows.filter((row) => row.status === "captured").length });
    continue;
  }
  const foundProviders = new Set(rows.map((row) => row.provider));
  const modelIds = new Set(rows.map((row) => row.source_model_id));
  const valid =
    rows.length === providers.length &&
    providers.every((provider) => foundProviders.has(provider)) &&
    modelIds.size === 1 &&
    /^\d+$/.test([...modelIds][0] || "") &&
    rows.every((row) =>
      row.available === "true" &&
      row.product &&
      Number.isFinite(Number(row.monthly_premium)) &&
      Number(row.monthly_premium) > 0
    );
  if (!valid) {
    invalid.push({ key, providers: [...foundProviders], modelIds: [...modelIds] });
    continue;
  }
  const alreadyPresent = rows.every((row) => currentKeys.has(
    [row.age, row.smoker, row.to_age, row.life_cover, row.critical_illness_cover, row.provider].join("|"),
  ));
  if (alreadyPresent) {
    duplicate.push(key);
    continue;
  }
  ready.push(...rows);
}

if (invalid.length) {
  console.error(JSON.stringify({ ok: false, invalid }, null, 2));
  process.exit(1);
}

const outputHeader = "source_date,model_id,profile,age,sex,smoker,to_age,life_cover,critical_illness_cover,provider,product,monthly_premium,available,notes";
const outputRows = ready.map((row) => [
  "2026-11-21",
  row.source_model_id,
  "Calibration Profile",
  row.age,
  "F",
  row.smoker,
  row.to_age,
  row.life_cover,
  row.critical_illness_cover,
  row.provider,
  row.product,
  row.monthly_premium,
  "true",
  "Collected from validated priority queue",
].join(","));

if (csvMode) console.log([outputHeader, ...outputRows].join("\n"));
else console.log(JSON.stringify({
  ok: true,
  scenarios: groups.size,
  readyScenarios: ready.length / providers.length,
  readyPrices: ready.length,
  pendingScenarios: pending.length,
  unavailableScenarios: unavailable.length,
  duplicateScenarios: duplicate.length,
  writesPerformed: false,
}, null, 2));
