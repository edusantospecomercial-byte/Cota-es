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
const completeEvidence = run("waiverRows");
const evidence = run("waiverRows.concat(individualWaivers)");
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
  const providers = Array.from(rows, r => r.provider).sort();
  if (completeEvidence.some(row => row.sha256 === hash)) {
    assert.deepEqual(providers, ["Aviva", "Legal & General", "Zurich"]);
  } else {
    assert.ok(providers.length >= 1 && providers.length <= 3);
    assert.equal(new Set(providers).size, providers.length);
    assert.ok(providers.every(provider => ["Aviva", "Legal & General", "Zurich"].includes(provider)));
  }
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
  } else if (![...reportsOnDate.values()].flat().some(row => row.quoted_term === `To Age ${end}`)) {
    assert.match(match.note, /idade de término/);
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
assert.equal(simulate().main, 9.86);
assert.equal(node("totalPrice").textContent, "£22.86/mês");
node("age").value = "39";
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
  profilesRequiringConfirmation: profiles.size - resolvedProfiles, verifiedAdditionalCaptures: captures.length,
  previouslyComparablePrices: historicComparison.length,
  previousMapeOnComparableCaptures: historicComparison.length ?
    historicComparison.reduce((a, b) => a + b, 0) / historicComparison.length : null }));

const reported = run("reportedRows");
const verifiedReports = group(reported, "model_id");
assert.ok(node("baseStatus").textContent.includes(verifiedReports.size + " cenários"));
assert.ok(node("baseStatus").textContent.includes(reported.filter(r => r.available === "true").length + " mensalidades"));
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
  for (const row of rows.filter(r => r.available === "unknown")) {
    assert.equal(row.unavailable_reason, "product_not_listed");
    assert.equal(row.monthly_premium, "");
    assert.equal(result.quotes.length, 2);
    assert.ok(result.gap.reason.includes(row.provider));
    assert.ok(result.gap.reason.includes("Disponibilidade a confirmar"));
  }
}

const verifiedArchive = run("verifiedArchiveRows");
assert.ok(verifiedArchive.length > 0 && verifiedArchive.every(r => r.quoted_term && /^[a-f0-9]{64}$/.test(r.sha256)));
assert.ok(run("priorityRows").every(r => r.profile !== "Comparison Report Archive"));
assert.ok(run("priorityGapRows").every(r => r.profile !== "Comparison Report Archive"));
const calculate = (toAge, life, ci, extra = {}) => {
  ctx.inputs = { age: 50, smoker: "non_smoker", toAge, term: toAge - 50, life, ci, ...extra };
  run("render({...payload(), ...inputs})");
  return run("lastPayload.result");
};
const archiveWithDisability = calculate(70, 200000, 0, { age: 62, term: 8 });
assert.equal(archiveWithDisability.provider, "Zurich");
assert.equal(archiveWithDisability.main, 71.66);
assert.ok(archiveWithDisability.text.includes("7 anos de prazo · inclui incapacidade permanente para a própria profissão"));
assert.ok(archiveWithDisability.providerQuotes.some(q => q.provider === "Legal & General" && q.premium === 73.92));
const comparedArchive = calculate(65, 500000, 0, { age: 46, term: 19 });
assert.equal(comparedArchive.provider, "Zurich");
assert.equal(comparedArchive.main, 49.28);
assert.ok(comparedArchive.text.includes("18 anos de prazo"));
const liveExact = calculate(75, 50000, 10000);
assert.equal(liveExact.main, 27.04);
assert.equal(liveExact.priorityExact, true);
assert.ok(liveExact.text.includes("24 anos de prazo"));
const standalone = calculate(70, 0, 12345);
assert.equal(standalone.capitalRange, true);
assert.ok(standalone.text.includes("capitais de doenças graves"));
assert.ok(!node("warning").textContent.includes("ainda não têm modelo"));
const unavailableCI = calculate(80, 0, 10000);
assert.equal(unavailableCI.supported, false);
assert.ok(!unavailableCI.text.includes("valor de referência vem do modelo geral"));
const underMinimum = calculate(65, 10000, 0);
assert.equal(underMinimum.complete, false);
assert.ok(underMinimum.providerQuotes.every(q => q.differentCapital));
assert.ok(underMinimum.text.includes("Faixa das alternativas devolvidas"));
assert.equal(node("totalPrice").textContent, "A confirmar");
const budgetAlternative = calculate(65, 30000, 5000, {age:31, term:34, smoker:"non_smoker"});
assert.equal(budgetAlternative.complete, false);
assert.equal(node("alternativePackage").hidden, false);
for (const expected of ["Zurich", "£40,062.00", "£5,570.00", "até os 65 anos", "£7.50", "£13.00", "£20.50/mês"]) {
  assert.ok(node("alternativePackage").textContent.includes(expected), expected);
  assert.ok(budgetAlternative.text.includes(expected), expected);
}
calculate(65, 55000, 12000, {age:31, term:34, smoker:"non_smoker"});
assert.equal(node("alternativePackage").hidden, true);
assert.equal(node("alternativePackage").textContent, "");
assert.ok(!calculate(65, 30000, 5000, {age:31,term:34,waiver:"Yes"}).alternativePackage);
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
// The £75k life-only holdout verified Zurich. The other two providers
// raised the sum insured at the £50k anchor, so their prices cannot be inferred.
const age31 = {age: 31, term: 34};
const liveReportRows = run("reportedRows");
const liveCapitalRanges = run("validatedCapitalRanges");
ctx.partialRangeIds = ["35041241", "35041242", "35041247", "35041273", "35041288", "35041304"];
run("reportedRows = reportedRows.filter(row => partialRangeIds.includes(row.model_id)); validatedCapitalRanges = validatedCapitalRanges.filter(r => partialRangeIds.includes(r.check.model_id));");
const oneCarrier = calculate(65, 65000, 0, age31);
assert.equal(oneCarrier.capitalRange, true);
assert.equal(oneCarrier.complete, true);
assert.deepEqual(Array.from(oneCarrier.providerQuotes, q => q.provider), ["Zurich"]);
assert.equal(oneCarrier.main.toFixed(2), "5.93");
assert.ok(oneCarrier.text.includes("Sem estimativa validada nesse intervalo para Legal & General e Aviva"));
const twoCarriers = calculate(65, 83000, 10000, age31);
assert.equal(twoCarriers.capitalRange, true);
assert.deepEqual(Array.from(twoCarriers.providerQuotes, q => q.provider).sort(), ["Legal & General", "Zurich"]);
assert.equal(twoCarriers.provider, "Zurich");
ctx.savedReported = liveReportRows;
ctx.savedRanges = liveCapitalRanges;
run("reportedRows = savedReported; validatedCapitalRanges = savedRanges;");
const tpdReference = calculate(70, 10000, 10000, {age:57, smoker:"smoker", term:13});
assert.equal(node("tpdComparison").hidden, false);
assert.ok(node("tpdSource").textContent.includes("1080433474"));
const tpdList = node("tpdOffers").innerHTML;
assert.match(tpdList, /Aviva<\/dt><dd><b>£40\.98\/mês<\/b>[^<]*diagnóstico independente £10,000\.00/);
assert.match(tpdList, /Legal &amp; General<\/dt><dd><b>£46\.30\/mês<\/b>[^<]*12 anos de prazo[^<]*vida ou diagnóstico £10,000\.00[^<]*preço depende da profissão/);
assert.match(tpdList, /Zurich<\/dt><dd><b>£50\.19\/mês<\/b>[^<]*diagnóstico independente £10,000\.00/);
assert.ok(!tpdReference.text.includes("1080433474"));
calculate(65, 10000, 10000, {age:57, smoker:"smoker", term:8});
assert.equal(node("tpdComparison").hidden, true);
const regular = calculate(65, 75000, 15000, {age:31, smoker:"non_smoker", term:34});
assert.equal(regular.main, 12.09);
assert.equal(node("tpdComparison").hidden, false);
for (const price of ["£12.22", "£12.04", "£13.82"]) assert.ok(node("tpdOffers").innerHTML.includes(price));

const variantRows = run("acceleratedOffers");
const breakdowns = run("coreBreakdowns");
const penny = value => Math.round(Number(value) * 100);
for (const [key, part] of breakdowns) {
  const offer = variantRows.find(row => row.provider + "|" + row.sha256 === key);
  assert.equal(part.comparison_sha256, offer?.sha256);
  assert.ok(offer);
  assert.equal(part.reference, offer.reference);
  assert.equal(part.source_date, offer.source_date);
  assert.equal(part.age, offer.age);
  assert.equal(part.smoker, offer.smoker);
  assert.equal(part.to_age, offer.to_age);
  assert.equal(part.life_cover, offer.quoted_life_cover);
  assert.equal(part.earlier_ci_cover, offer.quoted_earlier_ci_cover);
  assert.equal(part.total_monthly, offer.monthly_premium);
  if (offer.provider === "Legal & General") {
    assert.equal(offer.quoted_term, part.term_years + " years");
    assert.equal(penny(part.life_policy_monthly) + penny(part.earlier_ci_policy_monthly), penny(offer.monthly_premium));
    continue;
  }
  assert.equal(penny(part.life_monthly) + penny(part.earlier_ci_monthly) + penny(part.waiver_monthly) + penny(part.tpd_monthly) - penny(part.discount_monthly || 0),
    penny(offer.monthly_premium));
}
calculate(65, 50000, 20000, {age: 40, term: 25});
assert.ok(node("acceleratedSource").textContent.includes("1075018233"));
assert.ok(node("acceleratedOffers").innerHTML.includes("vida adicional £6.25 + vida ou diagnóstico £13.94 + isenção £0.62 + incapacidade permanente £0.28 − desconto por múltiplas apólices £2.50"));
calculate(65, 50000, 10000, {age: 40, smoker: "smoker", term: 25});
assert.ok(node("acceleratedSource").textContent.includes("1081288679"));
assert.ok(node("acceleratedOffers").innerHTML.includes("Mensalidade cobrada por apólice neste pacote · vida adicional £11.63 + vida ou diagnóstico £10.64"));
const variantKeys = new Set();
for (const row of variantRows) {
  const key = [row.reference, row.provider].join("|");
  assert.ok(!variantKeys.has(key));
  variantKeys.add(key);
  assert.match(row.sha256, /^[0-9a-f]{64}$/);
  assert.ok(["Zurich", "Legal & General", "Aviva"].includes(row.provider));
  assert.ok(Number(row.age) < Number(row.to_age) && Number(row.quoted_earlier_ci_cover) > 0 &&
    (Number(row.life_cover) > 0 ? Number(row.quoted_life_cover) > 0 : row.quoted_life_cover === "0") &&
    Number(row.monthly_premium) > 0);
  assert.ok(["Own", "Specified", "FATs"].includes(row.tpd_basis));
}
calculate(65, 0, 20000, { age: 47, term: 18, smoker: "smoker" });
assert.equal(node("acceleratedComparison").hidden, false);
assert.equal(node("tpdComparison").hidden, true);
for (const detail of ["£29.45", "£31.75", "£33.64", "vida ou diagnóstico £20,000.00", "17 anos de prazo"])
  assert.ok(node("acceleratedOffers").innerHTML.includes(detail), detail);
assert.ok(!node("acceleratedOffers").innerHTML.includes("vida £0.00"));
assert.ok(node("acceleratedSource").textContent.includes("1083439983"));
assert.ok(node("acceleratedOffers").innerHTML.includes("vida ou diagnóstico £28.98 + isenção £0.18 + incapacidade permanente £0.29"));
const independent = calculate(65, 100000, 10000, age31);
assert.equal(independent.main, 11.08);
assert.equal(node("acceleratedComparison").hidden, false);
for (const label of ["£11.21", "£11.69", "£13.33", "£10,557.00", "preço depende da profissão"]) {
  assert.ok(node("acceleratedOffers").innerHTML.includes(label), label);
}
assert.ok(!independent.text.includes("£11.21"));
ctx.accelInputs = {age:31, smoker:"non_smoker", toAge:65, life:100000, ci:20000, waiver:"No"};
run("renderCiComparison(accelInputs)");
assert.ok(node("acceleratedSource").textContent.includes("1084937859"));
assert.ok(node("acceleratedOffers").innerHTML.includes("£17.77"));
run('renderCiComparison({...accelInputs,waiver:"Yes"})');
assert.ok(node("acceleratedSource").textContent.includes("1084937863"));
assert.ok(node("acceleratedOffers").innerHTML.includes("£17.81"));
assert.ok(node("acceleratedOffers").innerHTML.includes("prazo de isenção sem confirmação"));

calculate(65, 50000, 10000, {age: 49, term: 16});
assert.ok(node("acceleratedOffers").innerHTML.includes("£20.41"));
assert.ok(node("acceleratedOffers").innerHTML.includes("vida adicional £10.34 + vida ou diagnóstico £9.83 + isenção £0.14 + incapacidade permanente £0.10"));
assert.ok(node("acceleratedSource").textContent.includes("2026-11-25"));
calculate(65, 50000, 0, age31);
assert.equal(node("acceleratedComparison").hidden, true);
assert.equal(node("capitalAccuracy").hidden, false);
assert.ok(node("capitalAccuracyScope").textContent.includes("31 anos, não fumante"));
assert.ok(node("capitalAccuracyScope").textContent.includes("50 anos, não fumante"));
const denominators = node("capitalAccuracySummary").textContent.match(/^(\d+) de (\d+) previsões/);
assert.ok(denominators && Number(denominators[1]) < Number(denominators[2]));
const heldOut = run("validatedCapitalRanges");
assert.ok(heldOut.length >= 36);
const errors = heldOut.map(({lower, upper, check, axis}) => {
  const predict = run("priceAlongCapital")(lower, upper, +check[axis]);
  return Math.abs(predict - +check.monthly_premium);
});
console.log(JSON.stringify({comparisonReports: keys.size, actualPrices: reported.filter(r => r.available === "true").length,
  providerHoldoutsInUse: heldOut.length, meanAbsoluteErrorGBP: errors.reduce((a, b) => a + b, 0) / errors.length,
  maximumAbsoluteErrorGBP: Math.max(...errors)}));

const frozen = run("parsePriorityCsv")(readFileSync(
  new URL("../data/capital-validation-holdout.csv", import.meta.url), "utf8"));
const reportFor = new Map(reported.map(r => [r.model_id + "|" + r.provider, r]));
const allErrors = [];
const distinctTests = new Set();
let changedOffer = 0;
for (const trial of frozen) {
  const entries = [trial.lower_model_id, trial.upper_model_id, trial.holdout_model_id]
    .map(id => reportFor.get(id + "|" + trial.provider));
  const [lower, upper, actual] = entries;
  assert.ok(entries.every(Boolean), "Each prediction must link to all three original reports");
  const key = [trial.lower_model_id, trial.upper_model_id, trial.holdout_model_id, trial.provider].join("|");
  assert.ok(!distinctTests.has(key), "Duplicate prospective test " + key);
  distinctTests.add(key);
  assert.ok(+actual.model_id > Math.max(+lower.model_id, +upper.model_id));
  assert.ok(actual.source_date >= lower.source_date && actual.source_date >= upper.source_date);
  const axis = run("capitalAxis")(lower, upper);
  const fixed = axis === "life_cover" ? "critical_illness_cover" : "life_cover";
  assert.ok(+lower[axis] < +actual[axis] && +actual[axis] < +upper[axis]);
  for (const field of ["age", "smoker", "to_age", fixed, "provider"]) {
    assert.equal(lower[field], actual[field]);
    assert.equal(upper[field], actual[field]);
  }
  const prediction = Number(trial.predicted_monthly);
  assert.ok(Number.isFinite(prediction) && prediction > 0);
  assert.ok(Math.abs(run("priceAlongCapital")(lower, upper, +actual[axis]) - prediction) <= .000051);
  if (entries.some(r => r.available !== "true" || r.quoted_life_cover !== r.life_cover ||
      r.quoted_critical_illness_cover !== r.critical_illness_cover ||
      ["product", "quoted_term", "occupation_rated"].some(field => r[field] !== lower[field]))) {
    changedOffer++;
    continue;
  }
  const error = Math.abs(prediction - Number(actual.monthly_premium));
  allErrors.push({ error, relative: error / Number(actual.monthly_premium), actual });
}
function measure(trials) {
  return {
    n: trials.length,
    maeGBP: trials.reduce((sum, t) => sum + t.error, 0) / trials.length,
    mapePercent: 100 * trials.reduce((sum, t) => sum + t.relative, 0) / trials.length,
    withinOnePound: trials.filter(t => t.error <= 1).length,
    withinFivePercent: trials.filter(t => t.relative <= .05).length,
    withinBoth: trials.filter(t => t.error <= 1 && t.relative <= .05).length,
    maxErrorGBP: Math.max(...trials.map(t => t.error)),
  };
}
assert.equal(allErrors.length + changedOffer, frozen.length);
console.log(JSON.stringify({
  predictionsRecordedBeforeCollection: frozen.length, changedOffer,
  distinctQuotedScenarios: new Set(allErrors.map(t => t.actual.model_id)).size,
  allComparablePredictions: measure(allErrors),
  byInsurer: Object.fromEntries(["Zurich", "Legal & General", "Aviva"].map(provider =>
    [provider, measure(allErrors.filter(t => t.actual.provider === provider))])),
}));

const illustratedRows = run("illustratedLifeRows");
assert.ok(illustratedRows.length > 0);
for (const row of illustratedRows) {
  const pennies = field => Math.round(Number(row[field]) * 100);
  assert.match(row.sha256, /^[a-f0-9]{64}$/);
  assert.ok(+row.to_age > +row.age && +row.life_cover > 0 && +row.policy_count >= 1);
  assert.equal(pennies("base_monthly") + pennies("additional_monthly") - pennies("discount_monthly"),
    pennies("policy_monthly"));
}
const lgSmoker = calculate(70, 20000, 0, {age:59, smoker:"smoker", term:11});
for (const term of ["10 anos", "£23.94", "£0.72", "£24.66", "1082481714"]) {
  assert.ok(lgSmoker.lgTermNote.includes(term));
  assert.ok(lgSmoker.text.includes(term));
  assert.ok(node("details").innerHTML.includes(term));
}
assert.ok(!calculate(65, 20000, 0, {age:59, smoker:"smoker", term:6}).lgTermNote?.includes("1082481714"));
assert.ok(!calculate(70, 20000, 0, {age:59, smoker:"non_smoker", term:11}).lgTermNote?.includes("1082481714"));
assert.ok(!calculate(70, 20000, 10000, {age:59, smoker:"smoker", term:11}).lgTermNote);
for (const row of run("lgIllustratedTerms")) {
  const fee = f => Math.round(100 * Number(row[f]));
  assert.equal(fee("base_monthly") + fee("waiver_monthly"), fee("policy_monthly"));
  assert.ok([0, 1].includes(Number(row.to_age) - Number(row.age) - Number(row.term_years)));
  assert.match(row.comparison_sha256, /^[a-f0-9]{64}$/);
  assert.match(row.sha256, /^[a-f0-9]{64}$/);
}
const avivaSmoker = calculate(70, 20000, 0, {age:57, smoker:"smoker", term:13});
for (const sum of ["£22.82", "£0.24", "£23.06"]) {
  assert.ok(avivaSmoker.componentNote.includes(sum));
  assert.ok(node("details").innerHTML.includes(sum));
}
assert.ok(!calculate(70, 20000, 0, {age:57, smoker:"non_smoker", term:13}).componentNote?.includes("1081446898"));
for (const row of illustratedRows.filter(r => r.provider === "Aviva")) {
  assert.match(row.comparison_sha256, /^[a-f0-9]{64}$/);
  assert.ok(row.sha256 !== row.comparison_sha256);
}
const profileWithIllustration = { age: 65, smoker: "non_smoker", toAge: 80, life: 20000, ci: 0 };
ctx.inputs = profileWithIllustration;
const verifiedLife = run("illustratedLifeFor(inputs)");
assert.equal(verifiedLife.base_monthly, "17.92");
assert.equal(verifiedLife.policy_monthly, "18.52");
assert.equal(verifiedLife.policy_count, "1");
assert.equal(run('illustratedLifeFor({...inputs, waiver:"Yes"})'), null);
assert.equal(run("illustratedLifeFor({...inputs, ci:10000})"), null);
const profileGroups = group(illustratedRows.map(r => ({...r,
  key: [r.age, r.smoker, r.to_age, r.life_cover].join("|")})), "key");
let individualMatches = 0, multiPolicyReferences = 0;
for (const rows of profileGroups.values()) {
  const first = rows[0];
  const response = calculate(+first.to_age, +first.life_cover, 0, {
    age: +first.age, smoker: first.smoker === "Yes" ? "smoker" : "non_smoker", term: +first.to_age - +first.age
  });
  if (response.illustratedBase) {
    assert.ok(["Zurich", "Aviva"].includes(response.provider));
    assert.ok(response.text.includes("antes de adicionais e descontos"));
    assert.ok(response.illustrationNote);
    assert.ok(!response.priorityExact);
    individualMatches++;
  }
  if (response.illustrationNote?.includes("outras apólices")) {
    assert.ok(!response.illustratedBase);
    multiPolicyReferences++;
  }
}
assert.ok(individualMatches && multiPolicyReferences);
console.log(JSON.stringify({itemisedLifeRecords: illustratedRows.length, matchedIndividualProfiles: individualMatches,
  matchedMultiPolicyReferences: multiPolicyReferences}));

ctx.inputs = { age: 65, smoker: "non_smoker", life: 20000, ci: 0, toAge: 80 };
assert.equal(run("documentedLookupPrice(inputs, 17.92)"), true);
assert.equal(run("documentedLookupPrice(inputs, 18.52)"), false);
ctx.inputs = { age: 50, smoker: "non_smoker", life: 50000, ci: 10000, toAge: 75 };
assert.equal(run("documentedLookupPrice(inputs, 27.04)"), true);
assert.equal(run("documentedLookupPrice(inputs, 0.99)"), false);
