import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../app.js"), "utf8");
const dataFiles = [
  "./data/fracture-comparisons.csv",
  "./data/fixed-term-life.csv",
  "./data/comparison-product-declines.csv",
  "./data/exact-capital-product-variants.csv",
  "./data/independent-ci-product-variants.csv",
  "./data/independent-ci-variant-capital-checks.csv",
  "./data/smoker-first-event-product-variants.csv",
  "./data/non-smoker-first-event-product-variants.csv",
  "./data/lg-fixed-term-first-event-product-variants.csv",
  "./data/fracture-breakdowns.csv",
  "./data/aviva-core-breakdowns.csv",
  "./data/zurich-core-breakdowns.csv",
  "./data/lg-core-breakdowns.csv",
  "./data/accelerated-maturity-declines.csv",
  "./data/models.json",
  "./data/comparisons-with-waiver.csv",
  "./data/solutionbuilder-observed-2026-11-24.csv",
  "./data/capital-validation-holdout.csv",
  "./data/live-captures-2026-11-22.csv",
  "./data/solutionbuilder-priority-providers-2026-11-20.csv",
  "./data/verified-archive-terms.csv",
  "./data/zurich-illustrated-life.csv",
  "./data/illustration-validation-2026-11-19.csv",
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
