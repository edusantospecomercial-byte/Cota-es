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
// The public inventory counts separately by insurer and the printed report identifier.
const pdfIndex = run("parsePriorityCsv")(readFileSync(new URL("../data/comparison-pdf-index.csv", import.meta.url), "utf8"));
const tables = run("[reportedRows, verifiedArchiveRows, waiverRows, individualWaivers, acceleratedOffers, maturityDeclines, tpdOffers, fractureOffers, supplementalLifeRows]");
const reportKeys = new Map(pdfIndex.map(item => [item.sha256, item.report_key]));
const withPrice = tables.flat().filter(row => Number(row.monthly_premium) > 0);
const distinct = rows => new Set(rows.map(row => reportKeys.get(row.sha256) + "|" + row.provider)).size;
const inventory = run("comparisonInventory");
const counts = inventory(pdfIndex, tables);
assert.ok(counts, "All public source tables must reconcile with the PDF index");
assert.equal(counts.prices, distinct(withPrice));
assert.equal(counts.reports, new Set(withPrice.map(r => reportKeys.get(r.sha256))).size);
assert.ok(node("comparisonInventoryTitle").textContent.includes(counts.prices.toLocaleString("pt-BR")));
for (const provider of ["Zurich", "Legal & General", "Aviva"]) {
  assert.equal(counts.byInsurer[provider], distinct(withPrice.filter(row => row.provider === provider)));
}
assert.equal(counts.smokers, distinct(withPrice.filter(r => ["True", "Yes"].includes(r.smoker))));
assert.equal(counts.requested65, distinct(withPrice.filter(r => r.to_age === "65")));
const legal65 = withPrice.filter(r => r.provider === "Legal & General" && r.to_age === "65");
assert.equal(counts.legal65, distinct(legal65));
assert.equal(counts.legal65Shorter, distinct(legal65.filter(r => r.quoted_term === (64 - Number(r.age)) + " years")));
assert.ok(node("comparisonInventoryScope").textContent.includes(counts.legal65Shorter + " de " + counts.legal65));
const termDescription = run("quotedTerm")({term:"14 years", waiverTo:"Expiry", differentCapital:true, quotedLife:52000, quotedCi:0},{age:50,toAge:65});
for (const clue of ["14 anos de prazo", "pedido até os 65 anos (15 anos", "isenção até o fim do contrato", "vida £52,000.00"]) assert.ok(termDescription.includes(clue),clue);
assert.ok(!run("quotedTerm")({term:"15 years"},{age:50,toAge:65}).includes("pedido até"));
assert.equal(counts.withoutPrice, distinct(tables.flat()) - counts.prices);
assert.ok(counts.standard65 > counts.standardSmokers65 && counts.standardSmokers65 > 0);
assert.equal(inventory(pdfIndex, [...tables.slice(0, -1), []]), null);
assert.equal(inventory(pdfIndex.slice(1), tables), null);
const duplicate = {...withPrice[0]};
const includeRow = row => [tables[0].concat(row), ...tables.slice(1)];
assert.equal(inventory(pdfIndex, includeRow(duplicate)).prices, counts.prices);
assert.equal(inventory(pdfIndex, includeRow({...duplicate, monthly_premium: "1500.00"})), null);
assert.equal(inventory(pdfIndex, includeRow({...duplicate, monthly_premium: "approximate"})), null);
console.log(JSON.stringify({ documentedComparisonInventory: counts }));

const partialProfile = { age: 47, toAge: 65, life: 50000, ci: 10000, smoker: "non_smoker", waiver: "No" };
const gapMatch = run("priorityQuotesFor")(partialProfile);
assert.ok(gapMatch.quotes.every(q => !["34984455", "34984456"].includes(q.modelId)));
const partialCi = run("historicalPartialCiNote");
assert.match(partialCi(partialProfile), /34984455.*própria profissão/);
assert.doesNotMatch(partialCi(partialProfile), /34984456/);
assert.match(partialCi({...partialProfile, life: 40000}), /34984456.*40,000.*10,000.*primeiro evento/);
assert.equal(partialCi({...partialProfile, smoker: "smoker"}), "");
const legacyLifeOnly = run("priorityQuotesFor")({...partialProfile, age: 35, toAge: 70, life: 20000, ci: 0, smoker: "smoker"});
assert.ok(legacyLifeOnly.quotes.some(q => q.modelId === "34984518"));
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
const limitedWaiver = calculate(80,20000,0,{age:62,term:18,waiver:"Yes"});
assert.equal(limitedWaiver.waiverLimitNote, "Aviva · a isenção de mensalidade termina aos 70 anos. O seguro de vida segue até os 80 anos.");
assert.ok(limitedWaiver.text.includes(limitedWaiver.waiverLimitNote));
assert.ok(node("warning").textContent.includes(limitedWaiver.waiverLimitNote));
assert.equal(quoted.waiverLimitNote, undefined);
// Assess whether a pre-recorded total is strictly below the selected cap, after penny rounding.
const checkBudget = run("budgetEvidence");
const family31 = {age:31,toAge:65,life:152000,ci:10000,smoker:"non_smoker",waiver:"No",monthlyBudget:28};
const familyMetlife = {c:1,total:15};
const proofTrial = (model_id,forecast,monthly_premium,extra={}) => ({forecast,check:{age:"31",smoker:"No",provider:"Zurich",
  to_age:"65",quoted_term:"To Age 65",occupation_rated:"No",life_cover:"100000",critical_illness_cover:"10000",
  model_id,monthly_premium,...extra}});
const sampleTrials = [proofTrial("1","12.9949","13.00"),proofTrial("2","12.9950","12.99"),proofTrial("3","12.5000","12.50"),
  proofTrial("4","12","13",{quoted_term:"33 years"}),proofTrial("5","12","13",{smoker:"Yes"}),
  proofTrial("6","12","13",{occupation_rated:"Yes"}),proofTrial("7","12","13",{quoted_tpd:"Own occupation"}),
  proofTrial("8","12","13",{critical_illness_cover:"0"})];
const atBoundary = checkBudget(family31,familyMetlife,sampleTrials);
assert.deepEqual([atBoundary.count,atBoundary.reports,atBoundary.predictedBelow,atBoundary.stayedBelow,atBoundary.missedBelow,atBoundary.closest],
  [3,3,2,1,1,0]);
assert.equal(atBoundary.byProvider.get("Zurich").largestIncrease,1);
assert.equal(checkBudget(family31,familyMetlife,sampleTrials.concat(sampleTrials[0])),null);
assert.equal(checkBudget({...family31,waiver:"Yes"},familyMetlife,sampleTrials),null);
assert.equal(checkBudget(family31,{unavailable:true,total:0},sampleTrials),null);
assert.equal(checkBudget({...family31,monthlyBudget:0},familyMetlife,sampleTrials),null);
ctx.boundaryTrials = sampleTrials;
run("globalThis.previousBudgetTrials = capitalTrials; capitalTrials = boundaryTrials");
const marginFor = run("showBudgetEvidence");
assert.ok(marginFor(family31,familyMetlife,{provider:"Zurich",main:12.99,complete:true,capitalRange:true}).includes("deixa £0.01"));
assert.equal(marginFor(family31,familyMetlife,{provider:"Zurich",main:12.98,complete:true,capitalRange:true}),"");
assert.equal(marginFor(family31,familyMetlife,{provider:"Zurich",main:12.99,complete:true,capitalRange:false}),"");
run("capitalTrials = previousBudgetTrials");
const liveBudgetCheck = checkBudget(family31,familyMetlife);
assert.ok(liveBudgetCheck.count > 0 && liveBudgetCheck.reports <= liveBudgetCheck.count);
node("metlifeChild").checked = true;
calculate(65,152000,10000,{...family31,term:34});
assert.ok(!node("budgetAccuracy").hidden && node("budgetAccuracy").textContent.includes(liveBudgetCheck.count + " preços testados") &&
  node("budgetAccuracy").textContent.includes("£15.00 da MetLife"));
calculate(65,152000,10000,{...family31,smoker:"smoker",term:34});
assert.ok(node("budgetAccuracy").textContent.includes("a base ainda não tem testes de orçamento comparáveis"));
calculate(65,152000,10000,{...family31,monthlyBudget:0,term:34});
assert.ok(node("budgetAccuracy").hidden && !node("budgetAccuracy").textContent);
node("metlifeChild").checked = false;
// The insurer can return a different capital or maturity at its minimum premium.
const minimumOffer = calculate(65, 50000, 0, {age:20, term:45, waiver:"No"});
const minimumNote = minimumOffer.supplementalLifeNote;
for (const text of ["Pedido histórico de £50,000.00", "Aviva ofereceu £99,992.00 até os 65 anos por £5.00",
  "Legal & General ofereceu £142,371.00 por 44 anos de prazo por £6.00", "£18.00/mês", "isenção de mensalidade de 70 anos"]) {
  assert.ok(minimumNote.includes(text), text);
  assert.ok(minimumOffer.text.includes(text), text);
}
assert.ok(node("details").innerHTML.includes("Condições de vida no comparativo"));
const returnedMinimum = calculate(65,99992,0,{age:20,term:45,waiver:"Yes"});
assert.ok(returnedMinimum.supplementalLifeNote.includes("pedido original de £50,000.00, Aviva ofereceu £99,992.00"));
assert.ok(returnedMinimum.text.includes("valor oferecido em um pedido diferente"));
assert.ok(!returnedMinimum.providerQuotes?.some(q => q.premium === 5 && q.provider === "Aviva"));
assert.equal(calculate(65,99991,0,{age:20,term:45,waiver:"Yes"}).supplementalLifeNote,"");
const standardProofs = new Map(run("illustratedLifeRows").map(r => [r.sha256,r]));
const baselineInsurers = new Set(tables.slice(0,-1).flat().map(r => reportKeys.get(r.sha256) + "|" + r.provider));
for (const row of run("supplementalLifeRows")) {
  const id = reportKeys.get(row.sha256) + "|" + row.provider;
  assert.ok(!baselineInsurers.has(id), "supplemental return counted twice: " + id);
  baselineInsurers.add(id);
  if (!row.no_riders_illustration_sha256) continue;
  assert.match(row.no_riders_illustration_sha256, /^[a-f0-9]{64}$/);
  // The life catalogue keeps a single PDF for reprints with the same economics.
  const evidence = standardProofs.get(row.no_riders_illustration_sha256) || [...standardProofs.values()].find(proof =>
    ["provider","source_date","age","smoker","to_age"].every(key => proof[key] === row[key]) && proof.policy_count === "1" &&
    proof.life_cover === row.quoted_life_cover && proof.base_monthly === row.monthly_premium &&
    proof.policy_monthly === row.monthly_premium && Number(proof.additional_monthly) === 0 && Number(proof.discount_monthly) === 0);
  assert.ok(evidence && evidence.policy_count === "1" && Number(evidence.additional_monthly) === 0 && Number(evidence.discount_monthly) === 0);
  for (const key of ["provider","source_date","age","smoker","to_age"]) assert.equal(row[key],evidence[key]);
  if (row.provider === "Aviva") assert.equal(row.sha256, evidence.comparison_sha256);
  assert.equal(row.quoted_life_cover,evidence.life_cover);
  assert.equal(row.monthly_premium,evidence.policy_monthly);
}
for (const [age, life, premium, reference] of [[34,100000,"8.07","1081022993"], [41,50000,"7.15","1081150471"], [43,30000,"5.10","1083811974"]]) {
  const policy = calculate(65,life,0,{age,term:65-age,waiver:"No"});
  assert.ok(policy.componentNote.includes("£" + premium + " + adicionais £0.00"));
  assert.ok(policy.text.includes(reference));
  if (age !== 43) assert.ok(policy.supplementalLifeNote.includes("a illustration confirma vida sem adicionais"));
}
assert.ok(calculate(65,30000,0,{age:37,term:28,smoker:"smoker",waiver:"No"}).supplementalLifeNote.includes("£7.17/mês em 2026-08-11 (isenção de mensalidade sem confirmação)"));
const subjectToTerms = calculate(65,30000,0,{age:37,term:28,smoker:"smoker",waiver:"No"});
for (const clue of ["Legal & General ofereceu £30,000.00 por 27 anos de prazo por £6.57/mês",
  "própria profissão na coluna de incapacidade permanente (TPD)", "£0.07/mês de isenção dentro do prêmio", "£19.57/mês"]) {
  assert.ok(subjectToTerms.supplementalLifeNote.includes(clue),clue);
  assert.ok(subjectToTerms.text.includes(clue),clue);
}
assert.ok(!subjectToTerms.providerQuotes?.some(q => q.provider === "Legal & General" && q.premium === 6.57));
const ownRows = run("supplementalLifeRows").filter(row => row.quoted_tpd === "Own");
const minimumWithWaiver = calculate(65,144073,0,{age:20,term:45,waiver:"No"});
for (const detail of ["pedido original de £100,000.00", "£144,073.00 por 44 anos de prazo por £6.00",
  "65 anos representa 45 anos pela idade informada", "£0.03/mês de isenção dentro do prêmio"])
  assert.ok(minimumWithWaiver.supplementalLifeNote.includes(detail), detail);
assert.ok(ownRows.length && ownRows.some(r => r.smoker === "Yes") && ownRows.some(r => r.waiver_illustration_sha256));
for (const row of ownRows) {
  assert.equal(row.provider,"Legal & General");
  assert.equal(row.waiver_to,"Expiry");
  assert.equal(row.no_riders_illustration_sha256,"");
  if (!row.waiver_illustration_sha256) { assert.equal(row.illustrated_waiver_monthly,""); continue; }
  assert.match(row.waiver_illustration_sha256,/^[a-f0-9]{64}$/);
  assert.ok(+row.illustrated_waiver_monthly > 0 && +row.illustrated_waiver_monthly < +row.monthly_premium);
}
assert.ok(!calculate(65,30000,10000,{age:37,term:28,smoker:"smoker"}).supplementalLifeNote);
assert.ok(!calculate(65,30000,0,{age:37,term:28,smoker:"non_smoker"}).supplementalLifeNote);
assert.ok(calculate(65,100000,0,{age:60,term:5,waiver:"No"}).supplementalLifeNote.includes("£26.48/mês em 2026-05-14 (a illustration confirma vida sem adicionais)"));
run('globalThis.clockBeforeBudgetTest = Date.now; Date.now = () => Date.parse("2026-11-26T00:00:00Z")');
const minimumBudget = run("lifeWithinBudget")({age:20,toAge:65,life:100000,ci:0,waiver:"Yes",smoker:"non_smoker",monthlyBudget:19}, {c:1,total:13}, []);
assert.equal(minimumBudget.life, 99992);
assert.equal(minimumBudget.total, 18);
assert.equal(run("lifeWithinBudget")({age:20,toAge:65,life:100000,ci:0,waiver:"No",smoker:"non_smoker",monthlyBudget:19}, {c:1,total:13}, []), null);
const overBudget = calculate(65, 150000, 0, {monthlyBudget:28, waiver:"No"});
assert.ok(overBudget.affordableNote.includes("£75,000.00 de vida"));
assert.ok(overBudget.affordableNote.includes("£14.91 + £13.00") && overBudget.affordableNote.includes("£27.91/mês"));
assert.ok(node("alternativePackage").textContent.includes(overBudget.affordableNote) && overBudget.text.includes(overBudget.affordableNote));
assert.equal(calculate(65, 150000, 0, {monthlyBudget:0}).main, overBudget.main);
assert.ok(!calculate(65, 150000, 0, {monthlyBudget:0}).affordableNote);
assert.ok(!calculate(65, 75000, 0, {monthlyBudget:28}).affordableNote);
assert.ok(calculate(65, 150000, 0, {monthlyBudget:27.91}).affordableNote.includes("£73,000.00 de vida"));
const fixedCi = calculate(65, 300000, 20000, {age:31, term:34, monthlyBudget:28, waiver:"No"});
assert.ok(fixedCi.affordableNote.includes("£115,000.00 de vida e £20,000.00 de diagnóstico independente"));
assert.ok(fixedCi.affordableNote.includes("£27.93/mês"));
const capSearch = run("lifeWithinBudget");
const budgetProfile = {age:50, smoker:"non_smoker", life:150000, ci:0, toAge:65, monthlyBudget:28};
const capSource = reported.find(r => r.model_id === "35024582" && r.provider === "Zurich");
assert.ok(capSource);
const extra = {c:1,total:13};
assert.equal(capSearch(budgetProfile, extra, [capSource, {...capSource,source_date:"2026-11-25",available:"false",monthly_premium:""}]), null);
assert.equal(capSearch(budgetProfile, extra, [capSource,{...capSource, monthly_premium:"10.00"}]), null);
for (const changes of [{quoted_term:"14 years"}, {quoted_life_cover:"76000"}, {occupation_rated:"Yes"}, {quoted_tpd:"Own occupation"},
  {source_date:"2025-11-26"}, {smoker:"Yes"}, {critical_illness_cover:"10000"}]) {
  assert.equal(capSearch(budgetProfile, extra, [{...capSource, ...changes}]), null);
}
run("Date.now = clockBeforeBudgetTest");
const archiveWithDisability = calculate(70, 200000, 0, { age: 62, term: 8 });
assert.equal(archiveWithDisability.provider, "Zurich");
assert.equal(archiveWithDisability.main, 71.66);
assert.ok(archiveWithDisability.text.includes("7 anos de prazo · inclui incapacidade permanente para a própria profissão"));
assert.ok(archiveWithDisability.providerQuotes.some(q => q.provider === "Legal & General" && q.premium === 73.92));
const comparedArchive = calculate(65, 500000, 0, { age: 46, term: 19 });
assert.equal(comparedArchive.provider, "Zurich");
assert.equal(comparedArchive.main, 49.28);
assert.ok(comparedArchive.text.includes("18 anos de prazo"));
// Earlier CI captures with the three matching premiums paid on the first event.
for (const [age, life, ci, reference] of [
  [34, 50000, 10000, "1084735012"], [38, 50000, 10000, "1084751490"], [34, 20000, 20000, "1084751726"],
]) {
  const result = calculate(65, life, ci, {age, term:65-age});
  assert.ok(!result.priorityExact);
  assert.match(result.partialCiNote, /primeiro evento coberto/);
  assert.ok(result.partialCiNote.includes(reference));
  assert.ok(result.text.includes(result.partialCiNote));
  assert.ok(node("details").innerHTML.includes(reference));
  assert.equal(node("acceleratedComparison").hidden, false);
}
const unverifiedCi = calculate(65, 50000, 10000, {age:46, term:19});
assert.ok(!unverifiedCi.priorityExact);
assert.ok(unverifiedCi.partialCiNote.includes("34984397"));
assert.ok(unverifiedCi.partialCiNote.includes("precisam de confirmação"));
assert.ok(!calculate(65, 75000, 10000, {age:46, term:19}).providerQuotes?.length);
assert.equal(run("historicalCiPrices")({age:46,toAge:65,life:50000,ci:10000,smoker:"smoker"}), "");
const penceForDisplay = run("displayedPence");
assert.deepEqual([1.005, 10.075, 1.00499, 999.995].map(penceForDisplay), [101,1008,100,100000]);
assert.equal(run("monthlyTotal")(1.005, 13),14.01);
const rangeForBudget = run("generalBudgetRangeNote");
const budgetCase = {complete:true, aggregateOnly:true, low:13.5, high:15};
assert.match(rangeForBudget({monthlyBudget:28},{total:13},budgetCase), /£26.50 a £28.00/);
assert.match(rangeForBudget({monthlyBudget:28},{total:15},{...budgetCase,low:12,high:14}), /£27.00 a £29.00/);
assert.match(rangeForBudget({monthlyBudget:28},{total:0},{...budgetCase,low:27,high:29}), /vai de £27.00 a £29.00/);
for (const [budget, option, changes] of [
  [0, {total:13}, {}], [28, {total:13}, {high:14.99}], [28, {total:13}, {low:15,high:16}],
  [28, {total:13}, {low:null}], [28, {total:13}, {complete:false}], [28, {total:13}, {aggregateOnly:false}],
  [28, {total:0,unavailable:true}, {low:20,high:32}],
]) assert.equal(rangeForBudget({monthlyBudget:budget},option,{...budgetCase,...changes}), "");
const openLower = calculate(65, 20000, 0, {age:25, term:40, monthlyBudget:28});
assert.equal(openLower.low,0);
assert.ok(openLower.main>0 && openLower.complete);
assert.match(node("range").textContent, /mínima da proteção principal a confirmar/);
assert.ok(openLower.text.includes(node("range").textContent));
assert.match(openLower.budgetMarginNote, /limite superior estimado/);
assert.doesNotMatch(openLower.budgetMarginNote, /vai de £13.00/);
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
  assert.ok(["Own", "Specified", "FATs", "None"].includes(row.tpd_basis));
}
const maturities = run("maturityDeclines");
const maturityKeys = new Set();
for (const row of maturities) {
  assert.match(row.maturity_reason, /^(maximum_maturity_\d+|maturity_not_supported)$/);
  assert.match(row.sha256, /^[0-9a-f]{64}$/);
  assert.ok(!maturityKeys.has(row.reference + "|" + row.provider));
  maturityKeys.add(row.reference + "|" + row.provider);
}
calculate(80, 50000, 10000, {age: 41, term: 39});
assert.equal(node("acceleratedComparison").hidden, false);
assert.ok(node("acceleratedSource").textContent.includes("1081066433"));
assert.ok(node("acceleratedOffers").innerHTML.includes("até os 75 anos nesse relatório"));
assert.ok(node("acceleratedOffers").innerHTML.includes("até os 76 anos nesse relatório"));
assert.ok(node("acceleratedOffers").innerHTML.includes("idade de término estava fora do limite"));
calculate(80, 51000, 10000, {age: 41, term: 39});
assert.equal(node("acceleratedComparison").hidden, true);
const ciWithTpdOnly = calculate(70, 0, 10000, {age: 57, term: 13, waiver: "Yes"});
assert.ok(ciWithTpdOnly.alternativePackage.includes("Aviva · £10,000.00 de diagnóstico independente até os 70 anos por £16.54/mês"));
assert.ok(ciWithTpdOnly.alternativePackage.includes("o pacote soma £29.54/mês"));
assert.ok(ciWithTpdOnly.alternativePackage.includes("isenção até o fim do contrato precisa de confirmação"));
assert.equal(node("alternativePackage").hidden, false);
assert.ok(ciWithTpdOnly.text.includes(ciWithTpdOnly.alternativePackage));
assert.equal(node("tpdComparison").hidden, false);
assert.ok(node("tpdSource").textContent.includes("1081121809"));
assert.match(node("tpdOffers").innerHTML, /Aviva<\/dt><dd><b>£16\.54\/mês<\/b>[^<]*diagnóstico independente £10,000\.00/);
assert.match(node("tpdOffers").innerHTML, /Legal &amp; General<\/dt><dd><b>£20\.41\/mês<\/b>[^<]*12 anos de prazo[^<]*vida ou diagnóstico £10,000\.00[^<]*preço depende da profissão/);
assert.match(node("tpdOffers").innerHTML, /Zurich<\/dt><dd><b>£24\.08\/mês<\/b>[^<]*diagnóstico independente £10,000\.00/);
calculate(65, 0, 20000, {age: 36, term: 29});
assert.ok(node("acceleratedSource").textContent.includes("1073384339"));
assert.match(node("acceleratedOffers").innerHTML, /Zurich<\/dt><dd><b>£11\.87\/mês<\/b>[^<]*oferta sem TPD/);
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

// The dated archive is fixed; use the day following its last collection to test both eligibility and expiry.
run("var originalClock = Date.now; Date.now = () => Date.parse('2026-11-26T00:00:00Z')");
const lifeAt39 = calculate(65, 100000, 0, {age: 39, term: 26, waiver: "No"});
assert.ok(lifeAt39.ageNote.includes("£9.75/mês"));
assert.ok(lifeAt39.text.includes("Última conferência em 2026-11-17"));
const lifeAt57 = calculate(70, 50000, 0, {age: 57, term: 13, waiver: "No"});
assert.ok(lifeAt57.ageNote.includes("£17.87/mês"));
const ageGroups = run("historicalAgeTests");
for (const [key, expected] of [["No|65|100000", 0.20], ["No|70|50000", 0.46]]) {
  const tests = ageGroups.get(key);
  assert.equal(tests.length, 2);
  assert.equal(Math.max(...tests.map(test => +test.error.toFixed(2))), expected);
  assert.ok(tests.every(test => test.passed));
}
for (const unsupported of [
  {waiver: "Yes"}, {smoker: "smoker"}, {life: 99000}, {ci: 5000}, {toAge: 80}, {age: 20},
]) {
  ctx.ageVariant = unsupported;
  assert.equal(run('illustratedAgeEstimate(illustratedLifeRows,{age:39,toAge:65,life:100000,ci:0,smoker:"non_smoker",waiver:"No",...ageVariant})'), null);
}
// With the general carrier grid unavailable, a tested Zurich base still supplies a monthly estimate and total.
ctx.originalPriorityRows = run("priorityRows");
run("priorityRows = []");
const standaloneEstimate = calculate(65, 100000, 0, {age: 39, term: 26, waiver: "No"});
assert.equal(standaloneEstimate.ageEstimate, true);
assert.equal(standaloneEstimate.provider, "Zurich");
assert.equal(standaloneEstimate.main, 9.75);
assert.equal(standaloneEstimate.low, null);
assert.equal(standaloneEstimate.high, null);
assert.ok(standaloneEstimate.complete);
assert.equal(node("totalPrice").textContent, "£22.75/mês");
assert.ok(standaloneEstimate.text.includes("Com a MetLife selecionada, a estimativa Zurich soma £22.75/mês"));
assert.ok(!standaloneEstimate.text.includes("Faixa provável"));
run("priorityRows = originalPriorityRows");
const documentedAge = calculate(65, 100000, 0, {age: 41, term: 24, waiver: "No"});
assert.equal(documentedAge.ageNote, undefined);
run("Date.now = () => Date.parse('2030-12-01')");
assert.equal(calculate(65, 100000, 0, {age: 39, term: 26, waiver: "No"}).ageNote, undefined);
run("Date.now = originalClock");
console.log(JSON.stringify({age39: {usedForTotal: Boolean(lifeAt39.ageEstimate), main: lifeAt39.main}, age57: {usedForTotal: Boolean(lifeAt57.ageEstimate), main: lifeAt57.main}}));

const fractureReports = run('fractureOffers');
const fractureDocuments = run('fractureBreakdowns');
const fractureKeys = new Set();
for (const row of fractureReports) {
  const key = row.provider + '|' + row.reference;
  assert.ok(!fractureKeys.has(key));
  fractureKeys.add(key);
  assert.match(row.sha256, /^[\da-f]{64}$/);
  assert.ok(['Aviva', 'Zurich', 'Legal & General'].includes(row.provider));
  assert.ok(['quoted', 'fracture_not_supported', 'age_not_supported', 'term_not_supported'].includes(row.response));
  if (row.response !== 'quoted') {
    assert.equal(row.monthly_premium, '');
    continue;
  }
  assert.ok(Number(row.monthly_premium) > 0);
  assert.equal(Boolean(Number(row.quoted_earlier_ci_cover)), Boolean(Number(row.earlier_ci_cover)));
  assert.equal(Boolean(Number(row.quoted_independent_ci_cover)), Boolean(Number(row.independent_ci_cover)));
  assert.ok(!(Number(row.independent_ci_cover) > 0 && Number(row.earlier_ci_cover) > 0));
  assert.equal(Boolean(Number(row.quoted_life_cover)), Boolean(Number(row.life_cover)));
  assert.ok(!variantRows.some(r => r.sha256 === row.sha256));
  assert.ok(!evidence.some(r => r.sha256 === row.sha256));
}
for (const [key, part] of fractureDocuments) {
  const offer = fractureReports.find(row => row.provider + '|' + row.sha256 === key);
  assert.ok(offer);
  for (const field of ['reference', 'age', 'smoker', 'to_age', 'life_cover', 'earlier_ci_cover', 'quoted_life_cover', 'quoted_earlier_ci_cover']) {
    assert.equal(offer[field], part[field]);
  }
  assert.ok(Number(part.fracture_monthly) > 0);
  const cost = name => Math.round(Number(part[name]) * 100);
  assert.equal(cost('life_monthly') + cost('earlier_ci_monthly') + cost('waiver_monthly') + cost('tpd_monthly') + cost('fracture_monthly') + cost('independent_ci_monthly') - cost('discount_monthly'), cost('total_monthly'));
  assert.equal(offer.monthly_premium, part.total_monthly);
}
const withFractureAndIndependent = calculate(70, 100000, 10000, {age:51, smoker:'non_smoker', term:19, waiver:'No'});
assert.equal(node('fractureComparison').hidden, false);
for (const amount of ['£44.55/mês','£42.24/mês','diagnóstico independente £10,000.00','diagnóstico independente £16.89',
  'fraturas da seguradora £7.75','incapacidade permanente £0.32','desconto por múltiplas apólices £2.50'])
  assert.ok(node('fractureOffers').innerHTML.includes(amount), amount);
assert.ok(!withFractureAndIndependent.providerQuotes?.some(q => ['1076894193','1076894354'].includes(q.modelId)));
const riderProfile = {age:32, smoker:'smoker', term:33, waiver:'No'};
const withRiderPanel = calculate(65,50000,0,riderProfile);
assert.equal(node('fractureComparison').hidden, false);
for (const clue of ['£11.72/mês', 'vida £7.70 + isenção £0.02 + fraturas da seguradora £4.00', 'recusou o adicional', '£15.98/mês', 'precisa de confirmação']) {
  assert.ok(node('fractureOffers').innerHTML.includes(clue), clue);
}
run('globalThis.savedRiderReports = fractureOffers; fractureOffers = []');
const withoutPanel = calculate(65,50000,0,riderProfile);
assert.equal(withRiderPanel.main, withoutPanel.main);
assert.equal(withRiderPanel.text, withoutPanel.text);
assert.equal(node('fractureComparison').hidden,true);
run('fractureOffers = savedRiderReports');
calculate(65,20000,10000,{age:48, term:17});
assert.ok(node('fractureOffers').innerHTML.includes('vida £21,859.00'));
assert.ok(node('fractureOffers').innerHTML.includes('vida ou diagnóstico £10,000.00'));
assert.ok(node('fractureSource').textContent.includes('primeiro evento'));
calculate(75,50000,0,{age:54,term:21});
assert.ok(node('fractureOffers').innerHTML.includes('fraturas até os 70 anos'));
calculate(80,50000,0,{age:61,term:19});
assert.ok(node('fractureOffers').innerHTML.includes('idade estava fora do limite'));
calculate(70,100000,10000,{age:20,term:50});
assert.ok(node('fractureOffers').innerHTML.includes('recusou o prazo'));
calculate(65,10001,0,{age:33,term:32});
assert.equal(node('fractureComparison').hidden,true);
ctx.adjustedCapital = {age:33,toAge:65,smoker:'non_smoker',life:49408,ci:0,waiver:'No'};
assert.equal(run('illustratedLifeFor(adjustedCapital,"Aviva")').base_monthly,'4.99');
assert.notEqual(run('illustratedLifeFor({...adjustedCapital,life:10000},"Aviva")')?.reference,'1083310818');

const generalBudget = calculate(65,50000,10000,{age:25,smoker:'smoker',term:40,waiver:'No'});
assert.ok(generalBudget.complete && generalBudget.aggregateOnly);
assert.equal(node('resultTitle').textContent,'Referência de orçamento');
assert.ok(generalBudget.text.includes('Orçamento mensal indicativo de £25.91. Seguradora a confirmar.'));
assert.ok(generalBudget.text.includes('valor para Zurich, Legal & General ou Aviva precisa de confirmação'));
assert.equal(node('totalPrice').textContent,'£25.91/mês');
const namedBudget = calculate(65,50000,0,{age:32,smoker:'smoker',term:33,waiver:'No'});
assert.ok(namedBudget.complete && !namedBudget.aggregateOnly);
assert.ok(!namedBudget.text.includes('Seguradora a confirmar.'));

const pairedArchive = evidence.concat(variantRows);
for (const part of fractureDocuments.values()) {
  if (!part.plain_reference) continue;
  assert.notEqual(part.plain_reference,part.reference);
  assert.ok(pairedArchive.some(row => row.sha256 === part.plain_comparison_sha256 && row.provider === part.provider &&
    row.source_date === part.source_date && row.monthly_premium === part.plain_with_waiver_monthly));
}
calculate(75,50000,0,{age:54,term:21});
assert.ok(node('fractureOffers').innerHTML.includes('£18.55/mês (comparativo '));
assert.ok(node('fractureOffers').innerHTML.includes('diferença entre as mensalidades foi de £8.14'));

// These two general budgets previously fell from £31.72 to £7.80 as cover rose.
const smoker40 = {age: 40, term: 25, smoker: 'smoker', waiver: 'No'};
for (const [amount, expected] of [[20000, '5.26'], [30000, '7.80']]) {
  const result = calculate(65, amount, 0, smoker40);
  assert.ok(result.complete && result.aggregateOnly);
  assert.equal(result.main.toFixed(2), expected);
}

const generalPremium = (age, smoker, life, ci) => {
  ctx.curveProfile = {age, smoker, toAge: 65, term: 65 - age, life, ci};
  const name = ci ? 'life_plus_standalone_ci:standard_core_ci' : 'life_only';
  return run(`predictBudget(catalog.models["${name}"], curveProfile, null)`);
};
function assertIncreasing(values) {
  for (let i = 0; i < values.length; i++) {
    assert.ok(Number.isFinite(values[i]) && values[i] > 0);
    if (i > 0) assert.ok(values[i] >= values[i - 1] - 1e-8, values.join(', '));
  }
}
for (const smoker of ['smoker', 'non_smoker']) {
  for (const ci of [0, 9999, 10000, 10001, 17000, 50000]) {
    const amounts = [500, 10000, 19999, 20000, 20001, 30000, 75000, 147321, 500000];
    assertIncreasing(amounts.map(life => generalPremium(40, smoker, life, ci)));
  }
  for (const life of [10000, 75000, 207500]) {
    const diagnoses = [500, 5000, 9999, 10000, 10001, 15000, 30000, 40001, 60000];
    assertIncreasing(diagnoses.map(ci => generalPremium(52, smoker, life, ci)));
  }
}
ctx.crossing = {lookup: {'40|65|20000|0|1': 20, '40|65|30000|0|1': 10, '40|65|50000|0|1': 30}};
for (const [life, expected] of [[20000, 15], [30000, 15], [40000, 22.5], [50000, 30]]) {
  ctx.curveProfile = {...smoker40, toAge: 65, ci: 0, life};
  assert.equal(run('generalBudgetEstimate(crossing, curveProfile, () => 6)'), expected);
}
assert.equal(run('predictBudget(crossing, curveProfile, 19.37)'), 19.37);

const smoker43 = {...smoker40, age: 43, term: 22};
const smoker43Base = calculate(65, 50000, 0, smoker43);
assert.ok(smoker43Base.aggregateOnly && smoker43Base.complete);
assert.equal(smoker43Base.main.toFixed(2), '14.84');
assert.equal(node('totalPrice').textContent, '£27.84/mês');
for (const clue of ['Opção com isenção', 'Aviva', '2026-09-14', '£15.30', '£28.30/mês']) {
  assert.ok(smoker43Base.alternativePackage.includes(clue), clue);
  assert.ok(node('alternativePackage').textContent.includes(clue), clue);
  assert.ok(smoker43Base.text.includes(clue), clue);
}
assert.ok(!smoker43Base.alternativePackage.includes('£14.69')); // Shorter L&G term.
assert.notEqual(node('alternativePackage').hidden, true);
const smoker43WithWaiver = calculate(65, 50000, 0, {...smoker43, waiver: 'Yes'});
assert.equal(smoker43WithWaiver.provider, 'Aviva');
assert.equal(smoker43WithWaiver.main, 15.30);
assert.equal(smoker43WithWaiver.alternativePackage, undefined);
assert.equal(node('alternativePackage').hidden, true);
assert.equal(calculate(65, 50001, 0, smoker43).alternativePackage, undefined);
assert.ok(!calculate(65, 50000, 10000, smoker43).alternativePackage?.includes('Opção com isenção'));

const smoker47 = {...smoker40, age: 47, term: 18};
const lifeWithItemisation = calculate(65, 30000, 0, smoker47);
assert.ok(lifeWithItemisation.aggregateOnly);
for (const part of ['Aviva', '£13.30/mês antes de adicionais', '2026-10-09', 'apenas vida precisa de confirmação']) {
  assert.ok(lifeWithItemisation.componentNote.includes(part), part);
  assert.ok(lifeWithItemisation.text.includes(part), part);
  assert.ok(node('details').innerHTML.includes(part), part);
}
assert.equal(calculate(65, 30001, 0, smoker47).componentNote, undefined);
ctx.bundleProfile = {age: 47, smoker: 'smoker', life: 30000, toAge: 65, ci: 0, waiver: 'No'};
assert.equal(run('avivaLifeInPackage({...bundleProfile, waiver:"Yes"})'), null);
assert.equal(run('avivaLifeInPackage({...bundleProfile, ci:5000})'), null);
run('globalThis.availableBreakdowns = coreBreakdowns; coreBreakdowns = new Map()');
assert.equal(calculate(65, 30000, 0, smoker47).main, lifeWithItemisation.main);
assert.equal(calculate(65, 30000, 0, smoker47).componentNote, undefined);
run('coreBreakdowns = availableBreakdowns');

for (const [age, life, expected, subtotal] of [[42,50000,'13.53','26.53'], [44,50000,'16.06','29.06'], [45,50000,'17.69','30.69'], [55,100000,'57.24','70.24']]) {
  const profile = {age, smoker:'smoker', term:65-age, waiver:'No'};
  const base = calculate(65, life, 0, profile);
  const bundle = calculate(65, life, life / 5, profile);
  assert.equal(bundle.ciPending, true);
  assert.equal(bundle.complete, false);
  assert.equal(bundle.main, base.main);
  assert.equal(bundle.main.toFixed(2), expected);
  assert.equal(node('totalPrice').textContent, 'A confirmar');
  assert.equal(node('resultTitle').textContent, 'Estimativa parcial');
  assert.ok(node('range').textContent.includes('Somente vida'));
  assert.ok(bundle.text.includes('Estimativa só de vida: £' + expected));
  assert.ok(bundle.text.includes('subtotal é £' + subtotal + '/mês antes do diagnóstico'));
  assert.ok(!bundle.text.includes('Faixa provável') && !bundle.text.includes('Orçamento mensal indicativo de'));
}
const fullAgain = calculate(65, 50000, 10000, {age:25, smoker:'smoker',term:40,waiver:'No'});
assert.ok(!fullAgain.ciPending && fullAgain.complete);
assert.equal(node('totalPrice').textContent, '£25.91/mês');

run("Date.now = () => Date.parse('2026-11-26T00:00:00Z')");
const composedProfile = {age:31, smoker:'non_smoker', term:34, waiver:'No'};
const composed = calculate(65,150000,15000,composedProfile);
assert.ok(composed.complete && composed.composition && !composed.priorityExact);
assert.equal(composed.provider, 'Zurich');
assert.deepEqual(Array.from(composed.providerQuotes, q => [q.provider,q.premium,q.offset,q.tested]), [
  ['Zurich',14.57,2.5,12],['Aviva',17.54,0,6],
]);
for (const clue of ['£14.57/mês','£27.57/mês','diagnóstico independente £8.40','diferença de £2.50','£30.54/mês','Preço a confirmar para Legal & General']) {
  assert.ok(composed.text.includes(clue), clue);
}
assert.equal(node('totalPrice').textContent, '£27.57/mês');
assert.ok(node('details').innerHTML.includes('Estimativa por composição'));
assert.equal(calculate(65,150000,15000,{...composedProfile,smoker:'smoker'}).composition,false);
assert.equal(calculate(65,150000,15000,{...composedProfile,waiver:'Yes'}).composition,false);
assert.equal(calculate(65,150000,20000,composedProfile).priorityExact,true);
run("Date.now = () => Date.parse('2030-01-01')");
assert.equal(calculate(65,150000,15000,composedProfile).composition,false);
run('Date.now = originalClock');

function independentOffer(id,life,ci,premium) {
  return {provider:'Zurich',age:'31',smoker:'No',to_age:'65',source_date:'2026-11-25',model_id:String(id),
    available:'true',occupation_rated:'No',quoted_term:'To Age 65',life_cover:String(life),quoted_life_cover:String(life),
    critical_illness_cover:String(ci),quoted_critical_illness_cover:String(ci),monthly_premium:premium.toFixed(2),
    product:life && ci?'Life & CI':life?'Life':'CI'};
}
const partOffers = [
  independentOffer(1,50000,0,6),independentOffer(2,75000,0,7),independentOffer(3,100000,0,10),independentOffer(4,80000,0,9),
  independentOffer(5,0,10000,6),independentOffer(6,0,20000,10),independentOffer(7,0,15000,8),
  independentOffer(8,50000,10000,9.5),independentOffer(9,100000,20000,17.5),independentOffer(10,75000,15000,12.5),
];
function fromParts(rows) {
  ctx.partOffers=rows;
  return run("buildIndependentPlans(partOffers).get('31|No|65|80000|15000')?.[0]");
}
assert.equal(fromParts(partOffers)?.premium,14.5);
assert.equal(fromParts(partOffers.filter(r=>r.model_id!=='10')),undefined);
for (const change of [{monthly_premium:'12.51'},{quoted_term:'33 years'},{quoted_tpd:'Own occupation'},{occupation_rated:'Yes'},
  {model_id:'0'},{age:'32'},{smoker:'Yes'},{quoted_critical_illness_cover:'14999'},{source_date:'2026-11-24'}]) {
  assert.equal(fromParts(partOffers.map(r=>r.model_id==='10'?{...r,...change}:r)),undefined);
}
assert.equal(fromParts([...partOffers,{...partOffers.at(-1),model_id:'11',monthly_premium:'12.49'}]),undefined);

const ratedSources = run('reportedOccupations');
const occupationalReports = reported.concat(run('verifiedArchiveRows'),run('acceleratedOffers'),run('tpdOffers'),run('fractureOffers'));
for (const [digest, basis] of ratedSources) {
  const rated = occupationalReports.find(r => r.sha256 === digest && r.occupation_rated === 'Yes');
  assert.ok(rated && rated.source_date === basis.source_date && (rated.model_id || rated.reference) === basis.model_id);
  assert.ok(basis.employment === 'employed' || basis.employment === 'self-employed');
}
const occupationInput={age:31,term:34,waiver:'No',occupation:'Housekeeper (empregada)'};
const jobPrice=calculate(65,0,30000,occupationInput);
assert.equal(jobPrice.main,12.89);
assert.equal(jobPrice.provider,'Legal & General');
assert.equal(node('totalPrice').textContent,'£25.89/mês');
assert.ok(jobPrice.text.includes('profissão e vínculo conferidos: Housekeeper (empregado)'));
for (const occupation of ['Housekeeper','Housekeeper autônoma','Employed Stock Manager','Housekeeper supervisor (empregado)']) {
  const other=calculate(65,0,30000,{...occupationInput,occupation});
  assert.notEqual(other.provider,'Legal & General');
  assert.ok(other.text.includes('Housekeeper (empregado)'));
}
const largerCapital=calculate(65,0,10000,occupationInput);
assert.ok(largerCapital.providerQuotes.find(q=>q.provider==='Legal & General').differentCapital);
assert.notEqual(largerCapital.provider,'Legal & General');
const manager=calculate(75,0,50000,{age:50,term:25,waiver:'No',occupation:'Self-employed Events Manager'});
assert.equal(manager.provider,'Legal & General');
assert.equal(manager.main,63.11);
assert.notEqual(calculate(75,0,50000,{age:50,term:25,waiver:'No',occupation:'employed Events Manager'}).provider,'Legal & General');
const shortTerm=calculate(65,100000,10000,occupationInput);
assert.ok(shortTerm.providerQuotes.some(q=>q.provider==='Legal & General' && q.occupationMatched && q.term!=='To Age 65'));
assert.notEqual(shortTerm.provider,'Legal & General');
const withNoProof=run('reportedOccupations');run('reportedOccupations=new Map()');
assert.notEqual(calculate(65,0,30000,occupationInput).provider,'Legal & General');
ctx.restoredOccupations=withNoProof;run('reportedOccupations=restoredOccupations');

run("Date.now = () => Date.parse('2026-11-26T00:00:00Z')");
const twoPolicies = calculate(65,25000,7500,{age:50,term:15,occupation:'Office administrator',waiver:'No'});
assert.ok(twoPolicies.aggregateOnly && !twoPolicies.provider);
for (const item of ['duas apólices individuais da Aviva','£7.03/mês','£7.40/mês','£14.43/mês','£27.43/mês','contratação simultânea']) {
  assert.ok(node('alternativePackage').textContent.includes(item) && twoPolicies.text.includes(item));
}
assert.ok(!node('totalPrice').textContent.includes('27.43'));
assert.equal(calculate(65,25000,7500,{age:50,term:15,smoker:'smoker',waiver:'No'}).separatePolicyNote,undefined);
assert.equal(calculate(65,25000,7500,{age:50,term:15,waiver:'Yes'}).separatePolicyNote,undefined);
assert.equal(calculate(65,150000,15000,composedProfile).separatePolicyNote,undefined);
ctx.standaloneProfile={age:31,smoker:'non_smoker',toAge:65,life:50000,ci:10000};
const singleLife=independentOffer(1,50000,0,6.25),singleCi=independentOffer(2,0,10000,8.30);
function individualOption(...evidence) {
  ctx.standaloneSources=evidence;
  return run('separatePolicyOptions(standaloneProfile,standaloneSources)[0]');
}
assert.equal(individualOption(singleLife,singleCi).sum,14.55);
for(const changes of [{provider:'Aviva'},{source_date:'2026-11-24'},{quoted_term:'33 years'},
    {occupation_rated:'Yes'},{quoted_tpd:'Own occupation'},{available:'false'},
    {monthly_premium:''},{quoted_critical_illness_cover:'11000'},{smoker:'Yes'}]) {
  assert.equal(individualOption(singleLife,{...singleCi,...changes}),undefined);
}
assert.equal(individualOption(singleLife,singleCi,{...singleCi,model_id:'3',available:'false'}),undefined);
assert.equal(individualOption(singleLife,singleCi,{...singleCi,model_id:'4',monthly_premium:'7.99'}),undefined);
assert.equal(individualOption(singleLife,singleCi,{...singleCi,model_id:'5',available:'false',source_date:'2026-11-26'}),undefined);
assert.equal(individualOption(singleLife,singleCi,independentOffer(6,50000,10000,12.55)),undefined);
run("Date.now = () => Date.parse('2030-01-01')");
assert.equal(individualOption(singleLife,singleCi),undefined);
run('Date.now = originalClock');

const smokerJob={age:40,term:25,smoker:'smoker',occupation:'Self-employed Director - Company - Admin only',waiver:'Yes'};
const privateCi=calculate(65,50000,10000,smokerJob);
assert.match(node('acceleratedSource').textContent,/1078482136.*profissão e ao vínculo informados/);
assert.match(node('acceleratedOffers').innerHTML,/Legal &amp; General<\/dt><dd><b>£22\.68\/mês<\/b> · 24 anos de prazo/);
assert.ok(node('acceleratedOffers').innerHTML.includes('profissão e vínculo conferidos: Director - Company - Admin only (autônomo)'));
assert.ok(!privateCi.text.includes('£22.68'));
calculate(65,50000,10000,{...smokerJob,occupation:'Stock manager'});
assert.ok(!node('acceleratedOffers').innerHTML.includes('profissão e vínculo conferidos'));
