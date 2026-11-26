import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
const catalog = JSON.parse(readFileSync(join(dataDir, "models.json"), "utf8"));
const lines = readFileSync(
  join(dataDir, "illustration-validation-2026-11-19.csv"),
  "utf8",
).trim().split(/\r?\n/);
const columns = lines.shift().split(",");

const rows = lines.map((line) => {
  const values = line.split(",");
  return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
});

const families = {
  life: {
    model: catalog.models.life_only,
    rows: rows.filter((row) => row.to_age !== "" && (row.provider !== "Legal & General" || Number(row.term_years) === Number(row.to_age) - Number(row.age))
      && Number(row.life_component) > 0 && Number(row.critical_illness_component) === 0
      && !/discounted|multipolicy|package component/i.test(row.product)),
    minimumCoverage: 1,
  },
  standardCombined: {
    model: catalog.models["life_plus_standalone_ci:standard_core_ci"],
    rows: rows.filter((row) =>
      row.to_age !== "" && (row.provider !== "Legal & General" || Number(row.term_years) === Number(row.to_age) - Number(row.age))
      && Number(row.life_component) > 0
      && Number(row.critical_illness_component) > 0
      && !/earlier|discounted|multipolicy|package component|enhanced|upgraded|extra|child/i.test(row.product)
    ),
    minimumCoverage: 1,
  },
};

const report = {};
const failures = [];
for (const [name, family] of Object.entries(families)) {
  let keyed = 0;
  for (const row of family.rows) {
    const key = [
      row.age,
      row.to_age,
      row.life_component,
      row.critical_illness_component,
      row.smoker === "true" ? 1 : 0,
    ].join("|");
    if (family.model.lookup?.[key] != null) keyed += 1;
  }
  if (!family.rows.length) {
    report[name] = { comparableRecords: 0, keyedRecords: 0, keyCoverage: null };
    if (name === "life") failures.push({ name, issue: "No life records available for coverage checks" });
    continue;
  }
  const coverage = keyed / family.rows.length;
  report[name] = {
    comparableRecords: family.rows.length,
    keyedRecords: keyed,
    keyCoverage: Number(coverage.toFixed(4)),
    minimumKeyCoverage: family.minimumCoverage,
  };
  if (coverage < family.minimumCoverage) failures.push({ name, ...report[name] });
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, report }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, archiveCoverage: report }, null, 2));
