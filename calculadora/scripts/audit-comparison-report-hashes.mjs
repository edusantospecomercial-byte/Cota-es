import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extractor = spawnSync(
  process.execPath,
  [join(here, "extract-priority-comparison-reports.mjs"), "--json"],
  { encoding: "utf8", maxBuffer: 40_000_000 },
);
if (extractor.status !== 0) throw new Error(extractor.stderr || extractor.stdout);
const inventory = JSON.parse(extractor.stdout);
const hashesByReference = new Map();
for (const report of inventory.reports) {
  if (!report.reference || !report.sha256) continue;
  const hashes = hashesByReference.get(report.reference) || new Set();
  hashes.add(report.sha256);
  hashesByReference.set(report.reference, hashes);
}

const files = [
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
  "solutionbuilder-priority-provider-gap-archive-2026-11-21.csv",
];
const checked = new Set();
const failures = [];
for (const file of files) {
  for (const line of readFileSync(join(here, "../data", file), "utf8").trim().split(/\r?\n/).slice(1)) {
    const reference = line.split(",")[1];
    const hash = line.match(/sha256 ([a-f0-9]{64})/)?.[1];
    const key = `${reference}|${hash}`;
    if (checked.has(key)) continue;
    checked.add(key);
    if (!hash || !hashesByReference.get(reference)?.has(hash))
      failures.push({ file, reference, hash, issue: "published provenance does not match a current source PDF" });
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  sourceFiles: inventory.summary.files,
  uniqueReferences: inventory.summary.uniqueReferences,
  verifiedPublishedReports: checked.size,
}, null, 2));
