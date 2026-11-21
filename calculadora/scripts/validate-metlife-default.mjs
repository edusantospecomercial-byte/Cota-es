import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "../index.html"), "utf8");
const app = readFileSync(join(here, "../app.js"), "utf8");

const checks = {
  oneCotaSelected: /<option value="1" selected>1 Cota<\/option>/.test(html),
  luxationsSelected: /id="metlifeLux" checked/.test(html),
  visibleDefaultTotal: /id="metlifePreview">£13\.00</.test(html),
  visibleBreakdown: /£11\.00 Essencial \+ £2\.00 Luxações/.test(html),
  essentialPrice: /base: 11 \* c/.test(app),
  luxationsPrice: /lux = \$\("metlifeLux"\)\.checked \? 2 \* c : 0/.test(app),
  childrenPrice: /child = \$\("metlifeChild"\)\.checked \? 2 \* c : 0/.test(app),
  ageEligibility: /age >= 66 && m\.c/.test(app),
  copiedSummaryUsesAdjustedValue: /r\.metlife \|\| metlifeForAge\(ml\(\), p\.age\)/.test(app),
};

if (Object.values(checks).some((value) => !value)) {
  console.error(JSON.stringify({ ok: false, checks }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  default: "1 Cota + Luxações",
  monthly: 13,
  composition: { essential: 11, luxations: 2, children: 0 },
}, null, 2));
