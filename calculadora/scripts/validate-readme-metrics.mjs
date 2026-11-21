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
const temporal = audit.priorityProviderTemporalHoldout ?? {};
const rolling = audit.priorityProviderRollingTemporalHoldout ?? [];
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
  ["previsões temporais", integerPt(temporal.predicted)],
  ["cobertura temporal", percentPt(temporal.coverage)],
  ["MAPE temporal", percentPt(temporal.mape)],
  ["menor MAPE temporal móvel", percentPt(Math.min(...rolling.map((report) => report.mape)))],
  ["maior MAPE temporal móvel", percentPt(Math.max(...rolling.map((report) => report.mape)))],
  ["testes abaixo de £10", integerPt(validation.byPremiumBand?.under10?.tested)],
  ["MAPE abaixo de £10", percentPt(validation.byPremiumBand?.under10?.mape)],
  ["testes de £10 a £24,99", integerPt(validation.byPremiumBand?.from10To25?.tested)],
  ["MAPE de £10 a £24,99", percentPt(validation.byPremiumBand?.from10To25?.mape)],
  ["testes a partir de £25", integerPt(validation.byPremiumBand?.atLeast25?.tested)],
  ["MAPE a partir de £25", percentPt(validation.byPremiumBand?.atLeast25?.mape)],
  ["testes abaixo de 40 anos", integerPt(validation.byAgeBand?.under40?.tested)],
  ["MAPE abaixo de 40 anos", percentPt(validation.byAgeBand?.under40?.mape)],
  ["testes de 40 a 54 anos", integerPt(validation.byAgeBand?.from40To54?.tested)],
  ["MAPE de 40 a 54 anos", percentPt(validation.byAgeBand?.from40To54?.mape)],
  ["testes a partir de 55 anos", integerPt(validation.byAgeBand?.atLeast55?.tested)],
  ["MAPE a partir de 55 anos", percentPt(validation.byAgeBand?.atLeast55?.mape)],
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
