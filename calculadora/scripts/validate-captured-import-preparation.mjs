import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(
  execFileSync(process.execPath, [join(here, "prepare-captured-priority-import.mjs")], {
    encoding: "utf8",
  }),
);
const classified =
  report.readyScenarios +
  report.pendingScenarios +
  report.unavailableScenarios +
  report.duplicateScenarios;
const checks = {
  ok: report.ok === true,
  allScenariosClassified: classified === report.scenarios,
  threePricesPerReadyScenario: report.readyPrices === report.readyScenarios * 3,
  readOnly: report.writesPerformed === false,
};

if (Object.values(checks).some((value) => !value)) {
  console.error(JSON.stringify({ ok: false, checks, report }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks, report }, null, 2));
