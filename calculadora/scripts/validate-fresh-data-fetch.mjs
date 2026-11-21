import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../app.js"), "utf8");
const dataFiles = [
  "./data/models.json",
  "./data/solutionbuilder-priority-providers-2026-11-20.csv",
  "./data/solutionbuilder-priority-provider-gaps-2026-11-20.csv",
];
const failures = [];

for (const file of dataFiles) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    `fetch\\(\\s*["']${escaped}["']\\s*,\\s*\\{\\s*cache:\\s*["']no-store["']`,
  );
  if (!expression.test(source)) failures.push({ file, issue: "not fetched with no-store" });
}
if (/\.\/data\/[^"']+\?v=/.test(source))
  failures.push({ issue: "fixed data cache-buster remains" });

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  freshDataFiles: dataFiles,
  cache: "no-store",
}, null, 2));
