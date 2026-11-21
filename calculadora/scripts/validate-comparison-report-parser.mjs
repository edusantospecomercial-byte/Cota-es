import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extractor = join(here, "extract-priority-comparison-reports.mjs");
const output = execFileSync(process.execPath, [extractor, "--self-test"], {
  encoding: "utf8",
});
const result = JSON.parse(output);
if (!result.ok || result.benefitSummaryCases !== 3)
  throw new Error(JSON.stringify({ issue: "comparison report parser self-test failed", result }));

console.log(JSON.stringify(result, null, 2));
