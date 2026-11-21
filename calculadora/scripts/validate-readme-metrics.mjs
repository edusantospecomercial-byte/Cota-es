import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const calculatorDir = join(here, "..");
const readme = readFileSync(join(calculatorDir, "README.md"), "utf8");
const catalog = JSON.parse(readFileSync(join(calculatorDir, "data/models.json"), "utf8"));
const audit = catalog.audit ?? {};
const validation = audit.priorityProviderCrossValidation ?? {};
const integerPt = (value) => new Intl.NumberFormat("pt-BR").format(value);
const percentPt = (value) => `${(value * 100).toFixed(2).replace(".", ",")}%`;

const requiredClaims = [
  ["preços prioritários", integerPt(audit.priorityProviderPrices)],
  ["execuções prioritárias", integerPt(audit.priorityProviderScenarios)],
  ["relatórios de comparação", integerPt(audit.comparisonReportArchiveReports)],
  ["preços recuperados", integerPt(audit.comparisonReportArchivePrices)],
  ["testes de interpolação", integerPt(validation.tested)],
  ["MAPE", percentPt(validation.mape)],
  ["P95", percentPt(validation.errorDistribution?.p95)],
];

const missing = requiredClaims.filter(([, value]) => !readme.includes(value));
if (missing.length) {
  throw new Error(JSON.stringify({ issue: "README metrics are stale", missing }, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  documentedMetrics: Object.fromEntries(requiredClaims),
}, null, 2));
