import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "../app.js"), "utf8");
const index = readFileSync(join(here, "../index.html"), "utf8");

const checks = {
  removesGenericLowWarning:
    /warnings = warnings\.filter\([\s\S]*?!warning\.startsWith\("Baixa confiança:"\)/.test(app),
  removesGenericRangeWarning:
    /!warning\.startsWith\("Perfil fora da faixa principal da base:"\)/.test(app) &&
    /!warning\.startsWith\("Perfil ou capital fora da faixa validada"\)/.test(app),
  exactOfficialLabel: /"oficial exata"/.test(app),
  partialOfficialLabel: /"oficial parcial"/.test(app),
  segmentSpecificValidation:
    /"smokerCI"/.test(app) &&
    /"nonSmokerCI"/.test(app) &&
    /"smokerLife"/.test(app) &&
    /"nonSmokerLife"/.test(app),
  validatedMapeLabel: /confidenceMetrics\.mape \* 100/.test(app),
  validatedP95Label: /confidenceMetrics\.p95 \* 100/.test(app),
  limitedSampleThreshold: /confidenceMetrics\.tested \|\| 0\) < 30/.test(app),
  limitedSampleWarning: /A validação deste segmento ainda usa amostra limitada/.test(app),
  aggregateFallbackWarning:
    /Estimativa do modelo histórico agregado; ainda sem interpolação validada das três seguradoras prioritárias/.test(app),
  aggregateFallbackLabel: /modelo histórico agregado/.test(app),
  aggregateFallbackTranslated:
    /low: "baixa"/.test(app) &&
    /medium: "média"/.test(app) &&
    /high: "alta"/.test(app),
  extrapolationWarning:
    /Perfil fora da faixa principal da base: estimativa por extrapolação, com margem ampliada/.test(app),
  confidenceRenderedSafely:
    /confiança \$\{escapeHtml\(confidenceLabel\)\}/.test(app),
  exactSourceTraceability:
    /SolutionBuilder ref\. \$\{escapeHtml\(r\.providerQuotes\[0\]\.modelId\)\}/.test(app) &&
    /r\.providerQuotes\[0\]\.sourceDate/.test(app),
  interpolatedSourceTraceability:
    /Interpolação de múltiplas âncoras oficiais do SolutionBuilder/.test(app),
  underwritingInputsDisclosed:
    /Peso, altura e profissão são informativos/.test(index) &&
    /loading médico ou ocupacional automático/.test(index),
};

if (Object.values(checks).some((value) => !value)) {
  console.error(JSON.stringify({ ok: false, checks }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  priorityConfidence: {
    exact: "oficial exata",
    interpolated: "validated MAPE",
    partial: "oficial parcial",
  },
}, null, 2));
