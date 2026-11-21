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

const scenarioKeys = rows.map((row) => [
  row.age,
  row.smoker,
  row.to_age,
  row.life_cover,
  row.critical_illness_cover,
].join("|"));
const problems = [];
if (new Set(scenarioKeys).size !== rows.length) problems.push("duplicate scenarios");
if (rows.some((row, index) => Number(row.priority) !== index + 1)) problems.push("non-sequential priorities");
if (rows.some((row) => row.providers !== "Legal & General|Zurich|Aviva")) problems.push("wrong provider priority");
if (rows.some((row) => row.status !== "pending_authentication")) problems.push("unexpected queue status");

const mix = rows.reduce((counts, row) => {
  const key = `${row.smoker === "Yes" ? "smoker" : "nonSmoker"}${Number(row.critical_illness_cover) > 0 ? "CI" : "Life"}`;
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});
if (!mix.smokerLife || !mix.smokerCI || !mix.nonSmokerCI) problems.push("missing strategic segment");

if (problems.length) {
  console.error(JSON.stringify({ ok: false, problems, mix }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, queuedScenarios: rows.length, maximumPrices: rows.length * 3, mix }, null, 2));
