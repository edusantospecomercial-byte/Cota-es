import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const nodes = new Map();
for (const [, tag] of html.matchAll(/<([a-z][a-z\d]*\b[^<>]*\bid="[^"]+"[^<>]*)>/gi)) {
  const id = tag.match(/\bid="([^"]+)"/)[1];
  nodes.set(id, {
    value: tag.match(/\bvalue="([^"]+)"/)?.[1] || "",
    checked: /\bchecked\b/.test(tag),
    classList: { add() {}, remove() {} },
    addEventListener(event, handler) { this[event] = handler; },
    scrollIntoView() {},
  });
}
const node = id => {
  assert.ok(nodes.has(id), `Missing #${id}`);
  return nodes.get(id);
};
const ctx = vm.createContext({
  document: {
    getElementById: node,
    querySelector: selector => node(selector.includes("smoker") ? "nonSmoker" : "age65"),
    querySelectorAll: () => [],
  },
  window: {}, setTimeout() {}, localStorage: { getItem: () => null },
  fetch: async url => {
    const text = readFileSync(new URL("../" + url, import.meta.url), "utf8");
    return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
  },
});
const run = code => vm.runInContext(code, ctx);
for (const script of ["calibration.js", "app.js"])
  await run(readFileSync(new URL("../" + script, import.meta.url), "utf8"));

Object.entries({ age: 50, life: 50000, ci: 0, occupation: "Events Manager",
  weight: 82, height: 162, metlifeCotas: 1 }).forEach(([id, value]) => node(id).value = String(value));
node("waiver").checked = true;
const simulate = () => {
  node("form").submit({ preventDefault() {} });
  assert.equal(node("coverError").textContent, "");
  return run("lastPayload.result");
};
const quoted = simulate();
assert.equal(node("totalPrice").textContent, "£24.07/mês");
assert.equal(quoted.provider, "Aviva");
for (const value of ["£23.72", "£24.07", "£24.46", "14 anos de prazo", "até 65 anos"]) {
  assert.ok(quoted.text.includes(value), value);
  assert.ok(node("details").innerHTML.includes(value), value);
}
const evidence = run("waiverRows");
const captures = run("observedRows");
const group = (rows, key) => {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return groups;
};
const reports = group(evidence, "sha256");
assert.ok(reports.size > 0);
for (const [hash, rows] of reports) {
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(Array.from(rows, r => r.provider).sort(), ["Aviva", "Legal & General", "Zurich"]);
  assert.equal(new Set(rows.map(r => [r.source_date,r.age,r.to_age,r.life_cover,r.smoker].join("|"))).size, 1);
  for (const r of rows) {
    assert.ok(Number(r.monthly_premium) > 0);
    assert.match(r.waiver_to, /^(Expiry|\d+)$/);
    assert.match(r.quoted_term, /^(To Age \d+|\d+ years?)$/);
  }
}
const profiles = new Set(evidence.map(r => [r.age, r.to_age, r.life_cover, r.smoker].join("|")));
let resolvedProfiles = 0;
for (const key of profiles) {
  const [age, end, capital, smoker] = key.split("|");
  ctx.profile = { age: +age, toAge: +end, life: +capital, ci: 0,
    smoker: smoker === "True" ? "smoker" : "non_smoker" };
  const match = run("waiverComparisonFor(profile)");
  const rows = evidence.filter(r => [r.age, r.to_age, r.life_cover, r.smoker].join("|") === key);
  const newest = rows.map(r => r.source_date).sort().at(-1);
  const reportsOnDate = group(rows.filter(r => r.source_date === newest), "sha256");
  const signatures = new Set(Array.from(reportsOnDate.values(), items => items.map(r =>
    [r.provider, r.monthly_premium, r.quoted_term, r.waiver_to].join("|")).sort().join(";")));
  if (signatures.size > 1) {
    assert.match(match.note, /divergem/);
    assert.equal(match.quotes, undefined);
  } else {
    assert.equal(match.exact, true);
    assert.ok(match.sameEndAge.length);
    assert.ok(match.quotes.every(q => q.sourceDate === newest && reportsOnDate.has(q.modelId)));
    resolvedProfiles++;
  }
}
const illustration = run("parsePriorityCsv")(readFileSync(
  new URL("../data/illustration-validation-2026-11-19.csv", import.meta.url), "utf8"));
const aviva = illustration.find(r => r.sha256 === "0354473307545752f9cc0a0e21243ef73cfa827d4efd954ded0376b20a8e05d3");
assert.equal(Math.round((Number(aviva.base_life_monthly) + Number(aviva.optional_monthly)) * 100), 1107);
assert.equal(quoted.providerQuotes.find(q => q.provider === "Aviva").premium, Number(aviva.total_monthly));
node("life").value = "51234";
assert.equal(simulate().waiverPending, true);
assert.equal(node("totalPrice").textContent, "A confirmar");
node("waiver").checked = false;
assert.equal(simulate().complete, true);
assert.equal(run("lastPayload.life"), 51234);
node("life").value = "0";
node("ci").value = "10000";
assert.equal(simulate().supported, false);
assert.equal(node("totalPrice").textContent, "A confirmar");
assert.ok(node("metlifeResult").textContent.includes("£13.00"));

const scenarios = group(captures, "model_id");
assert.ok(scenarios.size > 0);
const historicComparison = [];
for (const rows of scenarios.values()) {
  const row = rows[0];
  assert.equal(rows.length, 3);
  ctx.profile = { age: +row.age, toAge: +row.to_age, life: +row.life_cover,
    ci: +row.critical_illness_cover, smoker: row.smoker === "Yes" ? "smoker" : "non_smoker" };
  const result = run("priorityQuotesFor(profile)");
  assert.equal(result.exact, true);
  assert.deepEqual(Array.from(result.quotes, q => q.provider).sort(), ["Aviva", "Legal & General", "Zurich"]);
  ctx.original = captures;
  run("observedRows = []");
  const previous = run("priorityQuotesFor(profile)");
  run("observedRows = original");
  for (const r of rows) {
    const actual = Number(r.monthly_premium);
    const current = result.quotes.find(q => q.provider === r.provider);
    assert.equal(current.premium, actual);
    assert.equal(current.modelId, r.model_id);
    const reference = previous.quotes.find(q => q.provider === r.provider);
    if (reference) historicComparison.push(Math.abs(reference.premium - actual) / actual);
  }
}
console.log(JSON.stringify({ verifiedReportsWithWaiver: reports.size, resolvedProfiles,
  conflictingProfiles: profiles.size - resolvedProfiles, verifiedAdditionalCaptures: captures.length,
  previouslyComparablePrices: historicComparison.length,
  previousMapeOnComparableCaptures: historicComparison.length ?
    historicComparison.reduce((a, b) => a + b, 0) / historicComparison.length : null }));

const reported = run("reportedRows");
const verifiedReports = group(reported, "model_id");
const keys = new Set();
for (const [id, rows] of verifiedReports) {
  const first = rows[0];
  const key = [first.age, first.smoker, first.to_age, first.life_cover, first.critical_illness_cover].join("|");
  assert.ok(!keys.has(key), "Duplicate scenario " + key);
  keys.add(key);
  assert.deepEqual(Array.from(rows, r => r.provider).sort(), ["Aviva", "Legal & General", "Zurich"]);
  assert.equal(new Set(rows.map(r => r.sha256)).size, 1);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  ctx.profile = { age: +first.age, smoker: first.smoker === "Yes" ? "smoker" : "non_smoker",
    toAge: +first.to_age, life: +first.life_cover, ci: +first.critical_illness_cover };
  const result = run("capturedReportFor(profile)");
  assert.equal(result.modelId, id);
  assert.equal(result.quotes.length, rows.filter(r => r.available === "true").length);
  for (const q of result.quotes) {
    const r = rows.find(row => row.provider === q.provider);
    assert.equal(q.premium, +r.monthly_premium);
    assert.equal(q.differentCapital, +r.quoted_life_cover !== +r.life_cover ||
      +r.quoted_critical_illness_cover !== +r.critical_illness_cover);
    if (q.differentCapital) assert.ok(!result.sameEndAge?.includes(q));
  }
  for (const row of rows.filter(r => r.available === "false")) {
    assert.ok(row.unavailable_reason);
    assert.equal(row.monthly_premium, "");
    assert.ok(result.gap.reason.includes(row.provider));
  }
}

const calculate = (toAge, life, ci, extra = {}) => {
  ctx.inputs = { age: 50, smoker: "non_smoker", toAge, term: toAge - 50, life, ci, ...extra };
  run("render({...payload(), ...inputs})");
  return run("lastPayload.result");
};
const liveExact = calculate(75, 50000, 10000);
assert.equal(liveExact.main, 27.04);
assert.equal(liveExact.priorityExact, true);
assert.ok(liveExact.text.includes("24 anos de prazo"));
const alteredCapital = calculate(65, 50000, 5000);
assert.ok(alteredCapital.text.includes("£5,068.00"));
assert.notEqual(alteredCapital.provider, "Aviva");
const allUnavailable = calculate(85, 50000, 10000);
assert.equal(allUnavailable.complete, false);
assert.ok(allUnavailable.text.includes("três seguradoras ficaram sem preço"));
assert.equal(node("totalPrice").textContent, "A confirmar");
const interpolated = calculate(85, 62873, 0);
assert.equal(interpolated.capitalRange, true);
assert.equal(interpolated.priorityExact, false);
assert.ok(interpolated.text.includes("cotação independente"));
assert.ok(interpolated.text.includes("34 anos de prazo"));
assert.ok(!calculate(85, 62873, 0, {smoker: "smoker"}).capitalRange);
assert.ok(!calculate(85, 62873, 0, {age: 51, term: 34}).capitalRange);
assert.ok(!calculate(85, 1950, 0).capitalRange);
const heldOut = run("validatedCapitalRanges");
assert.ok(heldOut.length >= 36);
const errors = heldOut.map(({lower, upper, check}) => {
  const predict = run("priceAlongCapital")(lower, upper, +check.life_cover);
  return Math.abs(predict - +check.monthly_premium);
});
console.log(JSON.stringify({comparisonReports: keys.size, actualPrices: reported.filter(r => r.available === "true").length,
  providerHoldoutsInUse: heldOut.length, meanAbsoluteErrorGBP: errors.reduce((a, b) => a + b, 0) / errors.length,
  maximumAbsoluteErrorGBP: Math.max(...errors)}));
