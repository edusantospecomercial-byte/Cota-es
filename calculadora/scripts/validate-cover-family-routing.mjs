import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "../app.js"), "utf8");

const checks = {
  exactFamilyOnly: /model = catalog\.models\[key\] \|\| null/.test(app),
  noCombinedFallback: !/catalog\.models\["life_plus_standalone_ci:standard_core_ci"\] \|\|/.test(app),
  noArbitraryFallback: !/Object\.values\(catalog\.models\)\[0\]/.test(app),
  ciOnlyDisclosure: /Doenças graves sem seguro de vida ainda não têm modelo próprio calibrado/.test(app),
};

if (Object.values(checks).some((value) => !value)) {
  console.error(JSON.stringify({ ok: false, checks }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, supportedFamilies: ["life_only", "life_plus_standalone_ci:standard_core_ci"], ciOnly: "verified provider comparisons when available" }, null, 2));
