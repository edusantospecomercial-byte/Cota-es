import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// This is the published version immediately before the prospective collection.
const reference = "804dc0a";
const root = fileURLToPath(new URL("../../", import.meta.url));
const before = file => execFileSync("git", ["show", reference + ":calculadora/" + file],
  { cwd: root, encoding: "utf8", maxBuffer: 10_000_000 });
const fields = new Map();
function node(id) {
  if (!fields.has(id)) fields.set(id, { value: "0", checked: false, addEventListener() {},
    classList: { add() {}, remove() {} } });
  return fields.get(id);
}
const context = vm.createContext({
  document: { getElementById: node, querySelector: () => node("selected"), querySelectorAll: () => [] },
  window: {}, localStorage: { getItem: () => null },
  fetch: async relative => {
    const contents = before(relative.replace(/^\.\//, ""));
    return { ok: true, text: async () => contents, json: async () => JSON.parse(contents) };
  },
});
for (const script of ["calibration.js", "app.js"]) {
  await vm.runInContext(before(script), context);
}
const parse = vm.runInContext("parsePriorityCsv", context);
const getRows = name => parse(readFileSync(new URL("../data/" + name, import.meta.url), "utf8"));
const reports = getRows("solutionbuilder-observed-2026-11-24.csv");
const byId = new Map(reports.map(r => [r.model_id + "|" + r.provider, r]));
const predictions = getRows("capital-validation-holdout.csv");
const prior = vm.runInContext("priorityQuotesFor", context);
const comparisons = [];
for (const trial of predictions) {
  const [lo, hi, r] = [trial.lower_model_id, trial.upper_model_id, trial.holdout_model_id]
    .map(id => byId.get(id + "|" + trial.provider));
  if (![lo, hi, r].every(row => row && row.available === "true" &&
      row.quoted_life_cover === row.life_cover && row.quoted_critical_illness_cover === row.critical_illness_cover &&
      row.product === r.product && row.quoted_term === r.quoted_term && row.occupation_rated === r.occupation_rated)) continue;
  const input = { age: +r.age, smoker: r.smoker === "Yes" ? "smoker" : "non_smoker", life: +r.life_cover,
    ci: +r.critical_illness_cover, toAge: +r.to_age, term: +r.to_age - +r.age };
  const previous = prior(input).quotes.find(q => q.provider === trial.provider);
  if (!previous) continue;
  const actual = Number(r.monthly_premium);
  comparisons.push({ old: Math.abs(previous.premium - actual),
    updated: Math.abs(Number(trial.predicted_monthly) - actual), actual });
}
function metrics(key) {
  if (!comparisons.length) return null;
  return { maeGBP: comparisons.reduce((n, c) => n + c[key], 0) / comparisons.length,
    mapePercent: 100 * comparisons.reduce((n, c) => n + c[key] / c.actual, 0) / comparisons.length };
}
console.log(JSON.stringify({ reference, prospectivePredictions: predictions.length,
  sameInsurerComparisons: comparisons.length, priorModel: metrics("old"),
  newBlindPredictions: metrics("updated") }, null, 2));
