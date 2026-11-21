import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "../data");
const providers = ["Legal & General", "Zurich", "Aviva"];

function readCsv(name) {
  const [header, ...lines] = readFileSync(join(dataDir, name), "utf8")
    .trim()
    .split(/\r?\n/);
  const columns = header.split(",");
  return {
    header,
    rows: lines.map((line) =>
      Object.fromEntries(
        line.split(",").map((value, index) => [columns[index], value]),
      ),
    ),
  };
}

const queue = readCsv("next-priority-collection-2026-11-21.csv");
const capture = readCsv("next-priority-results-2026-11-21.csv");
const expectedHeader =
  "priority,batch,age,smoker,to_age,life_cover,critical_illness_cover,provider,product,monthly_premium,available,source_model_id,status,notes";
const failures = [];

if (capture.header !== expectedHeader)
  failures.push({ issue: "capture header changed" });

const expected = queue.rows.flatMap((row) =>
  providers.map((provider) => ({ ...row, provider })),
);
if (capture.rows.length !== expected.length)
  failures.push({
    issue: "wrong capture row count",
    expected: expected.length,
    actual: capture.rows.length,
  });

const scenarioFields = [
  "priority",
  "batch",
  "age",
  "smoker",
  "to_age",
  "life_cover",
  "critical_illness_cover",
  "provider",
];

capture.rows.forEach((row, index) => {
  const planned = expected[index];
  if (
    !planned ||
    scenarioFields.some((field) => row[field] !== planned[field])
  )
    failures.push({
      issue: "capture row does not match queue",
      line: index + 2,
    });

  if (row.status === "pending_authentication") {
    if (
      row.product ||
      row.monthly_premium ||
      row.available ||
      row.source_model_id ||
      row.notes
    )
      failures.push({ issue: "pending row contains captured data", line: index + 2 });
    return;
  }

  if (row.status === "captured") {
    if (
      row.available !== "true" ||
      !row.product ||
      !row.source_model_id ||
      !Number.isFinite(Number(row.monthly_premium)) ||
      Number(row.monthly_premium) <= 0
    )
      failures.push({ issue: "invalid captured price", line: index + 2 });
    return;
  }

  if (row.status === "unavailable") {
    if (
      row.available !== "false" ||
      row.monthly_premium ||
      !row.notes
    )
      failures.push({ issue: "invalid unavailable result", line: index + 2 });
    return;
  }

  failures.push({ issue: "unexpected capture status", line: index + 2, status: row.status });
});

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures: failures.slice(0, 20) }, null, 2));
  process.exit(1);
}

const status = capture.rows.reduce((counts, row) => {
  counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}, {});
console.log(JSON.stringify({
  ok: true,
  scenarios: queue.rows.length,
  prices: capture.rows.length,
  providers,
  status,
}, null, 2));
