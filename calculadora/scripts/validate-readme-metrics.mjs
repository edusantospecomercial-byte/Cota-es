import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const calculatorDir = join(here, "..");
const documents = {
  "README.md": readFileSync(join(calculatorDir, "README.md"), "utf8"),
  "CALIBRACAO-2026-11-11.md": readFileSync(
    join(calculatorDir, "CALIBRACAO-2026-11-11.md"),
    "utf8",
  ),
};
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

const missing = Object.entries(documents).flatMap(([document, content]) =>
  requiredClaims
    .filter(([, value]) => !content.includes(value))
    .map(([metric, value]) => ({ document, metric, value })),
);
if (missing.length) {
  throw new Error(JSON.stringify({ issue: "README metrics are stale", missing }, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  documentedMetrics: Object.fromEntries(requiredClaims),
}, null, 2));
