import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
const fields = [
  ["illustration-validation-2026-11-19.csv", "profile", new Set(["Archive Quote"])],
  ["solutionbuilder-history-validation-2026-11-19.csv", "profile", new Set(["Calibration Profile"])],
  ["solutionbuilder-profile-b-fumante-vida-ci-2026-11-19.csv", "profile", new Set(["Calibration Profile"])],
  ["solutionbuilder-priority-providers-2026-11-20.csv", "profile", new Set(["Calibration Profile"])],
  ["solutionbuilder-priority-provider-archive-2026-11-21.csv", "profile", new Set(["Comparison Report Archive"])],
  ["solutionbuilder-priority-provider-gaps-2026-11-20.csv", "profile", new Set(["Calibration Profile"])],
  ["solutionbuilder-priority-provider-gap-archive-2026-11-21.csv", "profile", new Set(["Comparison Report Archive"])],
  ["solutionbuilder-calibracao-2026-11-18.csv", "source_client", new Set(["Calibration Profile"])],
  ["solutionbuilder-profile-a-minimos-2026-11-18.csv", "source_client", new Set(["Calibration Profile"])],
];

const failures = [];
let checkedRows = 0;
for (const [filename, field, allowed] of fields) {
  const lines = readFileSync(join(dataDir, filename), "utf8").trim().split(/\r?\n/);
  const columns = lines.shift().split(",");
  const index = columns.indexOf(field);
  if (index < 0) {
    failures.push({ filename, issue: `missing ${field}` });
    continue;
  }
  for (const [offset, line] of lines.entries()) {
    checkedRows += 1;
    const value = line.split(",")[index];
    if (!allowed.has(value))
      failures.push({ filename, line: offset + 2, field, value });
  }
}

const forbiddenHeaders = new Set([
  "name",
  "full_name",
  "first_name",
  "last_name",
  "dob",
  "date_of_birth",
  "address",
  "postcode",
  "phone",
  "telephone",
  "mobile",
  "email",
  "nhs_number",
]);
const sensitiveValuePatterns = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["UK telephone", /(?:\+44|0044)\s*\d/],
  ["UK postcode", /\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i],
];
const publicCsvFiles = readdirSync(dataDir).filter((name) => name.endsWith(".csv"));
for (const filename of publicCsvFiles) {
  const content = readFileSync(join(dataDir, filename), "utf8");
  const [header] = content.trim().split(/\r?\n/);
  const exposedHeaders = header.split(",").filter((column) =>
    forbiddenHeaders.has(column.trim().toLowerCase()),
  );
  if (exposedHeaders.length)
    failures.push({ filename, issue: "direct personal-data columns", exposedHeaders });
  for (const [kind, pattern] of sensitiveValuePatterns) {
    if (pattern.test(content)) failures.push({ filename, issue: `possible ${kind}` });
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checkedFiles: fields.length,
  publicCsvFiles: publicCsvFiles.length,
  checkedRows,
  allowedLabels: ["Archive Quote", "Calibration Profile", "Comparison Report Archive"],
}, null, 2));
