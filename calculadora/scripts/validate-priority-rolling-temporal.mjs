import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cutoffs = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];
const calculated = cutoffs.map((cutoff) => {
  const result = spawnSync(
    process.execPath,
    [join(here, "validate-priority-temporal-holdout.mjs"), "--report-only", `--cutoff=${cutoff}`],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  return Object.fromEntries(
    ["cutoff", "trainingAnchors", "laterAnchors", "predicted", "coverage", "mape", "p95", "within20", "maximum", "bias"]
      .map((key) => [key, report[key]]),
  );
});

const catalog = JSON.parse(readFileSync(join(here, "../data/models.json"), "utf8"));
const published = catalog.audit?.priorityProviderRollingTemporalHoldout;
const stale = JSON.stringify(published) !== JSON.stringify(calculated);
const failure = calculated.some((report) =>
  report.predicted < 90 || report.coverage < 0.15 || report.mape > 0.08 ||
  report.p95 > 0.15 || report.within20 < 0.98 || report.maximum > 0.25 ||
  Math.abs(report.bias) > 0.05
);

if (stale || failure) {
  console.error(JSON.stringify({ ok: false, stale, published, calculated }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, method: "rolling forward temporal holdouts", cutoffs: calculated }, null, 2));
