import { readFileSync } from "node:fs";
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

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checkedFiles: fields.length,
  checkedRows,
  allowedLabels: ["Archive Quote", "Calibration Profile", "Comparison Report Archive"],
}, null, 2));
