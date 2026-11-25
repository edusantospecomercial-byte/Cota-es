import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "../data");

// Recent reports are keyed by portal model ID, historical reports by their
// printed reference. A PDF digest identifies a source across both conventions.
const processedHashes = new Set();
for (const file of ["solutionbuilder-observed-2026-11-24.csv", "comparisons-with-waiver.csv",
  "comparison-feature-exclusions.csv"]) {
  const [header, ...rows] = readFileSync(join(dataDir, file), "utf8").trim().split(/\r?\n/);
  const hashIndex = header.split(",").indexOf("sha256");
  if (hashIndex < 0) throw new Error("Missing SHA-256 column in " + file);
  for (const row of rows) {
    const hash = row.split(",")[hashIndex];
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid digest in " + file);
    processedHashes.add(hash);
  }
}

function extract(argument) {
  const result = spawnSync(
    process.execPath,
    [join(here, "extract-priority-comparison-reports.mjs"), argument],
    { encoding: "utf8", maxBuffer: 20_000_000 },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return new Set(
    result.stdout.trim().split(/\r?\n/).slice(1)
      .filter((line) => !processedHashes.has(line.match(/sha256 ([a-f0-9]{64})/)?.[1]))
      .map((line) => line.split(",")[1]),
  );
}

function references(files) {
  return new Set(files.flatMap((file) =>
    readFileSync(join(dataDir, file), "utf8").trim().split(/\r?\n/).slice(1)
      .map((line) => line.split(",")[1]),
  ));
}

const extractedComplete = extract("--csv");
const extractedPartial = extract("--partial-csv");
const importedComplete = references([
  "solutionbuilder-priority-providers-2026-11-20.csv",
  "solutionbuilder-priority-provider-archive-2026-11-21.csv",
]);
const importedPartial = references([
  "solutionbuilder-priority-provider-gaps-2026-11-20.csv",
  "solutionbuilder-priority-provider-gap-archive-2026-11-21.csv",
]);
const newComplete = [...extractedComplete].filter((reference) => !importedComplete.has(reference));
const newPartial = [...extractedPartial].filter((reference) => !importedPartial.has(reference));

const report = {
  extractedComplete: extractedComplete.size,
  extractedPartial: extractedPartial.size,
  importedComplete: importedComplete.size,
  importedPartial: importedPartial.size,
  newComplete,
  newPartial,
};
if (newComplete.length || newPartial.length) {
  console.error(JSON.stringify({ ok: false, issue: "unimported official comparison reports", ...report }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, ...report }, null, 2));
