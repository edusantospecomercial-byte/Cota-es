let catalog = { models: {} },
  priorityRows = [],
  priorityGapRows = [],
  observedRows = [],
  reportedRows = [],
  reportedOccupations = new Map(),
  independentPlanQuotes = new Map(),
  verifiedArchiveRows = [],
  validatedCapitalRanges = [],
  capitalTrials = [],
  waiverRows = null,
  individualWaivers = [],
  illustratedLifeRows = [],
  historicalAgeTests = new Map(),
  acceleratedOffers = [],
  maturityDeclines = [],
  coreBreakdowns = new Map(),
  tpdOffers = [],
  fractureOffers = [],
  supplementalLifeRows = [],
  fractureBreakdowns = new Map(),
  lgIllustratedTerms = [],
  lgFixedLife = [],
  lastPayload = null;
const $ = (id) => document.getElementById(id),
  num = (id) => Number($(id).value || 0),
  escapeHtml = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
          character
        ],
    ),
  gbp = (n) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
    }).format(n),
  confidencePt = (value) =>
    ({ low: "baixa", medium: "média", high: "alta" })[value] ||
    value ||
    "não classificada";
const decimalPrice = new Intl.NumberFormat("en-GB", {
  useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2,
});
function displayedPence(price) {
  return Number(decimalPrice.format(price).replace(".", ""));
}
function monthlyTotal(premium, supplement) {
  return (displayedPence(premium) + displayedPence(supplement)) / 100;
}
function toast(s) {
  $("toast").textContent = s;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2200);
}
async function init() {
  const [
    loadedCatalog,
    currentPriorityRows,
    verifiedArchive,
    loadedGapRows,
    loadedWaiverRows,
    loadedObservedRows,
    loadedReports,
    capitalHoldout,
    illustratedLife,
    loadedAccelerated,
    loadedMaturityDeclines,
    loadedIndividualWaivers,
    avivaLife,
    loadedLgTerms,
    loadedTpdOffers,
    loadedAvivaBreakdowns,
    loadedZurichBreakdowns,
    loadedLgBreakdowns,
    loadedFractureOffers,
    loadedFractureBreakdowns,
    loadedOccupations,
    comparisonIndex,
    loadedSupplementalLife,
    historicalPolicies,
  ] = await Promise.all([
    fetch("./data/models.json", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ models: {} })),
    fetch("./data/solutionbuilder-priority-providers-2026-11-20.csv", {
      cache: "no-store",
    })
      .then((r) => r.text())
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/verified-archive-terms.csv", {
      cache: "no-store",
    })
      .then((r) => r.text())
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/solutionbuilder-priority-provider-gaps-2026-11-20.csv", {
      cache: "no-store",
    })
      .then((r) => r.text())
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/comparisons-with-waiver.csv", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw Error("Comparativos indisponíveis");
        return response.text();
      })
      .then(parsePriorityCsv)
      .catch(() => null),
    fetch("./data/live-captures-2026-11-22.csv", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw Error("Capturas indisponíveis");
        return response.text();
      })
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/solutionbuilder-observed-2026-11-24.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/capital-validation-holdout.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/zurich-illustrated-life.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/accelerated-comparisons.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/accelerated-maturity-declines.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/waiver-individual-offers.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/aviva-illustrated-life.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/lg-illustrated-terms.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/independent-ci-tpd.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/aviva-core-breakdowns.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/zurich-core-breakdowns.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/lg-core-breakdowns.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "")
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch("./data/fracture-comparisons.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "").then(parsePriorityCsv).catch(() => []),
    fetch("./data/fracture-breakdowns.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "").then(parsePriorityCsv).catch(() => []),
    fetch("./data/occupation-basis.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "").then(parsePriorityCsv).catch(() => []),
    fetch("./data/comparison-pdf-index.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "").then(parsePriorityCsv).catch(() => []),
    fetch("./data/supplemental-life-offers.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "").then(parsePriorityCsv).catch(() => []),
    fetch("./data/illustration-validation-2026-11-19.csv", { cache: "no-store" })
      .then(response => response.ok ? response.text() : "").then(parsePriorityCsv).catch(() => []),
  ]);
  lgFixedLife = historicalPolicies.filter(row => row.provider === "Legal & General" && row.to_age === "" &&
    row.product === "Life" && row.critical_illness_component === "0" &&
    ["None", "Waiver of Premium"].includes(row.optional_features));
  supplementalLifeRows = loadedSupplementalLife;
  showComparisonInventory(comparisonIndex, [loadedReports, verifiedArchive, loadedWaiverRows,
    loadedIndividualWaivers, loadedAccelerated, loadedMaturityDeclines, loadedTpdOffers, loadedFractureOffers, loadedSupplementalLife]);
  reportedOccupations = new Map(loadedOccupations.map(row => [row.sha256, row]));
  fractureOffers = loadedFractureOffers;
  fractureBreakdowns = new Map(loadedFractureBreakdowns.map(row => [row.provider + "|" + row.comparison_sha256, row]));
  coreBreakdowns = new Map([
    ...loadedAvivaBreakdowns.map(row => ["Aviva|" + row.comparison_sha256, row]),
    ...loadedZurichBreakdowns.map(row => ["Zurich|" + row.comparison_sha256, row]),
    ...loadedLgBreakdowns.map(row => ["Legal & General|" + row.comparison_sha256, row]),
  ]);
  tpdOffers = loadedTpdOffers;
  lgIllustratedTerms = loadedLgTerms;
  individualWaivers = loadedIndividualWaivers;
  acceleratedOffers = loadedAccelerated;
  maturityDeclines = loadedMaturityDeclines;
  illustratedLifeRows = illustratedLife.map(row => ({ ...row, provider: "Zurich" })).concat(
    avivaLife.map(row => ({ ...row, provider: "Aviva", policy_count: "1", discount_monthly: "0.00" })));
  historicalAgeTests = globalThis.validateIllustratedAges(illustratedLifeRows);
  reportedRows = loadedReports;
  independentPlanQuotes = globalThis.buildIndependentPlans(reportedRows);
  const trials = evaluateCapitalTrials(loadedReports, capitalHoldout);
  capitalTrials = trials;
  validatedCapitalRanges = buildCapitalRanges(trials, capitalHoldout);
  showCapitalAccuracy(trials, capitalHoldout.length);
  observedRows = loadedObservedRows;
  waiverRows = loadedWaiverRows;
  catalog = loadedCatalog;
  priorityRows = currentPriorityRows;
  priorityGapRows = loadedGapRows;
  verifiedArchiveRows = verifiedArchive;
  const reportCount = new Set(reportedRows.map(row => row.model_id)).size;
  const priceCount = reportedRows.filter(row => row.available === "true").length;
  const unavailableCount = reportedRows.filter(row => row.available === "false").length;
  const unlistedCount = reportedRows.filter(row => row.available === "unknown").length;
  const baseStatus = reportCount
    ? [`Coleta iniciada em 24/11/2026 · ${reportCount} cenários · ${priceCount} mensalidades · ${unavailableCount} respostas sem preço`]
    : ["Comparativos da coleta de novembro indisponíveis"];
  if (unlistedCount) baseStatus.push(`Produto ausente do relatório em ${unlistedCount} consultas por seguradora`);
  if (catalog.calibratedRecords) {
    const count = new Intl.NumberFormat("pt-BR").format(catalog.calibratedRecords);
    baseStatus.push(`Catálogo histórico com ${count} registros`);
  }
  const archive = catalog.audit;
  if (archive?.illustrationValidationRecords && archive.illustrationValidationDocuments) {
    baseStatus.push(`Arquivo de validação com ${archive.illustrationValidationRecords} registros em ${archive.illustrationValidationDocuments} illustrations distintas`);
  }
  const temporalHoldout = catalog.audit?.priorityProviderTemporalHoldout;
  if (temporalHoldout) {
    baseStatus.push(`Arquivo histórico · teste temporal: ${Number(temporalHoldout.mape * 100).toFixed(2)}% de erro médio percentual absoluto em ${temporalHoldout.predicted} preços · cobertura ${Number(temporalHoldout.coverage * 100).toFixed(2)}%`);
  }
  $("baseStatus").textContent = baseStatus.join(". ");
  updateProfile();
  updateMetlife();
  loadSaved();
}
function parsePriorityCsv(csv) {
  let [header, ...lines] = csv.trim().split(/\r?\n/),
    columns = header.split(",");
  return lines.map((line) =>
    Object.fromEntries(
      line.split(",").map((value, index) => [columns[index], value]),
    ),
  );
}
// Deduplicate reprints by the reference on the PDF, even when the PDF bytes differ.
function comparisonInventory(index, tables) {
  if (!index.length || tables.length !== 9 || tables.some(rows => !rows?.length)) return null;
  const reportByHash = new Map(index.map(row => [row.sha256, row.report_key]));
  if (reportByHash.size !== index.length || index.some(row =>
    !/^[a-f0-9]{64}$/.test(row.sha256) || !/^[a-f0-9]{32}$/.test(row.report_key))) return null;
  const byInsurer = { Zurich: 0, "Legal & General": 0, Aviva: 0 };
  const offers = new Map(), usedHashes = new Set();
  for (const rows of tables) {
    for (const row of rows) {
      const report = reportByHash.get(row.sha256);
      if (!report || !Object.hasOwn(byInsurer, row.provider)) return null;
      usedHashes.add(row.sha256);
      const key = report + "|" + row.provider;
      const smoker = /^(true|yes)$/i.test(row.smoker);
      if (!/^(true|false|yes|no)$/i.test(row.smoker) || !/^\d+$/.test(row.to_age)) return null;
      const item = offers.get(key) || { report, smoker, toAge: row.to_age, provider: row.provider };
      if (smoker !== item.smoker || row.to_age !== item.toAge) return null;
      if (row.monthly_premium) {
        if (!/^\d+\.\d{2}$/.test(row.monthly_premium)) return null;
        const pence = Math.round(Number(row.monthly_premium) * 100);
        if (pence <= 0 || (item.pence && item.pence !== pence)) return null;
        item.pence = pence;
        if (row.provider === "Legal & General" && row.to_age === "65" && row.quoted_term) {
          if (item.legalTerm && item.legalTerm !== row.quoted_term) return null;
          item.legalTerm = row.quoted_term;
          item.oneYearShort = Number(row.age) + Number(/^(\d+) years?$/.exec(row.quoted_term)?.[1]) === 64;
        }
        if ((row.available === "true" || /^[a-f0-9]{64}$/.test(row.no_riders_illustration_sha256 || "")) &&
            row.to_age === "65" && row.quoted_term === "To Age 65" &&
            row.occupation_rated === "No" && (!row.quoted_tpd || row.quoted_tpd === "None") &&
            row.quoted_life_cover === row.life_cover && row.quoted_critical_illness_cover === row.critical_illness_cover)
          item.standard65 = true;
      }
      offers.set(key, item);
    }
  }
  if (usedHashes.size !== reportByHash.size) return null;
  const priced = [...offers.values()].filter(item => item.pence);
  for (const item of priced) byInsurer[item.provider]++;
  return { prices: priced.length, reports: new Set(priced.map(item => item.report)).size,
    byInsurer, smokers: priced.filter(item => item.smoker).length,
    requested65: priced.filter(item => item.toAge === "65").length,
    legal65: priced.filter(item => item.provider === "Legal & General" && item.toAge === "65").length,
    legal65Shorter: priced.filter(item => item.oneYearShort).length,
    standard65: priced.filter(item => item.standard65).length,
    standardSmokers65: priced.filter(item => item.standard65 && item.smoker).length,
    withoutPrice: offers.size - priced.length };
}

function showComparisonInventory(index, tables) {
  const count = comparisonInventory(index, tables);
  if (!count) {
    $("comparisonInventoryTitle").textContent = "Contagem dos comparativos indisponível";
    $("comparisonInventoryScope").textContent = "A contagem exige todas as fontes de preços e o índice dos PDFs correspondentes.";
    $("comparisonInventoryProviders").textContent = "";
    return;
  }
  const n = value => value.toLocaleString("pt-BR");
  $("comparisonInventoryTitle").textContent = n(count.prices) + " mensalidades documentadas em " + n(count.reports) + " comparativos";
  $("comparisonInventoryProviders").textContent = Object.entries(count.byInsurer)
    .map(([provider, value]) => provider + " " + n(value)).join(" · ") + ". Cada seguradora conta uma vez por relatório com preço.";
  $("comparisonInventoryScope").textContent = "Há " + n(count.smokers) + " preços para fumantes. Dos " + n(count.requested65) +
    " preços em pedidos até os 65 anos, " + n(count.standard65) +
    " correspondem ao prazo e aos capitais pedidos para vida ou doenças graves independentes, com tarifa sem ajuste por profissão e sem adicionais. " +
    n(count.standardSmokers65) + " desses preços são para fumantes. Há ainda " + n(count.withoutPrice) + " respostas sem valor.";
  if (count.legal65Shorter) $("comparisonInventoryScope").textContent += " Em " + n(count.legal65Shorter) +
    " de " + n(count.legal65) + " preços da Legal & General para pedidos até os 65, o prazo oferecido em anos foi um ano menor que a diferença entre 65 e a idade informada.";
}

function interpolateRiskPremium(below, above, ratio) {
  if (below > 0 && above > 0)
    return Math.exp(Math.log(below) + (Math.log(above) - Math.log(below)) * ratio);
  return below + (above - below) * ratio;
}
function capitalAxis(lower, upper) {
  return Number(lower.life_cover) === Number(upper.life_cover) ? "critical_illness_cover" : "life_cover";
}

function priceAlongCapital(lower, upper, capital) {
  const axis = capitalAxis(lower, upper);
  const fraction = (capital - Number(lower[axis])) / (Number(upper[axis]) - Number(lower[axis]));
  return Number(lower.monthly_premium) + fraction * (Number(upper.monthly_premium) - Number(lower.monthly_premium));
}

function evaluateCapitalTrials(reports, holdout) {
  const byId = new Map(reports.map(row => [[row.model_id, row.provider].join("|"), row]));
  const comparable = [];
  for (const trial of holdout) {
    const [lower, upper, check] = [trial.lower_model_id, trial.upper_model_id, trial.holdout_model_id]
      .map(id => byId.get([id, trial.provider].join("|")));
    if (![lower, upper, check].every(row => row?.available === "true" && Number(row.monthly_premium) > 0)) continue;
    if ([lower, upper, check].some(row => row.quoted_life_cover !== row.life_cover ||
      row.quoted_critical_illness_cover !== row.critical_illness_cover)) continue;
    const axis = capitalAxis(lower, upper);
    const fixedAxis = axis === "life_cover" ? "critical_illness_cover" : "life_cover";
    // A capture session can cross midnight. Both anchors must predate the blind
    // test and come from the same day or two consecutive calendar days.
    const anchorDaysApart = Math.abs(Date.parse(lower.source_date) - Date.parse(upper.source_date)) / 86_400_000;
    if (!(anchorDaysApart <= 1) || check.source_date < lower.source_date || check.source_date < upper.source_date ||
        Number(check.model_id) <= Math.max(Number(lower.model_id), Number(upper.model_id))) continue;
    if (["age", "smoker", "to_age", fixedAxis, "product", "quoted_term", "occupation_rated"]
      .some(field => lower[field] !== upper[field] || lower[field] !== check[field])) continue;
    const capital = Number(check[axis]);
    if (!(Number(lower[axis]) < capital && capital < Number(upper[axis]))) continue;
    const estimate = priceAlongCapital(lower, upper, capital);
    const error = Math.abs(estimate - Number(check.monthly_premium));
    if (!Number.isFinite(Number(trial.predicted_monthly)) || Math.abs(estimate - Number(trial.predicted_monthly)) > 0.000051) continue;
    comparable.push({ lower, upper, check, axis, error, forecast: trial.predicted_monthly, passed: error <= 1 && error / Number(check.monthly_premium) <= 0.05 });
  }
  return comparable;
}

function showCapitalAccuracy(trials, registered) {
  const panel = $("capitalAccuracy");
  panel.hidden = !trials.length;
  if (!trials.length) return;
  const matched = trials.filter(trial => trial.passed).length;
  const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(matched / trials.length);
  const mean = trials.reduce((sum, trial) => sum + trial.error, 0) / trials.length;
  const profiles = [...new Set(trials.map(({ check }) =>
    check.age + " anos, " + (check.smoker === "Yes" ? "fumante" : "não fumante")))].sort();
  $("capitalAccuracySummary").textContent =
    `${matched} de ${trials.length} previsões comparáveis (${pct}) ficaram a até £1 e 5% da mensalidade oficial. Diferença média absoluta de ${gbp(mean)}/mês.`;
  const scenarios = new Set(trials.map(({ check }) => check.model_id)).size;
  $("capitalAccuracyScope").textContent =
    `${registered} previsões registradas antes da consulta. Os preços comparáveis vieram de ${scenarios} simulações com capitais intermediários. Os perfis testados foram ${profiles.join(" · ")}. A medição cobre somente esses intervalos de capital e as condições registradas no relatório.`;
}

// The threshold is strict. Round the registered insurer premium to a penny before adding MetLife.
function budgetEvidence(p, m, source = capitalTrials) {
  if (!(p.monthlyBudget > 0) || m.unavailable || p.waiver === "Yes") return null;
  const limit = displayedPence(p.monthlyBudget), metlife = displayedPence(m.total);
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const trials = source.filter(({check}) => Number(check.age) === p.age && check.smoker === smoker &&
    Number(check.to_age) === p.toAge && check.quoted_term === "To Age " + p.toAge &&
    check.occupation_rated === "No" && (check.quoted_tpd || "None") === "None" &&
    (Number(check.life_cover) > 0) === (p.life > 0) && (Number(check.critical_illness_cover) > 0) === (p.ci > 0));
  if (!trials.length) return null;
  const reports = new Set(), seen = new Set(), byProvider = new Map();
  let predictedBelow = 0, stayedBelow = 0, missedBelow = 0, closest = Infinity;
  for (const {check, forecast} of trials) {
    const key = check.model_id + "|" + check.provider;
    if (seen.has(key)) return null;
    seen.add(key);
    const predicted = Math.floor((Math.round(Number(forecast) * 10000) + 50) / 100) + metlife;
    const actual = Math.round(Number(check.monthly_premium) * 100) + metlife;
    if (predicted < limit) {
      predictedBelow++;
      if (actual < limit) stayedBelow++;
    } else if (actual < limit) missedBelow++;
    closest = Math.min(closest, Math.abs(predicted - limit));
    const stats = byProvider.get(check.provider) || {trials:0, largestIncrease:0};
    stats.trials++;
    stats.largestIncrease = Math.max(stats.largestIncrease, actual - predicted);
    byProvider.set(check.provider, stats);
    reports.add(check.model_id);
  }
  return {count:trials.length, reports:reports.size, predictedBelow, stayedBelow, missedBelow, closest, byProvider};
}

function showBudgetEvidence(p, m, result) {
  const el = $("budgetAccuracy"), stats = budgetEvidence(p,m);
  el.hidden = !(p.monthlyBudget > 0) || m.unavailable;
  if (el.hidden) { el.textContent = ""; return ""; }
  const cover = p.ci && p.life ? "vida com diagnóstico independente" : p.life ? "vida" : "diagnóstico independente";
  const scope = p.age + " anos, " + (p.smoker === "smoker" ? "fumante" : "não fumante") + ", " + cover + " até os " + p.toAge;
  if (!stats) {
    el.textContent = "Para " + scope + (p.waiver === "Yes" ? ", com isenção de mensalidade" : "") +
      ", a base ainda não tem testes de orçamento comparáveis.";
    return "";
  }
  const threshold = gbp(p.monthlyBudget);
  el.textContent = "Orçamento de " + threshold + "/mês. Para " + scope + ", houve " + stats.count +
    " preços testados em " + stats.reports + " comparativos, com a mesma modalidade e prazo. Somando " + gbp(m.total) +
    " da MetLife a cada prêmio, " + stats.predictedBelow + " previsões ficaram abaixo do teto e " + stats.stayedBelow +
    " delas continuaram abaixo no comparativo. Entre as demais, " + stats.missedBelow +
    " acabaram abaixo. A previsão testada mais próxima ficou a " + gbp(stats.closest / 100) + " do teto.";
  const provider = stats.byProvider.get(result.provider);
  if (!result.capitalRange || !result.complete || !provider) return "";
  const margin = displayedPence(p.monthlyBudget) - displayedPence(result.main) - displayedPence(m.total);
  if (!(margin > 0 && provider.largestIncrease >= margin)) return "";
  return "A estimativa deixa " + gbp(margin / 100) + " até o teto. Em " + provider.trials +
    " testes comparáveis da " + result.provider + ", a maior diferença para cima foi " +
    gbp(provider.largestIncrease / 100) + "/mês. Confirme o prêmio antes de contar com essa margem.";
}

function premiumRangeText(r) {
  if (r.aggregateOnly && displayedPence(r.low) === 0)
    return "Mensalidade mínima da proteção principal a confirmar. Limite superior estimado de " + gbp(r.high) + "/mês.";
  let label = "Faixa provável";
  if (r.detailed) label = r.termPending ? "Faixa das alternativas devolvidas" : "Faixa para a idade final solicitada";
  else if (r.providerQuotes?.length) label = r.providerGap ? "Faixa observada entre seguradoras disponíveis" :
    r.priorityExact ? "Faixa observada entre seguradoras" : "Faixa estimada entre seguradoras";
  return label + " de " + gbp(r.low) + " a " + gbp(r.high) + "/mês";
}

function generalBudgetRangeNote(p, m, result) {
  if (!result.complete || !result.aggregateOnly || m.unavailable || !(p.monthlyBudget > 0) ||
      !Number.isFinite(result.low) || !Number.isFinite(result.high)) return "";
  const limit = displayedPence(p.monthlyBudget);
  const extra = displayedPence(m.total);
  const low = displayedPence(result.low) + extra;
  const high = displayedPence(result.high) + extra;
  if (low >= limit || high < limit) return "";
  const option = extra ? " com a MetLife selecionada" : "";
  const range = low === extra
    ? "A faixa do modelo geral" + option + " tem limite superior estimado de " + gbp(high / 100) + "/mês. A mensalidade mínima precisa de confirmação."
    : "A faixa do modelo geral" + option + " vai de " + gbp(low / 100) + " a " + gbp(high / 100) + "/mês.";
  return range + " A cotação da seguradora confirma se o pacote fica abaixo de " + gbp(limit / 100) + "/mês.";
}

function buildCapitalRanges(comparable, holdout) {
  const ranges = comparable.filter(trial => trial.passed);
  const keyOf = (lower, upper, provider) => [lower, upper, provider].join("|");
  const passing = new Set(ranges.map(({ lower, upper, check }) => keyOf(lower.model_id, upper.model_id, check.provider) + "|" + check.model_id));
  const rejected = new Set();
  for (const trial of holdout) {
    const key = keyOf(trial.lower_model_id, trial.upper_model_id, trial.provider);
    if (!passing.has(key + "|" + trial.holdout_model_id)) rejected.add(key);
  }
  return ranges.filter(({ lower, upper, check }) => !rejected.has(keyOf(lower.model_id, upper.model_id, check.provider)));
}

function occupationalBasis(input, ...rows) {
  if (rows.some(r => r.occupation_rated !== "Yes")) return {};
  const evidence = rows.map(r => reportedOccupations.get(r.sha256));
  const first = evidence[0];
  if (!first || !["employed", "self-employed"].includes(first.employment) || !first.occupation ||
      evidence.some((e, i) => !e || e.source_date !== rows[i].source_date || e.model_id !== (rows[i].model_id || rows[i].reference) ||
        e.employment !== first.employment || e.occupation !== first.occupation)) return {};
  const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[()\s-]+/g, " ").trim();
  const job = normalize(first.occupation), entered = normalize(input);
  const statuses = first.employment === "self-employed" ? ["self employed", "autonomo", "autonoma"] :
    ["employed", "empregado", "empregada", "assalariado", "assalariada"];
  const matched = statuses.some(s => entered === job + " " + s || entered === s + " " + job);
  const label = first.occupation + (first.employment === "self-employed" ? " (autônomo)" : " (empregado)");
  return {occupationLabel: label, occupationMatched: matched, occupationNeedsStatus: entered === job};
}

function reportsForOccupation(rows, p) {
  if (!p.occupation) return rows;
  const matching = new Set(rows.filter(row => occupationalBasis(p.occupation, row).occupationMatched)
    .map(row => row.sha256));
  return matching.size ? rows.filter(row => matching.has(row.sha256)) : rows;
}

function historicalOccupationNote(row, p) {
  const basis = occupationalBasis(p.occupation, row);
  if (basis.occupationMatched) return "profissão e vínculo conferidos: " + basis.occupationLabel;
  return basis.occupationLabel ? "preço depende da profissão: " + basis.occupationLabel : "preço depende da profissão";
}

function validatedCapitalQuotes(p) {
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const groups = new Map();
  for (const { lower, upper, check, axis } of validatedCapitalRanges) {
    const varyingLife = axis === "life_cover";
    const capital = varyingLife ? p.life : p.ci;
    const fixedMatches = varyingLife ? Number(lower.critical_illness_cover) === p.ci : Number(lower.life_cover) === p.life;
    if (Number(lower.age) !== p.age || lower.smoker !== smoker || Number(lower.to_age) !== p.toAge ||
        !fixedMatches || capital <= Number(lower[axis]) || capital >= Number(upper[axis])) continue;
    const key = [lower.model_id, upper.model_id, check.model_id].join("|");
    if (!groups.has(key)) groups.set(key, { lower, upper, check, axis, width: Number(upper[axis]) - Number(lower[axis]), quotes: [] });
    groups.get(key).quotes.push({ provider: lower.provider, product: lower.product, term: lower.quoted_term,
      sourceDate: check.source_date, premium: priceAlongCapital(lower, upper, capital),
      testErrorGBP: Math.abs(priceAlongCapital(lower, upper, Number(check[axis])) - Number(check.monthly_premium)),
      occupationRated: lower.occupation_rated === "Yes", ...occupationalBasis(p.occupation, lower, upper, check) });
  }
  const compatible = [...groups.values()].filter(group =>
    new Set(group.quotes.map(q => q.provider)).size === group.quotes.length);
  compatible.sort((a, b) => b.quotes.length - a.quotes.length ||
    b.check.source_date.localeCompare(a.check.source_date) ||
    a.width - b.width);
  const range = compatible[0];
  if (!range) return null;
  const quotes = range.quotes.sort((a, b) => a.premium - b.premium);
  const sameEndAge = quotes.filter(q => (!q.occupationRated || q.occupationMatched) && q.term === `To Age ${p.toAge}`);
  return { quotes, exact: false, capitalRange: range, sameEndAge: sameEndAge.length ? sameEndAge : undefined,
    termPending: !sameEndAge.length, sourceDate: range.check.source_date };
}

function documentedLookupPrice(p, amount) {
  if (!(amount > 0)) return false;
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const matches = row => Number(row.age) === p.age && row.smoker === smoker &&
    Number(row.to_age) === p.toAge && Number(row.life_cover) === p.life;
  if (!p.ci && illustratedLifeRows.some(row => matches(row) && row.policy_count === "1" &&
      Number(row.discount_monthly) === 0 && Number(row.base_monthly) === amount))
    return true;
  return reportedRows.concat(verifiedArchiveRows).some(row => matches(row) && row.available === "true" &&
    Number(row.critical_illness_cover) === p.ci && row.life_cover === row.quoted_life_cover &&
    row.critical_illness_cover === row.quoted_critical_illness_cover && row.occupation_rated === "No" &&
    (!row.quoted_tpd || row.quoted_tpd === "None") &&
    row.quoted_term === `To Age ${p.toAge}` && Number(row.monthly_premium) === amount);
}

function billedPolicyText(row, breakdown) {
  if (!breakdown) return "";
  const shared = Number(row.quoted_earlier_ci_cover) > 0;
  const policies = [[shared ? "vida adicional" : "vida", row.quoted_life_cover, breakdown.life_policy_monthly],
    ["vida ou diagnóstico", row.quoted_earlier_ci_cover, breakdown.earlier_ci_policy_monthly],
    ["diagnóstico independente", row.quoted_independent_ci_cover, breakdown.independent_ci_policy_monthly]];
  if (policies.some(([, cover, price]) => (Number(cover) > 0) !== (Number(price) > 0))) return "";
  const charged = policies.filter(([, cover]) => Number(cover) > 0);
  const billed = charged.reduce((sum, [, , price]) => sum + displayedPence(Number(price)), 0);
  if (!charged.length || billed !== displayedPence(Number(row.monthly_premium))) return "";
  return "<br>Mensalidade cobrada por apólice neste pacote · " + charged.map(([label, , price]) =>
    label + " " + gbp(Number(price))).join(" + ") + ".";
}

function itemisedCiPremium(row, breakdown) {
  if (!breakdown || breakdown.reference !== row.reference || breakdown.total_monthly !== row.monthly_premium) return "";
  if (breakdown.earlier_ci_policy_monthly) return billedPolicyText(row, breakdown);
  const charges = [[Number(row.quoted_earlier_ci_cover) > 0 ? "vida adicional" : "vida", breakdown.life_monthly], ["vida ou diagnóstico", breakdown.earlier_ci_monthly], ["diagnóstico independente", breakdown.independent_ci_monthly],
    ["isenção", breakdown.waiver_monthly], ["incapacidade permanente", breakdown.tpd_monthly],
    ["fraturas da seguradora", breakdown.fracture_monthly]];
  const listed = charges.filter(([, value]) => Number(value) > 0)
    .map(([label, value]) => label + " " + gbp(Number(value))).join(" + ");
  const discount = Number(breakdown.discount_monthly || 0);
  return "<br>Na illustration, a mensalidade reúne " + listed +
    (discount > 0 ? " − desconto por múltiplas apólices " + gbp(discount) : "") + ".";
}

function renderFractureComparison(p) {
  const panel = $("fractureComparison");
  panel.hidden = true;
  panel.open = false;
  $("fractureOffers").innerHTML = "";
  $("fractureSource").textContent = "";
  const smoking = p.smoker === "smoker" ? "Yes" : "No";
  const matching = fractureOffers.filter(row => Number(row.age) === p.age && row.smoker === smoking &&
    Number(row.to_age) === p.toAge && Number(row.life_cover) === p.life &&
    Number(row.earlier_ci_cover || 0) + Number(row.independent_ci_cover || 0) === p.ci);
  if (!matching.length) return;
  const report = [], sources = [];
  for (const independent of [false, true]) {
    const family = matching.filter(row => (Number(row.independent_ci_cover) > 0) === independent);
    if (!family.length) continue;
    const jobReports = reportsForOccupation(family, p);
    const date = jobReports.reduce((d, row) => row.source_date > d ? row.source_date : d, "");
    const terms = !p.ci ? "O pedido foi de seguro de vida com adicional de fraturas."
      : independent ? "O pedido incluía vida, diagnóstico independente, incapacidade permanente e fraturas."
      : "O capital de diagnóstico abaixo é pago por morte ou diagnóstico, no primeiro evento coberto.";
    sources.push("Comparativo de " + date + ". " + terms);
    report.push(...jobReports.filter(row => row.source_date === date));
  }
  $("fractureSource").textContent = sources.join(" ");
  const reasons = { fracture_not_supported: "O produto recusou o adicional de fraturas solicitado.",
    age_not_supported: "A seguradora informou que a idade estava fora do limite do produto.",
    term_not_supported: "A seguradora recusou o prazo solicitado." };
  $("fractureOffers").innerHTML = report.map(row => {
    const label = `<dt>${escapeHtml(row.provider)} · ${escapeHtml(row.reference)}</dt>`;
    if (row.response !== "quoted") return label + "<dd>" + escapeHtml(reasons[row.response] || "Consultar a seguradora.") + "</dd>";
    const detail = [];
    if (Number(row.quoted_life_cover)) detail.push("vida " + gbp(Number(row.quoted_life_cover)));
    if (Number(row.quoted_earlier_ci_cover)) detail.push("vida ou diagnóstico " + gbp(Number(row.quoted_earlier_ci_cover)));
    if (Number(row.quoted_independent_ci_cover)) detail.push("diagnóstico independente " + gbp(Number(row.quoted_independent_ci_cover)));
    detail.push(row.quoted_term.startsWith("To Age ") ? "até os " + row.quoted_term.slice(7) + " anos" : row.quoted_term);
    if (row.tpd_basis !== "None") detail.push("TPD " + row.tpd_basis);
    if (/^\d+$/.test(row.waiver_to)) detail.push("idade-limite da isenção " + row.waiver_to + " anos");
    else if (row.waiver_to === "Expiry") detail.push("isenção até o fim do contrato");
    if (row.occupation_rated === "Yes") detail.push(historicalOccupationNote(row, p));
    const part = fractureBreakdowns.get(row.provider + "|" + row.sha256);
    const itemised = itemisedCiPremium(row, part);
    if (itemised && /^\d+$/.test(part.fracture_to_age)) detail.push("fraturas até os " + part.fracture_to_age + " anos");
    const plain = itemised && Number(part.plain_with_waiver_monthly);
    const pair = plain > 0 ? "<br>No mesmo dia, a seguradora cotou o mesmo perfil e os mesmos capitais com isenção, sem fraturas, por " +
      gbp(plain) + "/mês (comparativo " + escapeHtml(part.plain_reference) + "). A diferença entre as mensalidades foi de " +
      gbp(Math.abs(Number(row.monthly_premium) - plain)) + "." : "";
    return label + `<dd><b>${gbp(Number(row.monthly_premium))}/mês</b> · ${escapeHtml(detail.join(" · "))}${itemised || "<br>O pedido incluía fraturas. A inclusão do adicional precisa de confirmação na illustration da seguradora."}${pair}</dd>`;
  }).join("");
  panel.hidden = false;
}

function renderCiComparison(p, independentTpd = false) {
  const prefix = independentTpd ? "tpd" : "accelerated";
  const offers = independentTpd ? tpdOffers : acceleratedOffers;
  const requestedCi = independentTpd ? "independent_ci_cover" : "earlier_ci_cover";
  const panel = $(prefix + "Comparison");
  panel.hidden = true;
  panel.open = false;
  $(prefix + "Offers").textContent = "";
  if (!p.ci) return;
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const matching = offers.filter(row => row.smoker === smoker &&
    Number(row.age) === p.age && Number(row.to_age) === p.toAge &&
    Number(row.life_cover) === p.life && Number(row[requestedCi]) === p.ci);
  if (!matching.length) {
    if (independentTpd) return;
    const refusals = maturityDeclines.filter(row => row.smoker === smoker && Number(row.age) === p.age &&
      Number(row.to_age) === p.toAge && Number(row.life_cover) === p.life && Number(row.earlier_ci_cover) === p.ci);
    if (!refusals.length) return;
    const latest = refusals.reduce((a, b) => a.source_date > b.source_date ||
      (a.source_date === b.source_date && Number(a.reference) > Number(b.reference)) ? a : b);
    const report = refusals.filter(row => row.reference === latest.reference);
    if (report.length !== 3 || new Set(report.map(row => row.provider)).size !== 3) return;
    $(prefix + "Source").textContent = "Em " + latest.source_date + ", as três seguradoras responderam ao pedido de vida ou diagnóstico antecipado até os " +
      p.toAge + " anos. Referência " + latest.reference + ".";
    $(prefix + "Offers").innerHTML = report.map(row => {
      const maximum = /^maximum_maturity_(\d+)$/.exec(row.maturity_reason);
      const reason = maximum ? "O produto admitia término até os " + maximum[1] + " anos nesse relatório." :
        "A seguradora informou que a idade de término estava fora do limite do produto.";
      return "<dt>" + escapeHtml(row.provider) + "</dt><dd>Sem preço. " + reason + "</dd>";
    }).join("");
    panel.hidden = false;
    return;
  }
  const referencesWithWaiverColumn = new Set(matching.filter(row => row.waiver_to !== "not_shown").map(row => row.reference));
  const requestedWaiver = p.waiver === "Yes";
  const comparable = matching.filter(row => referencesWithWaiverColumn.has(row.reference) === requestedWaiver);
  const candidates = reportsForOccupation(comparable.length ? comparable : matching, p);
  const latest = candidates.reduce((a, b) => a.source_date > b.source_date ||
    (a.source_date === b.source_date && Number(a.reference) > Number(b.reference)) ? a : b);
  const prices = candidates.filter(row => row.reference === latest.reference)
    .sort((a, b) => Number(a.monthly_premium) - Number(b.monthly_premium));
  const metlife = metlifeForAge(ml(), p.age);
  const entries = prices.map(row => {
    const waiver = row.waiver_to === "Expiry" ? "isenção até o fim do contrato" :
      /^\d+$/.test(row.waiver_to) ? "isenção durante a vigência, com idade-limite informada de " + row.waiver_to + " anos" :
      "prazo de isenção sem confirmação";
    const term = row.quoted_term.startsWith("To Age ") ? "até os " + row.quoted_term.slice(7) + " anos" :
      row.quoted_term.split(" ")[0] + " anos de prazo";
    const detail = [term];
    if (Number(row.quoted_life_cover) > 0) detail.push("vida " + gbp(Number(row.quoted_life_cover)));
    if (Number(row.quoted_independent_ci_cover) > 0)
      detail.push("diagnóstico independente " + gbp(Number(row.quoted_independent_ci_cover)));
    if (Number(row.quoted_earlier_ci_cover) > 0)
      detail.push("vida ou diagnóstico " + gbp(Number(row.quoted_earlier_ci_cover)));
    if (Number(row.quoted_life_cover) !== p.life ||
        Number(row.quoted_independent_ci_cover || 0) + Number(row.quoted_earlier_ci_cover || 0) !== p.ci)
      detail.push("o pedido original incluía " + gbp(p.life) + " de vida e " + gbp(p.ci) + " de diagnóstico");
    detail.push(waiver, row.tpd_basis === "None" ? "oferta sem TPD" : "TPD " + row.tpd_basis);
    if (row.occupation_rated === "Yes") detail.push(historicalOccupationNote(row, p));
    const itemised = independentTpd
      ? billedPolicyText(row, row.illustration_sha256 && row)
      : itemisedCiPremium(row, coreBreakdowns.get(row.provider + "|" + row.sha256));
    const price = Number(row.monthly_premium);
    const packageText = metlife.c ? "<br>Com " + gbp(metlife.total) + " de MetLife, esta opção soma " +
      gbp(monthlyTotal(price, metlife.total)) + "/mês." : "";
    return `<dt>${escapeHtml(row.provider)}</dt><dd><b>${gbp(price)}/mês</b> · ${escapeHtml(detail.join(" · "))}${itemised}${packageText}</dd>`;
  });
  $(prefix + "Source").textContent = "Comparativo de " + latest.source_date +
    " · referência " + latest.reference + ". " +
    (referencesWithWaiverColumn.has(latest.reference) ? "O relatório traz uma coluna de isenção. Confira a resposta de cada seguradora." :
      "O relatório não informa isenção nas ofertas.");
  if (candidates.some(row => row.reference === latest.reference && occupationalBasis(p.occupation, row).occupationMatched))
    $(prefix + "Source").textContent += " O relatório corresponde à profissão e ao vínculo informados.";
  $(prefix + "Offers").innerHTML = entries.join("");
  panel.hidden = false;
  return prices;
}

function avivaLifeInPackage(p) {
  if (!p.life || p.ci || p.waiver === "Yes") return null;
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const matches = [];
  for (const offer of acceleratedOffers) {
    if (offer.provider !== "Aviva" || offer.occupation_rated !== "No" || offer.smoker !== smoker ||
        Number(offer.age) !== p.age || offer.quoted_term !== `To Age ${p.toAge}` ||
        Number(offer.quoted_life_cover) !== p.life || Number(offer.quoted_earlier_ci_cover) <= 0) continue;
    const part = coreBreakdowns.get("Aviva|" + offer.sha256);
    if (part && part.reference === offer.reference && part.total_monthly === offer.monthly_premium &&
        part.life_cover === offer.quoted_life_cover && part.earlier_ci_cover === offer.quoted_earlier_ci_cover &&
        part.source_date === offer.source_date && Number(part.life_monthly) > 0) matches.push(part);
  }
  if (!matches.length) return null;
  matches.sort((a, b) => b.source_date.localeCompare(a.source_date) || b.reference.localeCompare(a.reference));
  const latest = matches[0];
  return matches.some(r => r.source_date === latest.source_date && r.life_monthly !== latest.life_monthly) ? null : latest;
}

function illustratedLifeFor(p, provider) {
  if (!p.life || p.ci || p.waiver === "Yes") return null;
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const matching = illustratedLifeRows.filter(row => Number(row.age) === p.age && row.smoker === smoker &&
    Number(row.to_age) === p.toAge && Number(row.life_cover) === p.life && (!provider || row.provider === provider));
  const newestByProvider = [];
  for (const name of new Set(matching.map(row => row.provider))) {
    const carrier = matching.filter(row => row.provider === name);
    const latestDate = carrier.reduce((d, row) => row.source_date > d ? row.source_date : d, "");
    const recent = carrier.filter(row => row.source_date === latestDate);
    if (new Set(recent.map(row => row.base_monthly)).size === 1)
      newestByProvider.push(recent.find(row => row.policy_count === "1") || recent[0]);
  }
  newestByProvider.sort((a, b) => b.source_date.localeCompare(a.source_date) ||
    Number(b.policy_count === "1") - Number(a.policy_count === "1") || Number(a.base_monthly) - Number(b.base_monthly));
  return newestByProvider[0] || null;
}

function lgFixedTermNote(p, metlife) {
  const requested = p.toAge - p.age;
  const matches = lgFixedLife.filter(row => Number(row.age) === p.age && Number(row.life_component) === p.life &&
    row.smoker === String(p.smoker === "smoker") && [requested, requested - 1].includes(Number(row.term_years)));
  if (!matches.length) return "";
  matches.sort((a, b) => Number(b.term_years) - Number(a.term_years) || b.source_date.localeCompare(a.source_date));
  const latest = matches[0];
  if (matches.some(row => row.term_years === latest.term_years && row.source_date === latest.source_date &&
    (row.total_monthly !== latest.total_monthly || row.base_life_monthly !== latest.base_life_monthly ||
      row.optional_monthly !== latest.optional_monthly))) return "";
  const price = Number(latest.total_monthly);
  const waiver = Number(latest.optional_monthly);
  return "Legal & General · " + latest.source_date + " · referência de vida por prazo fixo de " +
    latest.term_years + " anos. O pedido atual é até os " + p.toAge + " anos (" + requested +
    " anos pela idade informada). O documento informa apenas a duração. Vida " + gbp(Number(latest.base_life_monthly)) +
    (waiver ? " + isenção " + gbp(waiver) + " = " + gbp(price) : "") + "/mês." +
    (metlife.c && !metlife.unavailable ? " Com a MetLife selecionada, o total para esse prazo fixo seria " +
      gbp(monthlyTotal(price, metlife.total)) + "/mês." : "");
}

function lgTermReference(p, metlife) {
  if (!p.life || p.ci) return "";
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const matching = lgIllustratedTerms.filter(row => Number(row.age) === p.age && row.smoker === smoker &&
    Number(row.to_age) === p.toAge && Number(row.life_cover) === p.life);
  if (!matching.length) return lgFixedTermNote(p, metlife);
  const latest = matching.reduce((a, b) => a.source_date >= b.source_date ? a : b);
  const contemporaries = matching.filter(row => row.source_date === latest.source_date);
  const signature = row => [row.term_years, row.base_monthly, row.waiver_monthly, row.policy_monthly, row.reported_tpd].join("|");
  if (contemporaries.some(row => signature(row) !== signature(latest))) return "";
  return "Legal & General · " + latest.source_date + " · pedido até os " + latest.to_age +
    " anos. Prazo oferecido de " + latest.term_years + " anos. Vida " + gbp(Number(latest.base_monthly)) +
    " + isenção " + gbp(Number(latest.waiver_monthly)) + " = " + gbp(Number(latest.policy_monthly)) +
    "/mês na illustration " + latest.reference + "." +
    (latest.reported_tpd === "Own" ? " O comparativo indica TPD para a própria profissão. A illustration discrimina vida e isenção." : "") +
    (metlife.c && !metlife.unavailable ? " Com " + gbp(metlife.total) + " de MetLife, a referência para esse prazo soma " +
      gbp(monthlyTotal(Number(latest.policy_monthly), metlife.total)) + "/mês." : "");
}

function supplementalLifeNote(p, m, source = supplementalLifeRows) {
  if (!p.life || p.ci) return "";
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const matching = source.filter(row => row.smoker === smoker && Number(row.age) === p.age &&
    Number(row.to_age) === p.toAge && (Number(row.life_cover) === p.life || Number(row.quoted_life_cover) === p.life));
  if (!matching.length) return "";
  const notes = new Set();
  const configurations = new Map();
  for (const row of matching) {
    const key = [row.provider, row.quoted_tpd, row.waiver_to, row.life_cover, row.quoted_life_cover, row.quoted_term].join("|");
    if (!configurations.has(key)) configurations.set(key, []);
    configurations.get(key).push(row);
  }
  for (const offers of configurations.values()) {
    const newest = offers.reduce((date, row) => row.source_date > date ? row.source_date : date, "");
    for (const row of offers.filter(row => row.source_date === newest)) {
      const waiver = row.no_riders_illustration_sha256 ? "a illustration confirma vida sem adicionais" :
        row.waiver_to === "Expiry" ? "isenção de mensalidade até o fim do contrato" :
        /^\d+$/.test(row.waiver_to) ? "idade-limite da isenção de mensalidade de " + row.waiver_to + " anos" :
        row.waiver_to === "not_requested" ? "isenção de mensalidade não solicitada" : "isenção de mensalidade sem confirmação";
      const term = row.quoted_term.startsWith("To Age ") ? "até os " + row.quoted_term.slice(7) + " anos" :
        "por " + row.quoted_term.split(" ")[0] + " anos de prazo";
      const premium = Number(row.monthly_premium);
      const metlife = m.c && !m.unavailable ? " Com a MetLife selecionada, esse cenário soma " + gbp(premium + m.total) + "/mês." : "";
      let details = waiver;
      const years = /^(\d+) years?$/.exec(row.quoted_term);
      if (years && Number(years[1]) < p.toAge - p.age)
        details += ". O pedido até os " + p.toAge + " anos representa " + (p.toAge - p.age) + " anos pela idade informada";
      if (row.quoted_tpd === "Own")
        details += ". O relatório indica própria profissão na coluna de incapacidade permanente (TPD)";
      if (row.waiver_illustration_sha256 && Number(row.illustrated_waiver_monthly) > 0)
        details += ". A illustration discrimina " + gbp(Number(row.illustrated_waiver_monthly)) + "/mês de isenção dentro do prêmio";
      const original = Number(row.life_cover) !== p.life ? "Para um pedido original de " + gbp(Number(row.life_cover)) + ", " : "";
      notes.add(original + row.provider + " ofereceu " + gbp(Number(row.quoted_life_cover)) + " " + term + " por " + gbp(premium) +
        "/mês em " + newest + " (" + details + ")." + metlife);
    }
  }
  const adjusted = matching.some(row => Number(row.life_cover) !== p.life);
  const intro = adjusted ? "O capital desta simulação aparece como valor oferecido em um pedido diferente. " :
    "Pedido histórico de " + gbp(p.life) + " de vida até os " + p.toAge + " anos. ";
  return intro + [...notes].join(" ");
}

function lifeWithinBudget(p, m, rows = reportedRows.concat(verifiedArchiveRows)) {
  if (!(p.monthlyBudget > 0 && p.life > 0) || m.unavailable) return null;
  const budget = displayedPence(p.monthlyBudget), extra = displayedPence(m.total);
  const smoking = p.smoker === "smoker" ? "Yes" : "No";
  const groups = new Map();
  if (p.waiver === "Yes") {
    if (p.ci || !waiverRows) return null;
    const candidates = waiverRows.concat(individualWaivers).filter(row => Number(row.age) === p.age &&
      Number(row.to_age) === p.toAge && (row.smoker === "True") === (smoking === "Yes"));
    for (const life of new Set(candidates.map(row => Number(row.life_cover)))) {
      if (!(life > 0 && life < p.life)) continue;
      for (const quote of waiverComparisonFor({...p, life}).sameEndAge || []) {
        // The waiver must last through the requested protection term.
        if (quote.waiverTo !== "Expiry" && !(Number(quote.waiverTo) >= p.toAge)) continue;
        groups.set(life + "|" + quote.provider, [{life, price: quote.premium, provider: quote.provider,
          date: quote.sourceDate, ref: quote.modelId, product: quote.product}]);
      }
    }
  } else {
    for (const row of rows) {
      const life = Number(row.life_cover);
      if (Number(row.age) !== p.age || Number(row.to_age) !== p.toAge || row.smoker !== smoking ||
          Number(row.critical_illness_cover) !== p.ci || !(life > 0 && life < p.life)) continue;
      const valid = row.available === "true" && row.quoted_life_cover === row.life_cover &&
        row.quoted_critical_illness_cover === row.critical_illness_cover && row.quoted_term === "To Age " + p.toAge &&
        (row.quoted_tpd || "None") === "None" && (row.occupation_rated === "No" ||
          (row.occupation_rated === "Yes" && occupationalBasis(p.occupation, row).occupationMatched));
      const key = life + "|" + row.provider, group = groups.get(key) || [];
      group.push({life, provider: row.provider, product: row.product, date: row.source_date, ref: row.model_id,
        price: valid ? Number(row.monthly_premium) : null});
      groups.set(key, group);
    }
  }
  if (!p.ci) {
    for (const row of supplementalLifeRows) {
      const life = Number(row.quoted_life_cover);
      if (Number(row.age) !== p.age || Number(row.to_age) !== p.toAge || row.smoker !== smoking ||
          (row.quoted_tpd || "None") !== "None" || row.occupation_rated !== "No" ||
          row.quoted_term !== "To Age " + p.toAge || !(life > 0 && life < p.life)) continue;
      const eligible = p.waiver === "Yes" ? row.waiver_to === "Expiry" || Number(row.waiver_to) >= p.toAge :
        Boolean(row.no_riders_illustration_sha256);
      if (!eligible) continue;
      const key = life + "|" + row.provider, group = groups.get(key) || [];
      group.push({life, provider: row.provider, price: Number(row.monthly_premium), product: row.product,
        date: row.source_date, ref: row.sha256});
      groups.set(key, group);
    }
  }
  const choices = [];
  for (const group of groups.values()) {
    const latest = group.reduce((day, row) => day > row.date ? day : row.date, "");
    const days = (Date.now() - Date.parse(latest)) / 86400000;
    if (!(days >= 0 && days <= 180)) continue;
    const recent = group.filter(row => row.date === latest), choice = recent[0];
    if (!(choice.price > 0) || !recent.every(row => row.price === choice.price && row.product === choice.product)) continue;
    const total = Math.round(choice.price * 100) + extra;
    if (total < budget) choices.push({...choice, total: total / 100});
  }
  choices.sort((a,b) => b.life - a.life || a.total - b.total || b.date.localeCompare(a.date) || a.provider.localeCompare(b.provider));
  return choices[0] || null;
}

function separatePolicyOptions(p, rows = reportedRows.concat(verifiedArchiveRows)) {
  if (!p.life || !p.ci || p.waiver === "Yes") return [];
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const offers = rows.filter(row => Number(row.age) === p.age && row.smoker === smoker &&
    Number(row.to_age) === p.toAge && (Number(row.life_cover) === p.life || Number(row.critical_illness_cover) === p.ci));
  function latestStandalone(items) {
    if (!items.length) return null;
    const day = items.reduce((latest, row) => row.source_date > latest ? row.source_date : latest, "");
    const days = (Date.now() - Date.parse(day)) / 86400000;
    if (!(days >= 0 && days <= 180)) return null;
    const sameDay = items.filter(row => row.source_date === day);
    const reference = sameDay[0];
    if (sameDay.some(row => row.available !== "true" || row.occupation_rated !== "No" ||
        row.quoted_term !== "To Age " + p.toAge || (row.quoted_tpd || "None") !== "None" ||
        row.life_cover !== row.quoted_life_cover || row.critical_illness_cover !== row.quoted_critical_illness_cover ||
        !Number.isFinite(Number(row.monthly_premium)) || Number(row.monthly_premium) <= 0 ||
        row.monthly_premium !== reference.monthly_premium || row.product !== reference.product)) return null;
    return reference;
  }
  const options = [];
  for (const provider of ["Zurich", "Legal & General", "Aviva"]) {
    const prices = offers.filter(row => row.provider === provider);
    const life = latestStandalone(prices.filter(row => row.critical_illness_cover === "0"));
    const ci = latestStandalone(prices.filter(row => row.life_cover === "0"));
    if (!life || !ci || life.source_date !== ci.source_date || life.model_id === ci.model_id) continue;
    if (prices.some(row => Number(row.life_cover) === p.life && Number(row.critical_illness_cover) === p.ci &&
        row.source_date >= life.source_date)) continue;
    const sum = (Math.round(Number(life.monthly_premium) * 100) + Math.round(Number(ci.monthly_premium) * 100)) / 100;
    options.push({provider, life, ci, sum});
  }
  return options.sort((a, b) => a.sum - b.sum);
}

function capturedReportFor(p, source = reportedRows) {
  const matching = source.filter(row =>
    Number(row.age) === p.age && Number(row.to_age) === p.toAge &&
    Number(row.life_cover) === p.life && Number(row.critical_illness_cover) === p.ci &&
    row.smoker === (p.smoker === "smoker" ? "Yes" : "No"));
  if (!matching.length) return null;
  const latest = matching.reduce((a, b) => a.source_date > b.source_date ||
    (a.source_date === b.source_date && Number(a.model_id) > Number(b.model_id)) ? a : b);
  const rows = matching.filter(row => row.model_id === latest.model_id);
  if (source === verifiedArchiveRows) {
    const signature = row => [row.available, row.monthly_premium, row.quoted_term, row.quoted_life_cover,
      row.quoted_critical_illness_cover, row.occupation_rated, row.quoted_tpd || "None"].join("|");
    if (matching.some(row => row.source_date === latest.source_date &&
        !rows.some(latestRow => latestRow.provider === row.provider && signature(latestRow) === signature(row)))) return null;
  }
  if (rows.length !== 3 || new Set(rows.map(row => row.provider)).size !== 3) return null;
  const quotes = rows.filter(row => row.available === "true" && Number(row.monthly_premium) > 0)
    .map(row => ({ provider: row.provider, product: row.product, premium: Number(row.monthly_premium),
      sourceDate: row.source_date, modelId: row.model_id, term: row.quoted_term,
      differentCapital: Number(row.quoted_life_cover) !== p.life || Number(row.quoted_critical_illness_cover) !== p.ci,
      quotedLife: Number(row.quoted_life_cover), quotedCi: Number(row.quoted_critical_illness_cover),
      tpd: row.quoted_tpd || "None", occupationRated: row.occupation_rated === "Yes", ...occupationalBasis(p.occupation, row) })).sort((a, b) => a.premium - b.premium);
  const missing = rows.filter(row => row.available === "false" ||
    (row.available === "unknown" && row.unavailable_reason === "product_not_listed"));
  if (quotes.length + missing.length !== 3) return null;
  const reasons = missing.map(row => {
    const limit = /^maximum_end_age_(\d+)$/.exec(row.unavailable_reason);
    const reason = limit ? `idade final máxima de ${limit[1]} anos` :
      row.available === "unknown" ? "produto ausente do comparativo. Disponibilidade a confirmar" :
      row.unavailable_reason === "end_age_not_supported" ? "idade final fora do limite do produto" : "produto sem preço no relatório";
    return `${row.provider} · ${reason}`;
  });
  const exactTerms = quotes.filter(q => !q.differentCapital && (!q.occupationRated || q.occupationMatched) && q.tpd === "None" && q.term === `To Age ${p.toAge}`);
  return { quotes, exact: true, reported: true, sourceDate: latest.source_date, modelId: latest.model_id,
    sameEndAge: exactTerms.length ? exactTerms : undefined, termPending: !exactTerms.length,
    partial: Boolean(missing.length), gap: missing.length ? {
      provider: missing.map(row => row.provider).join(", "), reason: reasons.join(". "), modelId: latest.model_id,
    } : null };
}
// The early index stores the requested CI amount but does not identify how it pays.
function historicalCiPrices(p) {
  if (!p.life || !p.ci || p.waiver === "Yes") return "";
  const smoking = p.smoker === "smoker" ? "Yes" : "No";
  const matches = priorityRows.filter(row => row.available === "true" && row.smoker === smoking &&
    Number(row.age) === p.age && Number(row.to_age) === p.toAge &&
    Number(row.life_cover) === p.life && Number(row.critical_illness_cover) === p.ci);
  if (!matches.length) return "";
  const newest = matches.reduce((a, b) => b.source_date > a.source_date ||
    (b.source_date === a.source_date && Number(b.model_id) > Number(a.model_id)) ? b : a);
  const prices = matches.filter(row => row.model_id === newest.model_id);
  if (prices.length !== 3 || new Set(prices.map(row => row.provider)).size !== 3) return "";
  const reports = new Map();
  for (const row of acceleratedOffers) {
    if (row.source_date !== newest.source_date || row.smoker !== smoking || Number(row.age) !== p.age ||
        Number(row.to_age) !== p.toAge || Number(row.life_cover) !== p.life || Number(row.earlier_ci_cover) !== p.ci) continue;
    if (!reports.has(row.reference)) reports.set(row.reference, []);
    reports.get(row.reference).push(row);
  }
  const matchingRefs = [...reports].filter(([, rows]) => prices.every(price =>
    rows.some(row => row.provider === price.provider && row.monthly_premium === price.monthly_premium))).map(([ref]) => ref);
  const amounts = prices.map(row => row.provider + " " + gbp(Number(row.monthly_premium))).join(" · ");
  const basis = matchingRefs.length ? "Os mesmos três preços aparecem no comparativo " + matchingRefs.sort()[0] +
    " para pagamento por morte ou diagnóstico, no primeiro evento coberto." :
    "A forma de pagamento do diagnóstico e os adicionais precisam de confirmação nesse registro.";
  return "Histórico de " + newest.source_date + " (ref. " + newest.model_id + "). " +
    amounts + " por mês antes da MetLife. " + basis;
}
function historicalPartialCiNote(p) {
  if (!p.ci || !p.life || p.waiver === "Yes") return "";
  const smoking = p.smoker === "smoker" ? "Yes" : "No";
  const alternatives = priorityGapRows.filter(row => row.smoker === smoking && Number(row.age) === p.age &&
    Number(row.to_age) === p.toAge && Number(row.life_only_capital) === p.life &&
    Number(row.critical_illness_cover) === p.ci && ["accelerated", "unconfirmed"].includes(row.ci_basis));
  return alternatives.map(row => {
    const basis = row.ci_basis === "accelerated"
      ? gbp(p.life) + " de vida mais " + gbp(p.ci) + " por morte ou diagnóstico, no primeiro evento"
      : gbp(p.life) + " de vida e " + gbp(p.ci) + " de diagnóstico, com forma de pagamento a confirmar";
    const tpd = row.tpd_basis === "own_occupation" ? " com incapacidade permanente para a própria profissão"
      : row.tpd_basis === "included" ? " com incapacidade permanente" : "";
    return "Comparativo parcial de " + row.source_date + " (ref. " + row.model_id + ") para " + basis + tpd +
      ". Zurich " + gbp(Number(row.zurich_premium)) + " e Aviva " + gbp(Number(row.aviva_premium)) + "/mês.";
  }).join(" ");
}
function priorityQuotesFor(p) {
  const report = capturedReportFor(p);
  if (report) return report;
  let expectedSmoker = p.smoker === "smoker" ? "Yes" : "No";
  const newExact = observedRows.filter(row =>
    row.smoker === expectedSmoker && Number(row.age) === p.age && Number(row.to_age) === p.toAge &&
    Number(row.life_cover) === p.life && Number(row.critical_illness_cover) === p.ci
  );
  const includesDisability = new Set(verifiedArchiveRows.filter(row => row.quoted_tpd === "Own occupation")
    .map(row => row.model_id + "|" + row.provider));
  // Only captures with verified benefit terms can price independent CI.
  // Those are handled by capturedReportFor, validatedCapitalQuotes and the paired policy components.
  let rawCandidates = (p.ci ? [] : priorityRows.concat(newExact))
    .filter(
      (row) =>
        row.available === "true" &&
        !includesDisability.has(row.model_id + "|" + row.provider) &&
        row.smoker === expectedSmoker &&
        Number(row.critical_illness_cover) === p.ci,
    )
    .map((row) => ({
      provider: row.provider,
      product: row.product,
      premium: Number(row.monthly_premium),
      modelId: row.model_id,
      sourceDate: row.source_date,
      age: Number(row.age),
      life: Number(row.life_cover),
      toAge: Number(row.to_age),
    }))
    .filter((row) => Number.isFinite(row.premium) && row.premium > 0);
  let latestByAnchor = new Map();
  for (const row of rawCandidates) {
    let key = [row.provider, row.age, row.toAge, row.life].join("|"),
      previous = latestByAnchor.get(key);
    if (
      !previous ||
      row.sourceDate > previous.sourceDate ||
      (row.sourceDate === previous.sourceDate &&
        Number(row.modelId) > Number(previous.modelId))
    )
      latestByAnchor.set(key, row);
  }
  let candidates = [...latestByAnchor.values()];
  let exact = candidates
    .filter(
      (row) =>
        row.age === p.age && row.life === p.life && row.toAge === p.toAge,
    )
    .sort((a, b) => a.premium - b.premium);
  // Older partial CI captures do not establish a standard independent benefit without riders.
  const knownGap = priorityGapRows
    .filter(
      (row) =>
        !p.ci &&
        row.smoker === expectedSmoker &&
        Number(row.age) === p.age &&
        Number(row.to_age) === p.toAge &&
        Number(row.life_cover) === p.life &&
        Number(row.critical_illness_cover) === p.ci,
    )
    .sort(
      (left, right) =>
        right.source_date.localeCompare(left.source_date) ||
        Number(right.model_id) - Number(left.model_id),
    )[0];
  const completeDate = exact.reduce(
    (latest, row) => (row.sourceDate > latest ? row.sourceDate : latest),
    "",
  );
  const archived = capturedReportFor(p, verifiedArchiveRows);
  if (archived && (!knownGap || archived.sourceDate > knownGap.source_date ||
      (archived.sourceDate === knownGap.source_date && archived.modelId === knownGap.model_id)) &&
      exact.every(row => archived.sourceDate > row.sourceDate ||
        (archived.sourceDate === row.sourceDate && archived.modelId === row.modelId))) return archived;
  if (knownGap && (!completeDate || knownGap.source_date >= completeDate)) {
    let exactAvailableQuotes = [
      {
        provider: "Zurich",
        product:
          Number(knownGap.critical_illness_cover) > 0
            ? "Zurich Life & CI"
            : "Zurich Life",
        premium: Number(knownGap.zurich_premium),
        modelId: knownGap.model_id,
        sourceDate: knownGap.source_date,
      },
      {
        provider: "Aviva",
        product:
          Number(knownGap.critical_illness_cover) > 0
            ? "Aviva Life Insurance+ with Core CI"
            : "Aviva Life Insurance+",
        premium: Number(knownGap.aviva_premium),
        modelId: knownGap.model_id,
        sourceDate: knownGap.source_date,
      },
    ]
      .filter((quote) => Number.isFinite(quote.premium) && quote.premium > 0)
      .sort((a, b) => a.premium - b.premium);
    return {
      quotes: exactAvailableQuotes,
      exact: exactAvailableQuotes.length > 0,
      partial: exactAvailableQuotes.length > 0,
      gap: {
        provider: knownGap.missing_provider,
        reason: knownGap.reason,
        modelId: knownGap.model_id,
      },
    };
  }
  if (new Set(exact.map((row) => row.provider)).size === 3)
    return { quotes: exact, exact: true };
  if (archived) return archived;
  const capitalMatch = validatedCapitalQuotes(p);
  if (capitalMatch) return capitalMatch;
  if (p.life && p.ci && p.waiver !== "Yes" && !exact.length) {
    const key = [p.age, expectedSmoker, p.toAge, p.life, p.ci].join("|");
    const eligible = (independentPlanQuotes.get(key) || []).filter(q => {
      const days = (Date.now() - Date.parse(q.sourceDate)) / 86400000;
      return days >= 0 && days <= 180;
    });
    if (eligible.length) {
      const latest = eligible.reduce((d, q) => d > q.sourceDate ? d : q.sourceDate, "");
      const quotes = eligible.filter(q => q.sourceDate === latest).sort((a, b) => a.premium - b.premium);
      return {quotes, sameEndAge: quotes, composition: true, sourceDate: latest, exact: false};
    }
  }
  let providers = ["Legal & General", "Zurich", "Aviva"],
    interpolated = providers.map((provider) => {
      let rows = candidates.filter((row) => row.provider === provider),
        termValues = [...new Set(rows.map((row) => row.toAge))]
          .sort((a, b) => a - b)
          .map((toAge) => {
            let atTerm = rows.filter((row) => row.toAge === toAge),
              ageValues = [...new Set(atTerm.map((row) => row.age))]
                .sort((a, b) => a - b)
                .map((age) => {
                  let atAge = atTerm
                      .filter((row) => row.age === age)
                      .sort((a, b) => a.life - b.life),
                    exactLife = atAge.find((row) => row.life === p.life);
                  if (exactLife) return exactLife;
                  let belowLife = atAge
                      .filter((row) => row.life < p.life)
                      .at(-1),
                    aboveLife = atAge.find((row) => row.life > p.life);
                  if (!belowLife || !aboveLife) return null;
                  let ratio =
                    (p.life - belowLife.life) /
                    (aboveLife.life - belowLife.life);
                  return {
                    provider,
                    product:
                      belowLife.product === aboveLife.product
                        ? belowLife.product
                        : aboveLife.product,
                    premium:
                      belowLife.premium +
                      (aboveLife.premium - belowLife.premium) * ratio,
                    modelId: `${belowLife.modelId}-${aboveLife.modelId}`,
                    age,
                    life: p.life,
                    toAge,
                  };
                })
                .filter(Boolean),
              exactAge = ageValues.find((row) => row.age === p.age);
            if (exactAge) return exactAge;
            let belowAge = ageValues.filter((row) => row.age < p.age).at(-1),
              aboveAge = ageValues.find((row) => row.age > p.age);
            if (!belowAge || !aboveAge || aboveAge.age - belowAge.age > 10)
              return null;
            let ratio = (p.age - belowAge.age) / (aboveAge.age - belowAge.age);
            return {
              provider,
              product:
                belowAge.product === aboveAge.product
                  ? belowAge.product
                  : aboveAge.product,
              premium: interpolateRiskPremium(
                belowAge.premium,
                aboveAge.premium,
                ratio,
              ),
              modelId: `${belowAge.modelId}-${aboveAge.modelId}`,
              age: p.age,
              life: p.life,
              toAge,
            };
          })
          .filter(Boolean),
        exactTerm = termValues.find((row) => row.toAge === p.toAge);
      if (exactTerm) return exactTerm;
      let belowTerm = termValues.filter((row) => row.toAge < p.toAge).at(-1),
        aboveTerm = termValues.find((row) => row.toAge > p.toAge);
      if (!belowTerm || !aboveTerm || aboveTerm.toAge - belowTerm.toAge > 10)
        return null;
      let ratio =
        (p.toAge - belowTerm.toAge) / (aboveTerm.toAge - belowTerm.toAge);
      return {
        provider,
        product:
          belowTerm.product === aboveTerm.product
            ? belowTerm.product
            : aboveTerm.product,
        premium: interpolateRiskPremium(
          belowTerm.premium,
          aboveTerm.premium,
          ratio,
        ),
        modelId: `${belowTerm.modelId}-${aboveTerm.modelId}`,
        age: p.age,
        life: p.life,
        toAge: p.toAge,
      };
    });
  return interpolated.every(Boolean)
    ? {
        quotes: interpolated.sort((a, b) => a.premium - b.premium),
        exact: false,
      }
    : { quotes: [], exact: false };
}
function toAge() {
  return Number(document.querySelector('input[name="toAge"]:checked').value);
}
function smoker() {
  return document.querySelector('input[name="smoker"]:checked').value;
}
function updateProfile() {
  let w = num("weight"),
    h = num("height"),
    age = num("age"),
    end = toAge();
  $("bmi").textContent = w && h ? (w / (h / 100) ** 2).toFixed(1) : "—";
  $("termReadout").textContent = age
    ? end > age
      ? `${end - age} anos de cobertura`
      : "Idade final inválida"
    : "Informe a idade atual";
}
function ml() {
  let c = num("metlifeCotas"),
    lux = $("metlifeLux").checked ? 2 * c : 0,
    child = $("metlifeChild").checked ? 2 * c : 0;
  return { c, base: 11 * c, lux, child, total: 11 * c + lux + child };
}
function metlifeForAge(m, age) {
  return age >= 66 && m.c
    ? { c: 0, base: 0, lux: 0, child: 0, total: 0, unavailable: true }
    : m;
}
function updateMetlife() {
  let m = metlifeForAge(ml(), num("age"));
  $("metlifePreview").textContent = gbp(m.total);
  $("metlifeBreakdown").textContent = m.unavailable
    ? "Indisponível para nova contratação após 65 anos"
    : m.c
      ? `${gbp(m.base)} Essencial${m.lux ? " + " + gbp(m.lux) + " Luxações" : ""}${m.child ? " + " + gbp(m.child) + " Crianças" : ""}`
      : "Não incluído";
}
function waiverComparisonFor(p) {
  if (!waiverRows && !individualWaivers.length)
    return { note: "Os comparativos com isenção não carregaram." };
  const matching = (waiverRows || []).concat(individualWaivers).filter(row =>
    p.ci === 0 && Number(row.age) === p.age && Number(row.to_age) === p.toAge &&
    Number(row.life_cover) === p.life && row.smoker === (p.smoker === "smoker" ? "True" : "False")
  );
  if (!matching.length) return { note: "Ainda não há comparativo com isenção para este cenário." };
  const newest = matching.reduce((date, row) => row.source_date > date ? row.source_date : date, "");
  const reports = new Map();
  for (const row of matching.filter(row => row.source_date === newest)) {
    if (!reports.has(row.sha256)) reports.set(row.sha256, []);
    reports.get(row.sha256).push({
      provider: row.provider, product: row.product, premium: Number(row.monthly_premium),
      sourceDate: newest, term: row.quoted_term, waiverTo: row.waiver_to, modelId: row.sha256,
    });
  }
  let fingerprint, quotes;
  for (const report of reports.values()) {
    report.sort((a, b) => a.provider.localeCompare(b.provider));
    if (!report.length || report.length > 3 || new Set(report.map(q => q.provider)).size !== report.length ||
        report.some(q => !Number.isFinite(q.premium) || q.premium <= 0))
      return { note: "O comparativo com isenção está incompleto." };
    const prices = JSON.stringify(report.map(q => [q.provider, q.product, q.premium, q.term, q.waiverTo]));
    if (fingerprint && prices !== fingerprint)
      return { note: "Os comparativos com isenção mais recentes divergem para este cenário." };
    fingerprint = prices;
    quotes = report;
  }
  quotes.sort((a, b) => a.premium - b.premium);
  const sameEndAge = quotes.filter(q => q.term === `To Age ${p.toAge}`);
  if (!sameEndAge.length) return { note: "O relatório informa prazos em anos. A idade de término precisa de confirmação." };
  return { quotes, sameEndAge, exact: true };
}
function quotedTerm(quote, profile) {
  let term = quote.term.startsWith("To Age ")
    ? `até ${quote.term.slice(7)} anos`
    : `${parseInt(quote.term, 10)} anos de prazo`;
  if (quote.occupationRated) {
    if (!quote.occupationLabel) term += " · depende da profissão de referência";
    else if (quote.occupationMatched) term += " · profissão e vínculo conferidos: " + quote.occupationLabel;
    else if (quote.occupationNeedsStatus) term += " · para comparar este preço, informe a profissão com o vínculo: " + quote.occupationLabel;
    else term += " · preço do perfil profissional de referência: " + quote.occupationLabel;
  }
  if (quote.baseCi != null) {
    term += " · vida " + gbp(quote.baseLife) + " + diagnóstico independente " + gbp(quote.baseCi);
    if (quote.offset) term += " − diferença de " + gbp(quote.offset) + " observada nos pacotes";
    term += " · referências " + quote.lifeId + " e " + quote.ciId + " · conferências no mesmo perfil: " + quote.tested;
  }
  if (quote.tpd === "Own occupation") term += " · inclui incapacidade permanente para a própria profissão (TPD)";
  if (quote.waiverTo) {
    const waiver = quote.waiverTo === "Expiry" ? "isenção até o fim do contrato" :
      "isenção durante a vigência, com idade-limite informada de " + quote.waiverTo + " anos";
    term += " · " + waiver;
  }
  if (quote.differentCapital) term += " · capital oferecido: vida " + gbp(quote.quotedLife) + " e doenças graves " + gbp(quote.quotedCi);
  const years = /^(\d+) years?$/.exec(quote.term);
  if (profile && years && Number(years[1]) < profile.toAge - profile.age)
    term += " · pedido até os " + profile.toAge + " anos (" + (profile.toAge - profile.age) + " anos pela idade informada)";
  return term;
}
function payload() {
  let age = num("age"),
    end = toAge();
  return {
    age,
    smoker: smoker(),
    weight: num("weight"),
    height: num("height"),
    occupation: $("occupation").value.trim(),
    monthlyBudget: num("monthlyBudget"),
    term: end - age,
    toAge: end,
    life: num("life"),
    ci: num("ci"),
    earlierCi: 0,
    ciType: "standard_core_ci",
    premiumType: "guaranteed",
    indexation: "Level",
    tpd: "None",
    waiver: $("waiver").checked ? "Yes" : "unspecified",
    fracture: "No",
    metlifeCotas: num("metlifeCotas"),
    metlifeLux: $("metlifeLux").checked,
    metlifeChild: $("metlifeChild").checked,
  };
}
function ridgePredict(model, p) {
  let f = [
    1,
    p.age,
    (p.age * p.age) / 100,
    p.term,
    Math.log1p(p.life),
    Math.log1p(p.ci),
    0,
    p.smoker === "smoker" ? 1 : 0,
    0,
    0,
  ];
  return Math.max(
    4.5,
    Math.expm1(f.reduce((s, x, i) => s + x * (model.coefficients[i] || 0), 0)),
  );
}
function predictBudget(model, p, documentedPrice) {
  if (documentedPrice != null) return documentedPrice;
  return globalThis.generalBudgetEstimate(model, p, profile => ridgePredict(model, profile));
}
function makeSummary(p, r) {
  let m = r.metlife || metlifeForAge(ml(), p.age),
    lines = [
      "Estimativa de proteção",
      "",
      `Idade: ${p.age} anos`,
      p.smoker === "smoker" ? "Fumante" : "Não fumante",
      `Profissão: ${p.occupation}`,
      `Idade final solicitada: ${p.toAge} anos`,
      `Seguro de Vida: ${gbp(p.life)}`,
      `Diagnóstico de Doenças Graves: ${gbp(p.ci)}`,
    ];
  if (p.waiver === "Yes")
    lines.push(r.waiverPending ? "Isenção de mensalidade solicitada · preço a confirmar" :
      r.waiverLimitNote || `Isenção de mensalidade incluída · comparativo de ${r.providerQuotes[0].sourceDate}`);
  lines.push(
    r.ciPending ? `Estimativa só de vida: ${gbp(r.main)}/mês` : r.supported
      ? `${r.waiverPending || r.termPending || (r.reportNote && !r.providerQuotes?.length) ? "Referência geral para a proteção principal" : "Estimativa"}: ${gbp(r.main)}/mês`
      : "Estimativa principal: requer cotação oficial",
  );
  if (r.supported && !r.ciPending && !r.illustratedBase && !r.ageEstimate)
    lines.push(premiumRangeText(r));
  if (r.provider)
    lines.push(`Referência prioritária: ${r.provider} — ${gbp(r.main)}/mês`);
  if (r.providerQuotes?.length && !r.detailed)
    lines.push(
      `Seguradoras prioritárias: ${r.providerQuotes.map((quote) => `${quote.provider} ${gbp(quote.premium)}`).join(" · ")}${r.providerGap ? ` · ${r.providerGap.provider} sem preço no relatório` : ""}`,
    );
  if (m.unavailable)
    lines.push(
      "",
      "MetLife MultiProtect: indisponível para nova contratação após 65 anos",
    );
  else if (m.c)
    lines.push(
      "",
      `MetLife MultiProtect: ${m.c} Cota${m.c > 1 ? "s" : ""}${m.lux ? " + Luxações" : ""}${m.child ? " + Crianças" : ""}`,
      `${gbp(m.total)}/mês (${gbp(m.base)} Essencial${m.lux ? " + " + gbp(m.lux) + " Luxações" : ""}${m.child ? " + " + gbp(m.child) + " Crianças" : ""})`,
    );
  if (r.detailed)
    for (const q of r.providerQuotes)
      lines.push(`${q.provider} · ${quotedTerm(q, p)} · ${gbp(q.premium)}/mês${m.c ? ` · com MetLife ${gbp(q.premium + m.total)}/mês` : ""}`);
  if (r.budgetNote && !r.ciPending) lines.push(r.budgetNote);
  if (r.budgetMarginNote) lines.push(r.budgetMarginNote);
  if (r.reportNote) lines.push(r.reportNote);
  if (r.illustrationNote) lines.push(r.illustrationNote);
  if (r.ageNote) lines.push(r.ageNote);
  if (r.componentNote) lines.push(r.componentNote);
  if (r.lgTermNote) lines.push(r.lgTermNote);
  if (r.supplementalLifeNote) lines.push(r.supplementalLifeNote);
  if (r.partialCiNote) lines.push(r.partialCiNote);
  if (r.alternativePackage) lines.push(r.alternativePackage);
  if (r.separatePolicyNote) lines.push(r.separatePolicyNote);
  if (r.affordableNote) lines.push(r.affordableNote);
  if (r.complete)
    lines.push("", r.aggregateOnly ? `Orçamento mensal indicativo de ${gbp(monthlyTotal(r.main, m.total))}. Seguradora a confirmar.` :
      `Total estimado: ${gbp(monthlyTotal(r.main, m.total))}/mês`);
  else lines.push("", "Total do pacote a confirmar.");
  lines.push(
    "",
    "Estimativa baseada em illustrations históricos. Valor final sujeito à cotação oficial e underwriting.",
  );
  return lines.join("\n");
}
function priceProtection(p, m) {
  let key =
      p.life && p.ci
        ? "life_plus_standalone_ci:standard_core_ci"
        : p.life
          ? "life_only"
          : "critical_illness_only",
    model = catalog.models[key] || null,
    warnings = [],
    r = { supported: false, main: 0, low: 0, high: 0 };
  if (p.age === 65 && m.c)
    warnings.push(
      "MetLife aos 65 anos exige data de nascimento e verificação do aniversário.",
    );
  if (m.unavailable) {
    warnings.push("Nova contratação MetLife indisponível para esta idade.");
  }
  if (model) {
    let lookupKey = `${p.age}|${p.toAge}|${p.life}|${p.ci}|${p.smoker === "smoker" ? 1 : 0}`,
      directLookup = documentedLookupPrice(p, model.lookup?.[lookupKey]),
      outside =
        p.age < model.ageMin ||
        p.age > model.ageMax ||
        p.term < model.termMin ||
        p.term > model.termMax ||
        p.life < model.lifeMin ||
        p.life > model.lifeMax ||
        p.ci < model.ciMin ||
        p.ci > model.ciMax,
      estimate = predictBudget(model, p, directLookup ? model.lookup[lookupKey] : null);
    if (Number.isFinite(estimate)) {
      r.supported = true;
      r.documentedBudget = directLookup;
      r.main = estimate;
      let range = globalThis.quoteRange(model, r.main, {
        outside,
        directLookup,
      });
      r.low = range.low;
      r.high = range.high;
      if (outside)
        warnings.push(
          "Perfil fora da faixa principal da base: estimativa por extrapolação, com margem ampliada.",
        );
      if (model.confidence === "low" || !model.strictlyValidated)
        warnings.push(
          "Baixa confiança: use a faixa provável e confirme no SolutionBuilder.",
        );
    } else
      warnings.push(
        "Perfil ou capital fora da faixa validada do modelo histórico.",
      );
  } else
    warnings.push(
      p.ci && !p.life
        ? "Doenças graves sem seguro de vida ainda não têm modelo próprio calibrado. Faça a cotação oficial no SolutionBuilder."
        : "Esta combinação ainda não passou nos controles de validação. Faça a cotação oficial no SolutionBuilder.",
    );
  const waiverMatch = p.waiver === "Yes" ? waiverComparisonFor(p) : null;
  r.withWaiver = Boolean(waiverMatch?.quotes);
  r.waiverPending = Boolean(waiverMatch && !r.withWaiver);
  let priorityMatch = r.withWaiver ? waiverMatch : priorityQuotesFor(p),
    priorityQuotes = priorityMatch.quotes;
  if (r.withWaiver && priorityQuotes.length < 3) {
    const missing = ["Zurich", "Legal & General", "Aviva"].filter(provider =>
      !priorityQuotes.some(quote => quote.provider === provider));
    warnings.unshift("Nesse comparativo há preço com isenção confirmado para " +
      priorityQuotes.map(quote => quote.provider).join(" e ") + ". A confirmar para " + missing.join(" e ") + ".");
  }
  r.termPending = Boolean(priorityMatch.termPending);
  r.capitalRange = Boolean(priorityMatch.capitalRange);
  r.composition = Boolean(priorityMatch.composition);
  r.detailed = r.withWaiver || r.capitalRange || r.composition || Boolean(priorityMatch.reported && priorityQuotes.length);
  if (r.composition) {
    r.reportNote = "Estimativa por composição a partir das cotações de vida e diagnóstico independente de " +
      priorityMatch.sourceDate + ". A diferença entre a soma dos dois prêmios e o preço do pacote foi conferida em outros capitais deste perfil.";
    const missing = ["Zurich", "Legal & General", "Aviva"].filter(provider => !priorityQuotes.some(q => q.provider === provider));
    if (missing.length) r.reportNote += " Preço a confirmar para " + missing.join(" e ") + ".";
  }
  if (r.capitalRange) {
    const { lower, upper, check, axis } = priorityMatch.capitalRange;
    r.reportNote = `Estimativa entre capitais de ${axis === "life_cover" ? "vida" : "doenças graves"} de ${gbp(Number(lower[axis]))} e ${gbp(Number(upper[axis]))}. O cálculo foi conferido com uma cotação independente de ${gbp(Number(check[axis]))} para este perfil e prazo em ${check.source_date}.`;
    const maximumError = Math.max(...priorityQuotes.map(quote => quote.testErrorGBP));
    r.reportNote += " Nesse capital de teste, a maior diferença entre a previsão e o preço do relatório foi de " + gbp(maximumError) + "/mês.";
    const missing = ["Zurich", "Legal & General", "Aviva"].filter(provider =>
      !priorityQuotes.some(quote => quote.provider === provider));
    if (missing.length) r.reportNote += " Sem estimativa validada nesse intervalo para " + missing.join(" e ") + ".";
    warnings.unshift(r.reportNote);
  }
  if (priorityMatch.reported) {
    r.reportNote = `Comparativo indicativo de ${priorityMatch.sourceDate}`;
    if (priorityMatch.gap) r.reportNote += `. ${priorityMatch.gap.reason}`;
    if (priorityMatch.termPending && priorityQuotes.length)
      r.reportNote += ". As alternativas exigem conferência do capital, do prazo ou da profissão antes de fechar o total.";
    if (!priorityQuotes.length)
      r.reportNote += ". As três seguradoras ficaram sem preço." + (r.supported ? " O valor de referência vem do modelo geral." : "");
    warnings.unshift(r.reportNote);
  }
  if (priorityMatch.gap && !priorityMatch.reported)
    warnings.unshift(
      r.composition ? r.reportNote : priorityMatch.partial
        ? `Cotação oficial ${priorityMatch.gap.modelId}: ${priorityMatch.gap.provider} não retornou preço (${priorityMatch.gap.reason}). Os preços oficiais disponíveis foram preservados sem inventar o valor ausente.`
        : `Cotação oficial ${priorityMatch.gap.modelId}: ${priorityMatch.gap.provider} não retornou preço (${priorityMatch.gap.reason}). A estimativa geral permanece disponível, sem inventar preço específico dessa seguradora.`,
    );
  if (priorityQuotes.length === 3 || ((r.capitalRange || r.withWaiver || r.composition || priorityMatch.partial) && priorityQuotes.length)) {
    const comparable = priorityMatch.sameEndAge || priorityQuotes;
    let selected = comparable[0];
    const segmentKey = p.ci > 0
      ? p.smoker === "smoker"
        ? "smokerCI"
        : "nonSmokerCI"
      : p.smoker === "smoker"
        ? "smokerLife"
        : "nonSmokerLife";
    const segmentValidation =
      catalog.audit?.priorityProviderCrossValidation?.bySegment?.[segmentKey] || {};
    r.supported = true;
    r.main = selected.premium;
    r.low = selected.premium;
    r.high = comparable.at(-1).premium;
    r.provider = selected.provider;
    r.product = selected.product;
    if (r.withWaiver && /^\d+$/.test(selected.waiverTo) && Number(selected.waiverTo) < p.toAge) {
      r.waiverLimitNote = selected.provider + " · a isenção de mensalidade termina aos " + selected.waiverTo +
        " anos. O seguro de vida segue até os " + p.toAge + " anos.";
      warnings.unshift(r.waiverLimitNote);
    }
    r.providerQuotes = priorityQuotes;
    r.providerGap = priorityMatch.gap || null;
    r.priorityExact = priorityMatch.exact;
    warnings = warnings.filter(
      (warning) =>
        !warning.startsWith("Doenças graves sem seguro de vida") &&
        !warning.startsWith("Esta combinação ainda não passou") &&
        !warning.startsWith("Baixa confiança:") &&
        !warning.startsWith("Perfil fora da faixa principal da base:") &&
        !warning.startsWith("Perfil ou capital fora da faixa validada"),
    );
    if (
      !priorityMatch.exact &&
      !priorityMatch.partial && !r.capitalRange && !r.composition &&
      (segmentValidation.tested || 0) < 30
    )
      warnings.push(
        `A validação deste segmento ainda usa amostra limitada (n=${segmentValidation.tested || 0}).`,
      );
    warnings.unshift(
      priorityMatch.partial
        ? `O comparativo traz preços para ${priorityQuotes.map((quote) => quote.provider).join(" e ")}. ${priorityMatch.gap.provider} ficou sem preço no relatório.`
        : r.withWaiver
        ? "Comparativo histórico com isenção incluída, sem análise médica individual. Confira o prazo de cada seguradora."
        : priorityMatch.exact
        ? `Preço histórico do SolutionBuilder para esta idade, tabagismo, capital e idade final solicitada. A composição dos adicionais pode variar por produto.`
        : `Estimativa interpolada entre âncoras oficiais do SolutionBuilder: ${selected.provider} entre as seguradoras prioritárias.`,
    );
  }
  const illustrated = !priorityMatch.reported && !priorityMatch.exact && !priorityMatch.gap
    ? illustratedLifeFor(p) : null;
  if (illustrated) {
    const base = Number(illustrated.base_monthly);
    const standalone = illustrated.policy_count === "1";
    r.illustrationNote = `${illustrated.provider} · illustration de ${illustrated.source_date} · vida a ${gbp(base)}/mês antes de adicionais e descontos.`;
    if (!standalone) r.illustrationNote += " O documento inclui outras apólices. Com adicionais de " +
      gbp(Number(illustrated.additional_monthly)) + " e desconto de " + gbp(Number(illustrated.discount_monthly)) +
      ", esta apólice custava " + gbp(Number(illustrated.policy_monthly)) + "/mês no pacote.";
    if (standalone && !priorityQuotes.length) {
      r.supported = true;
      r.illustratedBase = true;
      r.provider = illustrated.provider;
      r.main = r.low = r.high = base;
      warnings = warnings.filter(w => !w.startsWith("Baixa confiança:") &&
        !w.startsWith("Perfil fora da faixa principal da base:") &&
        !w.startsWith("Perfil ou capital fora da faixa validada"));
      warnings.unshift(r.illustrationNote);
    }
  }
  if (!illustrated && !priorityMatch.reported && !priorityMatch.exact && !priorityMatch.gap && !r.waiverPending) {
    const between = globalThis.illustratedAgeEstimate(illustratedLifeRows, p);
    if (between) {
      r.ageNote = "Zurich · estimativa de vida de " + gbp(between.price) + "/mês antes de adicionais, calculada entre " +
        between.lower.age + " anos (" + gbp(between.lower.price) + ") e " + between.upper.age +
        " anos (" + gbp(between.upper.price) + "). Em " + between.testedAges + (between.testedAges === 1 ? " idade intermediária" : " idades intermediárias") +
        " com illustration posterior, a maior diferença foi " + gbp(between.maxError) + "/mês. Última conferência em " + between.latestCheck + ".";
      if (m.c && !m.unavailable) r.ageNote += " Com a MetLife selecionada, a estimativa Zurich soma " + gbp(between.price + m.total) + "/mês.";
      const groupKey = [p.smoker === "smoker" ? "Yes" : "No", p.toAge, p.life].join("|");
      const past = (historicalAgeTests.get(groupKey) || []).filter(test => Date.parse(test.date) <= Date.now());
      if (past.length) {
        const maxError = Math.max(...past.map(test => test.error));
        r.ageNote += " Para esse capital e prazo, a regra pôde ser testada em " + past.length +
          (past.length === 1 ? " cotação posterior de idade ainda sem preço" : " cotações posteriores de idades ainda sem preço") +
          " na base recente. Maior erro de " + gbp(maxError) + "/mês.";
      }
      if (!priorityQuotes.length && past.length && past.every(test => test.passed)) {
        r.supported = true;
        r.ageEstimate = true;
        r.provider = "Zurich";
        r.main = between.price;
        r.low = r.high = null;
        warnings = warnings.filter(w => !w.startsWith("Baixa confiança:") && !w.startsWith("Perfil fora da faixa principal da base:") &&
          !w.startsWith("Perfil ou capital fora da faixa validada"));
      }
    }
  }
  r.lgTermNote = lgTermReference(p, m);
  r.supplementalLifeNote = supplementalLifeNote(p, m);
  r.partialCiNote = [historicalPartialCiNote(p), historicalCiPrices(p)].filter(Boolean).join(" ");
  const avivaRecord = illustratedLifeFor(p, "Aviva");
  if (avivaRecord) {
    r.componentNote = "Aviva · " + avivaRecord.source_date + " · prêmio-base de vida " +
      gbp(Number(avivaRecord.base_monthly)) + " + adicionais " + gbp(Number(avivaRecord.additional_monthly)) +
      " = " + gbp(Number(avivaRecord.policy_monthly)) + "/mês. Total conferido no comparativo " + avivaRecord.reference + ".";
  }
  r.aggregateOnly = r.supported && !r.providerQuotes?.length && !r.illustratedBase && !r.ageEstimate;
  if (r.aggregateOnly) {
    r.budgetNote = "Referência de orçamento calculada pelo modelo geral. O valor para Zurich, Legal & General ou Aviva precisa de confirmação.";
    warnings.unshift(r.budgetNote);
    const part = !avivaRecord && avivaLifeInPackage(p);
    if (part) r.componentNote = "Aviva · no pacote de " + part.source_date + " (ref. " + part.reference +
      "), a parcela de vida de " + gbp(p.life) + " custava " + gbp(Number(part.life_monthly)) +
      "/mês antes de adicionais. O pacote também incluía uma apólice de vida ou diagnóstico de " +
      gbp(Number(part.earlier_ci_cover)) + ". O preço para contratar apenas vida precisa de confirmação.";
  }
  if (p.life && p.ci && !r.providerQuotes?.length && !priorityMatch.reported && r.supported) {
    r.reportNote = "A base histórica inclui coberturas em que o diagnóstico antecipa o pagamento de vida. Confirme o preço do pagamento independente no SolutionBuilder.";
    warnings.push(r.reportNote);
  }
  if (r.waiverPending) warnings.unshift(waiverMatch.note + " O preço-base apresentado é a estimativa geral.");
  r.complete = r.supported && !r.waiverPending && !m.unavailable && !priorityMatch.termPending;
  return { r, warnings, model, priorityMatch, priorityQuotes };
}
function render(p) {
  renderFractureComparison(p);
  renderCiComparison(p);
  const tpdPrices = renderCiComparison(p, true) || [];
  $("coverError").textContent = "";
  if (p.toAge <= p.age)
    throw Error(`A cobertura até ${p.toAge} anos exige idade atual menor.`);
  if (!p.life && !p.ci) throw Error("Selecione ao menos uma cobertura.");
  if (![p.life, p.ci].every(amount => Number.isSafeInteger(amount) && amount >= 0))
    throw Error("Informe os capitais em libras inteiras.");
  const m = metlifeForAge(ml(), p.age);
  const {r, model, priorityMatch, priorityQuotes, warnings} = priceProtection(p, m);
  if (p.life && p.ci && r.aggregateOnly && !r.documentedBudget && !r.termPending && !r.waiverPending) {
    const life = priceProtection({...p, ci: 0}, m).r;
    if (life.supported && !life.termPending && !life.waiverPending &&
        displayedPence(r.main) <= displayedPence(life.main)) {
      r.ciPending = true;
      r.complete = false;
      r.main = life.main;
      r.low = r.high = null;
      r.lifeSource = life.provider || "modelo geral";
      r.alternativePackage = "Referência só de vida (" + r.lifeSource + "): " + gbp(life.main) + "/mês.";
      if (m.c) r.alternativePackage += " Com " + gbp(m.total) + " de MetLife, o subtotal é " +
        gbp(life.main + m.total) + "/mês antes do diagnóstico.";
      r.alternativePackage += " A mensalidade adicional para " + gbp(p.ci) + " de doenças graves independentes precisa de confirmação.";
    }
  }
  r.budgetMarginNote = showBudgetEvidence(p, m, r) || generalBudgetRangeNote(p, m, r);
  if (r.budgetMarginNote) warnings.unshift(r.budgetMarginNote);
  $("results").classList.remove("hidden");
  $("quoteCount").textContent = r.supported ? 1 : 0;
  $("unsupportedCount").textContent = r.complete ? 0 : 1;
  $("resultTitle").textContent = r.supported && !r.complete ? "Estimativa parcial" : r.aggregateOnly ? "Referência de orçamento" :
    r.supported ? "Estimativa calculada" : "Cotação oficial necessária";
  $("mainPrice").textContent = r.supported
    ? `${gbp(r.main)}/mês`
    : "Não publicado";
  $("range").textContent = r.ciPending ? "Somente vida · adicional de diagnóstico independente a confirmar" : r.ageEstimate ? "Estimativa Zurich por idade para vida individual, antes de adicionais" : r.illustratedBase ? "Prêmio-base de vida registrado na illustration " + r.provider : r.supported
    ? premiumRangeText(r)
    : "O motor não publica um preço sem validação suficiente.";
  $("totalPrice").textContent = r.complete
    ? `${gbp(monthlyTotal(r.main, m.total))}/mês`
    : "A confirmar";
  $("warning").textContent = r.ciPending
    ? "A estimativa de vida está disponível. O modelo ainda precisa de uma referência comparável para precificar o diagnóstico adicional."
    : warnings.join(" ");
  let bmi = (p.weight / (p.height / 100) ** 2).toFixed(1);
  const confidenceSegmentKey = p.ci > 0
    ? p.smoker === "smoker"
      ? "smokerCI"
      : "nonSmokerCI"
    : p.smoker === "smoker"
      ? "smokerLife"
      : "nonSmokerLife";
  const confidenceMetrics =
    catalog.audit?.priorityProviderCrossValidation?.bySegment?.[
      confidenceSegmentKey
    ] || {};
  const forwardMetrics = catalog.audit?.priorityProviderTemporalHoldout || {};
  const forwardSegmentMetrics =
    forwardMetrics.bySegment?.[confidenceSegmentKey] || {};
  const forwardEvidence = (forwardSegmentMetrics.predicted || 0) >= 30
    ? ` · validação futura do segmento histórico ${Number(forwardSegmentMetrics.mape * 100).toFixed(2)}% MAPE · P95 ${Number(forwardSegmentMetrics.p95 * 100).toFixed(2)}% · n=${forwardSegmentMetrics.predicted}`
    : ` · validação futura do segmento histórico ainda limitada (n=${forwardSegmentMetrics.predicted || 0})`;
  const measuredErrors = confidenceMetrics.tested > 0 && Number.isFinite(confidenceMetrics.mape) &&
    Number.isFinite(confidenceMetrics.p95)
    ? `${Number(confidenceMetrics.mape * 100).toFixed(2)}% MAPE · P95 ${Number(confidenceMetrics.p95 * 100).toFixed(2)}% · n=${confidenceMetrics.tested}`
    : "erro do segmento ainda sem medição";
  let confidenceLabel = r.providerQuotes?.length
    ? r.providerGap
      ? "oficial parcial"
      : r.priorityExact
        ? "preço observado para o pedido"
        : `interpolação indicativa · arquivo histórico ${(confidenceMetrics.tested || 0) < 30 ? "com amostra limitada" : "avaliado"} (${measuredErrors}${forwardEvidence})`
    : model
      ? `modelo histórico agregado (${confidencePt(model.confidence)})`
      : "insuficiente";
  let priorityDetail = r.providerQuotes?.length
    ? `<dt>Seguradoras prioritárias</dt><dd>${r.providerQuotes.map((quote) => `${escapeHtml(quote.provider)} ${gbp(quote.premium)}`).join(" · ")}${r.providerGap ? ` · ${escapeHtml(r.providerGap.provider)} sem preço no relatório` : ""}</dd><dt>Preço-base usado</dt><dd>${escapeHtml(r.provider)} · ${escapeHtml(r.product)}</dd><dt>Origem do preço</dt><dd>${r.priorityExact ? `SolutionBuilder ref. ${escapeHtml(r.providerQuotes[0].modelId)}${r.providerQuotes[0].sourceDate ? ` · ${escapeHtml(r.providerQuotes[0].sourceDate)}` : ""}` : "Interpolação de múltiplas âncoras oficiais do SolutionBuilder"}</dd>`
    : "";
  if (r.detailed) {
    const rows = r.providerQuotes.map(q => `<dt>${escapeHtml(q.provider)}</dt><dd>${gbp(q.premium)}/mês · ${escapeHtml(quotedTerm(q, p))}${m.c ? ` · com MetLife ${gbp(q.premium + m.total)}/mês` : ""}</dd>`).join("");
    priorityDetail = `<dt>${r.composition ? "Estimativa por composição" : r.capitalRange ? "Estimativa por capital" : r.withWaiver ? "Comparativo com isenção" : "Comparativo sem isenção"}</dt><dd>SolutionBuilder · ${escapeHtml(r.providerQuotes[0].sourceDate)}</dd>${rows}`;
    if (r.complete)
      priorityDetail += `<dt>Preço usado no total</dt><dd>${escapeHtml(r.provider)} · até ${p.toAge} anos</dd>`;
  }
  if (r.illustrationNote)
    priorityDetail += `<dt>Prêmio-base documentado</dt><dd>${escapeHtml(r.illustrationNote)}</dd>`;
  if (r.ageNote) priorityDetail += `<dt>Estimativa entre idades</dt><dd>${escapeHtml(r.ageNote)}</dd>`;
  if (r.supplementalLifeNote) priorityDetail += `<dt>Condições de vida no comparativo</dt><dd>${escapeHtml(r.supplementalLifeNote)}</dd>`;
  if (r.partialCiNote) priorityDetail += `<dt>Outras condições encontradas</dt><dd>${escapeHtml(r.partialCiNote)}</dd>`;
  if (r.lgTermNote) priorityDetail += `<dt>Prazo e preço documentados pela L&amp;G</dt><dd>${escapeHtml(r.lgTermNote)}</dd>`;
  if (r.componentNote) priorityDetail += `<dt>Composição da apólice histórica</dt><dd>${escapeHtml(r.componentNote)}</dd>`;
  const evidence = r.composition ? "Prêmios individuais e comparativos de pacotes para os mesmos produtos, perfil e data" : r.ciPending ? "Referência de vida: " + escapeHtml(r.lifeSource) : r.ageEstimate ? "2 idades de referência e conferência com illustration posterior na mesma faixa" : r.illustratedBase ? `1 illustration ${escapeHtml(r.provider)} · vida em apólice individual` : r.detailed
    ? r.capitalRange ? `2 capitais de referência · 1 capital de teste · ${r.providerQuotes.length} ${r.providerQuotes.length === 1 ? "seguradora" : "seguradoras"}` : `1 comparativo · ${r.providerQuotes.length} preços históricos`
    : `${model?.records || 0} registros na família · confiança ${escapeHtml(confidenceLabel)}`;
  $("details").innerHTML =
    `<dt>Perfil</dt><dd>${p.age} anos · ${p.smoker === "smoker" ? "fumante" : "não fumante"}</dd><dt>Profissão</dt><dd>${escapeHtml(p.occupation)}</dd><dt>Peso · altura · IMC</dt><dd>${p.weight}kg · ${p.height}cm · ${bmi}</dd><dt>Cobertura solicitada</dt><dd>até ${p.toAge} · ${p.term} anos</dd><dt>Vida</dt><dd>${gbp(p.life)}</dd><dt>Doenças Graves</dt><dd>${gbp(p.ci)}</dd><dt>Premium</dt><dd>Garantido</dd>${priorityDetail}<dt>Base de referência</dt><dd>${evidence}</dd>`;
  if (priorityMatch.reported && r.termPending && !r.waiverPending && !m.unavailable) {
    const alternative = priorityQuotes.find(q => q.differentCapital && (!q.occupationRated || q.occupationMatched) &&
      q.term === `To Age ${p.toAge}` && q.quotedLife >= p.life && q.quotedCi >= p.ci);
    if (alternative) {
      const cover = [alternative.quotedLife && "vida " + gbp(alternative.quotedLife),
        alternative.quotedCi && "doenças graves " + gbp(alternative.quotedCi)].filter(Boolean).join(" e ");
      const total = gbp(alternative.premium + m.total);
      r.alternativePackage = `Alternativa com capital ajustado · ${alternative.provider} oferece ${cover} até os ${p.toAge} anos. ` +
        (m.c ? `${gbp(alternative.premium)} + ${gbp(m.total)} de MetLife = ${total}/mês.` : `Mensalidade de ${total}.`);
    }
  }
  if (!r.complete && !r.alternativePackage && !m.unavailable && !p.life && p.ci) {
    const alternative = tpdPrices.find(row => Number(row.quoted_independent_ci_cover) === p.ci &&
      row.quoted_term === `To Age ${p.toAge}` && (row.occupation_rated === "No" || occupationalBasis(p.occupation, row).occupationMatched) && row.tpd_basis !== "None");
    if (alternative) {
      const premium = Number(alternative.monthly_premium);
      r.alternativePackage = "Alternativa documentada com TPD · " + alternative.provider + " · " +
        gbp(p.ci) + " de diagnóstico independente até os " + p.toAge + " anos por " + gbp(premium) + "/mês.";
      if (alternative.occupation_rated === "Yes") r.alternativePackage += " " + historicalOccupationNote(alternative, p) + ".";
      if (m.c) r.alternativePackage += " Com a MetLife selecionada (" + gbp(m.total) + "), o pacote soma " + gbp(premium + m.total) + "/mês.";
      if (p.waiver === "Yes" && alternative.waiver_to !== "Expiry" && !(Number(alternative.waiver_to) >= p.toAge))
        r.alternativePackage += " A isenção até o fim do contrato precisa de confirmação.";
      r.alternativePackage += " Comparativo de " + alternative.source_date + ".";
    }
  }
  if (r.complete && r.aggregateOnly && !p.ci && p.waiver !== "Yes") {
    const withWaiver = waiverComparisonFor(p).sameEndAge?.[0];
    if (withWaiver) {
      r.alternativePackage = "Opção com isenção de mensalidade · " + withWaiver.provider + " · vida de " +
        gbp(p.life) + " " + quotedTerm(withWaiver, p) + ". No comparativo de " + withWaiver.sourceDate +
        ", a mensalidade com isenção era " + gbp(withWaiver.premium) + ".";
      if (m.c) r.alternativePackage += " Com " + gbp(m.total) + " de MetLife, o total dessa opção seria " +
        gbp(withWaiver.premium + m.total) + "/mês.";
    }
  }
  if (!r.provider && !priorityMatch.reported && !priorityMatch.exact && !priorityMatch.gap &&
      !r.waiverPending && !m.unavailable && p.life && p.ci) {
    const option = separatePolicyOptions(p)[0];
    if (option) {
      const {provider, life, ci, sum} = option;
      r.separatePolicyNote = `Alternativa em duas apólices individuais da ${provider}, até os ${p.toAge} anos. ` +
        `Vida de ${gbp(p.life)} por ${gbp(Number(life.monthly_premium))}/mês e diagnóstico independente de ${gbp(p.ci)} ` +
        `por ${gbp(Number(ci.monthly_premium))}/mês. A soma dos prêmios individuais é ${gbp(sum)}/mês.` +
        (m.c ? ` Com ${gbp(m.total)} da MetLife selecionada, o total estimado em contratos separados é ${gbp(sum + m.total)}/mês.` : "") +
        ` Comparativos de ${life.source_date}, referências ${life.model_id} e ${ci.model_id}. A contratação simultânea precisa de confirmação.`;
    }
  }
  if (p.monthlyBudget > 0 && (!r.complete || r.aggregateOnly || displayedPence(r.main) + displayedPence(m.total) >= displayedPence(p.monthlyBudget))) {
    const choice = lifeWithinBudget(p, m);
    if (choice) {
      const coverage = gbp(choice.life) + " de vida" + (p.ci ? " e " + gbp(p.ci) + " de diagnóstico independente" : "") +
        (p.waiver === "Yes" ? " com isenção de mensalidade" : "");
      r.affordableNote = "A opção abaixo de " + gbp(p.monthlyBudget) + "/mês cobre " + coverage + " até os " + p.toAge +
        " anos pela " + choice.provider + ". " + gbp(choice.price) +
        (m.c ? " + " + gbp(m.total) + " da MetLife selecionada" : "") + " = " + gbp(choice.total) +
        "/mês. O preço da seguradora vem do comparativo de " + choice.date + ". É o maior capital de vida abaixo do solicitado encontrado nos comparativos compatíveis dos últimos 180 dias.";
      if (r.complete && r.aggregateOnly && displayedPence(r.main) < displayedPence(choice.price))
        r.affordableNote += " O modelo geral estimou um preço menor para o capital maior. Confirme essa estimativa com a seguradora.";
    }
  }
  $("alternativePackage").textContent = [r.alternativePackage, r.separatePolicyNote, r.affordableNote].filter(Boolean).join(" ");
  $("alternativePackage").hidden = !$("alternativePackage").textContent;
  $("metlifeResult").textContent = m.unavailable
    ? "MultiProtect indisponível para nova contratação após 65 anos"
    : m.c
      ? `MultiProtect ${m.c} cota(s): ${gbp(m.total)} — ${gbp(m.base)} Essencial${m.lux ? ", " + gbp(m.lux) + " Luxações" : ""}${m.child ? ", " + gbp(m.child) + " Crianças" : ""}`
      : "MultiProtect não incluído";
  r.metlife = m;
  r.text = makeSummary(p, r);
  lastPayload = { ...p, result: r };
  $("results").scrollIntoView({ behavior: "smooth" });
}
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    render(payload());
  } catch (err) {
    $("coverError").textContent = err.message;
    toast(err.message);
  }
});
$("age").addEventListener("input", () => {
  updateProfile();
  updateMetlife();
});
["weight", "height"].forEach((id) =>
  $(id).addEventListener("input", updateProfile),
);
document
  .querySelectorAll('input[name="toAge"]')
  .forEach((x) => x.addEventListener("change", updateProfile));
$("form").addEventListener("input", () => {
  lastPayload = null;
  $("results").classList.add("hidden");
});
["metlifeCotas", "metlifeLux", "metlifeChild"].forEach((id) =>
  $(id).addEventListener("change", updateMetlife),
);
$("copy").onclick = () =>
  navigator.clipboard
    .writeText(lastPayload?.result.text || "")
    .then(() => toast("Resumo copiado."));
$("save").onclick = () => {
  if (!lastPayload) return;
  let xs = JSON.parse(localStorage.getItem("segurouk-simulacoes") || "[]");
  lastPayload.id = crypto.randomUUID();
  xs.unshift(lastPayload);
  localStorage.setItem("segurouk-simulacoes", JSON.stringify(xs.slice(0, 50)));
  toast("Simulação salva neste navegador.");
  loadSaved();
};
function loadSaved() {
  let xs = JSON.parse(localStorage.getItem("segurouk-simulacoes") || "[]");
  $("savedList").innerHTML = xs.length
    ? xs
        .map(
          (x) =>
            `<div class="savedItem"><span>${x.age} anos · ${escapeHtml(x.occupation)} · Vida ${gbp(x.life)} + CI ${gbp(x.ci)}</span><button onclick="delSaved('${escapeHtml(x.id)}')">Excluir</button></div>`,
        )
        .join("")
    : "Nenhuma simulação salva.";
}
window.delSaved = (id) => {
  let xs = JSON.parse(
    localStorage.getItem("segurouk-simulacoes") || "[]",
  ).filter((x) => x.id !== id);
  localStorage.setItem("segurouk-simulacoes", JSON.stringify(xs));
  loadSaved();
};
init();
