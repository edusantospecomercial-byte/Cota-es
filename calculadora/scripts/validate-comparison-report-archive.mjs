import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [header, ...lines] = readFileSync(
  join(here, "../data/solutionbuilder-priority-provider-archive-2026-11-21.csv"),
  "utf8",
)
  .trim()
  .split(/\r?\n/);
const columns = header.split(",");
const rows = lines.map((line) =>
  Object.fromEntries(
    line.split(",").map((value, index) => [columns[index], value]),
  ),
);
const failures = [];
const scenarios = new Map();
const unique = new Set();

for (const row of rows) {
  const scenario = [
    row.model_id,
    row.age,
    row.sex,
    row.smoker,
    row.to_age,
    row.life_cover,
    row.critical_illness_cover,
  ].join("|");
  const key = `${scenario}|${row.provider}`;
  if (unique.has(key)) failures.push({ duplicate: key });
  unique.add(key);
  const providers = scenarios.get(scenario) || new Set();
  providers.add(row.provider);
  scenarios.set(scenario, providers);
  if (row.profile !== "Comparison Report Archive")
    failures.push({ key, issue: "unexpected profile" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.source_date))
    failures.push({ key, issue: "invalid source date" });
  if (!/Official comparison report ref \d+ sha256 [a-f0-9]{64}/.test(row.notes))
    failures.push({ key, issue: "missing immutable provenance" });
  if (
    Number(row.age) < 18 ||
    Number(row.age) > 75 ||
    Number(row.to_age) <= Number(row.age) ||
    Number(row.life_cover) < 5_000 ||
    Number(row.life_cover) > 1_000_000 ||
    Number(row.critical_illness_cover) < 0 ||
    Number(row.critical_illness_cover) > 1_000_000 ||
    Number(row.monthly_premium) <= 0
  )
    failures.push({ key, issue: "value outside guarded bounds" });
}

for (const [scenario, providers] of scenarios) {
  if (
    providers.size !== 3 ||
    !["Legal & General", "Zurich", "Aviva"].every((provider) =>
      providers.has(provider),
    )
  )
    failures.push({ scenario, issue: "incomplete priority trio" });
}

if (rows.length !== 879 || scenarios.size !== 293)
  failures.push({
    issue: "archive count changed without review",
    rows: rows.length,
    scenarios: scenarios.size,
  });

const catalog = JSON.parse(readFileSync(join(here, "../data/models.json"), "utf8"));
if (
  catalog.audit?.comparisonReportArchiveReports !== scenarios.size ||
  catalog.audit?.comparisonReportArchivePrices !== rows.length
)
  failures.push({
    issue: "published archive audit is stale",
    publishedReports: catalog.audit?.comparisonReportArchiveReports,
    publishedPrices: catalog.audit?.comparisonReportArchivePrices,
    reports: scenarios.size,
    prices: rows.length,
  });

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      officialComparisonReports: scenarios.size,
      officialPriorityPrices: rows.length,
      immutablePdfHashes: new Set(
        rows.map((row) => row.notes.match(/[a-f0-9]{64}/)?.[0]),
      ).size,
    },
    null,
    2,
  ),
);
