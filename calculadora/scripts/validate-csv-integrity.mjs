import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");
const files = readdirSync(dataDir).filter((name) => name.endsWith(".csv"));
const failures = [];
let totalRows = 0;

for (const name of files) {
  const text = readFileSync(join(dataDir, name), "utf8");
  if (!text.trim()) {
    failures.push({ file: name, issue: "empty CSV" });
    continue;
  }
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const expectedColumns = header.length;
  totalRows += lines.length - 1;

  if (header.some((column) => !column.trim()))
    failures.push({ file: name, issue: "empty header column" });
  if (new Set(header).size !== header.length)
    failures.push({ file: name, issue: "duplicate header column" });

  lines.slice(1).forEach((line, index) => {
    const actualColumns = line.split(",").length;
    if (!line.trim())
      failures.push({ file: name, line: index + 2, issue: "empty data row" });
    if (actualColumns !== expectedColumns)
      failures.push({
        file: name,
        line: index + 2,
        issue: "column count mismatch",
        expectedColumns,
        actualColumns,
      });
  });
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  `CSV integrity passed: ${files.length} files and ${totalRows} data rows have stable columns.`,
);
