import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "../app.js"), "utf8");

const checks = {
  removesGenericLowWarning:
    /warnings = warnings\.filter\([\s\S]*?!warning\.startsWith\("Baixa confiança:"\)/.test(app),
  exactOfficialLabel: /"oficial exata"/.test(app),
  partialOfficialLabel: /"oficial parcial"/.test(app),
  validatedMapeLabel:
    /bySegment\?\.nonSmokerLife\?\.mape \* 100/.test(app),
  smokerLimitedSample: /bySegment\?\.smokerLife\?\.tested/.test(app),
  ciValidationPending: /validação pendente para CI/.test(app),
  ciBannerWarning: /malha de CI ainda não possui validação leave-one-out/.test(app),
  smokerSampleWarning: /validação de vida para fumantes ainda usa amostra limitada/.test(app),
  confidenceRenderedSafely:
    /confiança \$\{escapeHtml\(confidenceLabel\)\}/.test(app),
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
