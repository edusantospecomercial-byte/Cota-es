import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "../data");
const catalog = JSON.parse(readFileSync(join(dataDir, "models.json"), "utf8"));
const files = [
  "solutionbuilder-priority-providers-2026-11-20.csv",
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
];
const sourceDates = files.flatMap((file) =>
  readFileSync(join(dataDir, file), "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",")[0]),
);
const generatedAt = new Date(catalog.generatedAt);
const ageInDays = (sourceDate) =>
  Math.floor(
    (generatedAt - new Date(`${sourceDate}T00:00:00Z`)) / 86_400_000,
  );
const ages = sourceDates.map(ageInDays);
const within180 = ages.filter((age) => age <= 180).length / ages.length;
const within365 = ages.filter((age) => age <= 365).length / ages.length;
const newestAgeDays = Math.min(...ages);
const oldestAgeDays = Math.max(...ages);
const calculated = {
  prices: sourceDates.length,
  within180: Number(within180.toFixed(4)),
  within365: Number(within365.toFixed(4)),
  newestAgeDays,
  oldestAgeDays,
};
const published = catalog.audit?.priorityProviderRecency;
const failures = [];
if (within365 < 0.98)
  failures.push({ issue: "less than 98% of priority prices are within one year" });
if (newestAgeDays > 7)
  failures.push({ issue: "no priority evidence within seven days of generation" });
if (oldestAgeDays > 548)
  failures.push({ issue: "priority evidence older than eighteen months" });
for (const [metric, value] of Object.entries(calculated))
  if (published?.[metric] !== value)
    failures.push({ issue: "published recency audit is stale", metric, value, published: published?.[metric] });

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, calculated }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, priorityProviderRecency: calculated }, null, 2));
