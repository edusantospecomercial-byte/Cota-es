let catalog = { models: {} },
  priorityRows = [],
  priorityGapRows = [],
  observedRows = [],
  reportedRows = [],
  verifiedArchiveRows = [],
  validatedCapitalRanges = [],
  waiverRows = null,
  individualWaivers = [],
  illustratedLifeRows = [],
  acceleratedOffers = [],
  tpdOffers = [],
  lgIllustratedTerms = [],
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
    loadedIndividualWaivers,
    avivaLife,
    loadedLgTerms,
    loadedTpdOffers,
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
  ]);
  tpdOffers = loadedTpdOffers;
  lgIllustratedTerms = loadedLgTerms;
  individualWaivers = loadedIndividualWaivers;
  acceleratedOffers = loadedAccelerated;
  illustratedLifeRows = illustratedLife.map(row => ({ ...row, provider: "Zurich" })).concat(
    avivaLife.map(row => ({ ...row, provider: "Aviva", policy_count: "1", discount_monthly: "0.00" })));
  reportedRows = loadedReports;
  const trials = evaluateCapitalTrials(loadedReports, capitalHoldout);
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
    comparable.push({ lower, upper, check, axis, error, passed: error <= 1 && error / Number(check.monthly_premium) <= 0.05 });
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
      occupationRated: lower.occupation_rated === "Yes" });
  }
  const compatible = [...groups.values()].filter(group =>
    new Set(group.quotes.map(q => q.provider)).size === group.quotes.length);
  compatible.sort((a, b) => b.quotes.length - a.quotes.length ||
    b.check.source_date.localeCompare(a.check.source_date) ||
    a.width - b.width);
  const range = compatible[0];
  if (!range) return null;
  const quotes = range.quotes.sort((a, b) => a.premium - b.premium);
  const sameEndAge = quotes.filter(q => !q.occupationRated && q.term === `To Age ${p.toAge}`);
  return { quotes, exact: false, capitalRange: range, sameEndAge: sameEndAge.length ? sameEndAge : undefined,
    termPending: !sameEndAge.length, sourceDate: range.check.source_date };
}

function documentedLookupPrice(p, amount) {
  if (!(amount > 0)) return false;
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const matches = row => Number(row.age) === p.age && row.smoker === smoker &&
    Number(row.to_age) === p.toAge && Number(row.life_cover) === p.life;
  if (!p.ci && illustratedLifeRows.some(row => matches(row) && Number(row.base_monthly) === amount))
    return true;
  return reportedRows.concat(verifiedArchiveRows).some(row => matches(row) && row.available === "true" &&
    Number(row.critical_illness_cover) === p.ci && row.life_cover === row.quoted_life_cover &&
    row.critical_illness_cover === row.quoted_critical_illness_cover && row.occupation_rated === "No" &&
    (!row.quoted_tpd || row.quoted_tpd === "None") &&
    row.quoted_term === `To Age ${p.toAge}` && Number(row.monthly_premium) === amount);
}

function renderCiComparison(p, independentTpd = false) {
  const prefix = independentTpd ? "tpd" : "accelerated";
  const offers = independentTpd ? tpdOffers : acceleratedOffers;
  const requestedCi = independentTpd ? "independent_ci_cover" : "earlier_ci_cover";
  const panel = $(prefix + "Comparison");
  panel.hidden = true;
  panel.open = false;
  $(prefix + "Offers").textContent = "";
  if (!p.life || !p.ci) return;
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const matching = offers.filter(row => row.smoker === smoker &&
    Number(row.age) === p.age && Number(row.to_age) === p.toAge &&
    Number(row.life_cover) === p.life && Number(row[requestedCi]) === p.ci);
  if (!matching.length) return;
  const referencesWithWaiverColumn = new Set(matching.filter(row => row.waiver_to !== "not_shown").map(row => row.reference));
  const requestedWaiver = p.waiver === "Yes";
  const comparable = matching.filter(row => referencesWithWaiverColumn.has(row.reference) === requestedWaiver);
  const candidates = comparable.length ? comparable : matching;
  const latest = candidates.reduce((a, b) => a.source_date > b.source_date ||
    (a.source_date === b.source_date && Number(a.reference) > Number(b.reference)) ? a : b);
  const prices = matching.filter(row => row.reference === latest.reference)
    .sort((a, b) => Number(a.monthly_premium) - Number(b.monthly_premium));
  const entries = prices.map(row => {
    const waiver = row.waiver_to === "Expiry" ? "isenção até o fim do contrato" :
      /^\d+$/.test(row.waiver_to) ? "isenção durante a vigência, com idade-limite informada de " + row.waiver_to + " anos" :
      "prazo de isenção sem confirmação";
    const term = row.quoted_term.startsWith("To Age ") ? "até os " + row.quoted_term.slice(7) + " anos" :
      row.quoted_term.split(" ")[0] + " anos de prazo";
    const detail = [term, "vida " + gbp(Number(row.quoted_life_cover))];
    if (Number(row.quoted_independent_ci_cover) > 0)
      detail.push("diagnóstico independente " + gbp(Number(row.quoted_independent_ci_cover)));
    if (Number(row.quoted_earlier_ci_cover) > 0)
      detail.push("vida ou diagnóstico " + gbp(Number(row.quoted_earlier_ci_cover)));
    detail.push(waiver, "TPD " + row.tpd_basis);
    if (row.occupation_rated === "Yes") detail.push("preço depende da profissão");
    return `<dt>${escapeHtml(row.provider)}</dt><dd><b>${gbp(Number(row.monthly_premium))}/mês</b> · ${escapeHtml(detail.join(" · "))}</dd>`;
  });
  $(prefix + "Source").textContent = "Comparativo de " + latest.source_date +
    " · referência " + latest.reference + " · mensalidades antes da MetLife. " +
    (referencesWithWaiverColumn.has(latest.reference) ? "O relatório traz uma coluna de isenção. Confira a resposta de cada seguradora." :
      "O relatório não informa isenção nas ofertas.");
  $(prefix + "Offers").innerHTML = entries.join("");
  panel.hidden = false;
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

function lgTermReference(p) {
  if (!p.life || p.ci) return "";
  const smoker = p.smoker === "smoker" ? "Yes" : "No";
  const matching = lgIllustratedTerms.filter(row => Number(row.age) === p.age && row.smoker === smoker &&
    Number(row.to_age) === p.toAge && Number(row.life_cover) === p.life);
  if (!matching.length) return "";
  const latest = matching.reduce((a, b) => a.source_date >= b.source_date ? a : b);
  const contemporaries = matching.filter(row => row.source_date === latest.source_date);
  const signature = row => [row.term_years, row.base_monthly, row.waiver_monthly, row.policy_monthly].join("|");
  if (contemporaries.some(row => signature(row) !== signature(latest))) return "";
  return "Legal & General · " + latest.source_date + " · pedido até os " + latest.to_age +
    " anos. Prazo oferecido de " + latest.term_years + " anos. Vida " + gbp(Number(latest.base_monthly)) +
    " + isenção " + gbp(Number(latest.waiver_monthly)) + " = " + gbp(Number(latest.policy_monthly)) +
    "/mês na illustration " + latest.reference + ".";
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
      tpd: row.quoted_tpd || "None", occupationRated: row.occupation_rated === "Yes" })).sort((a, b) => a.premium - b.premium);
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
  const exactTerms = quotes.filter(q => !q.differentCapital && !q.occupationRated && q.tpd === "None" && q.term === `To Age ${p.toAge}`);
  return { quotes, exact: true, reported: true, sourceDate: latest.source_date, modelId: latest.model_id,
    sameEndAge: exactTerms.length ? exactTerms : undefined, termPending: !exactTerms.length,
    partial: Boolean(missing.length), gap: missing.length ? {
      provider: missing.map(row => row.provider).join(", "), reason: reasons.join(". "), modelId: latest.model_id,
    } : null };
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
  let rawCandidates = priorityRows.concat(newExact)
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
  const knownGap = priorityGapRows
    .filter(
      (row) =>
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
function quotedTerm(quote) {
  let term = quote.term.startsWith("To Age ")
    ? `até ${quote.term.slice(7)} anos`
    : `${parseInt(quote.term, 10)} anos de prazo`;
  if (quote.tpd === "Own occupation") term += " · inclui incapacidade permanente para a própria profissão (TPD)";
  if (quote.waiverTo) {
    const waiver = quote.waiverTo === "Expiry" ? "isenção até o fim do contrato" :
      "isenção durante a vigência, com idade-limite informada de " + quote.waiverTo + " anos";
    return term + " · " + waiver;
  }
  return quote.differentCapital
    ? `${term} · capital oferecido: vida ${gbp(quote.quotedLife)} e doenças graves ${gbp(quote.quotedCi)}`
    : term;
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
function predict(model, p) {
  let key = `${p.age}|${p.toAge}|${p.life}|${p.ci}|${p.smoker === "smoker" ? 1 : 0}`;
  if (model.lookup?.[key] != null) return model.lookup[key];
  let calibrated = globalThis.lookupInterpolate?.(model, p);
  if (calibrated != null) return calibrated;
  if (model.modelType === "monotonic_hist_gb") return ridgePredict(model, p);
  if (model.modelType === "knn" && model.points?.length) {
    let target = [
        p.age / 10,
        p.term / 10,
        Math.log1p(p.life),
        Math.log1p(p.ci),
        0,
        3 * (p.smoker === "smoker"),
      ],
      all = model.points
        .map((row) => ({
          d: Math.sqrt(target.reduce((s, x, i) => s + (x - row[i]) ** 2, 0)),
          v: row[6],
        }))
        .sort((a, b) => a.d - b.d);
    if (all[0].d <= 0.15) {
      let close = all
          .filter((x) => x.d <= all[0].d + 0.02)
          .map((x) => x.v)
          .sort((a, b) => a - b),
        mid = Math.floor(close.length / 2);
      return close.length % 2 ? close[mid] : (close[mid - 1] + close[mid]) / 2;
    }
    let nearest = all.slice(0, model.k || 7),
      weights = nearest.map((x) => 1 / (x.d + 0.1) ** 2),
      sum = weights.reduce((a, b) => a + b, 0);
    return nearest.reduce((s, x, i) => s + x.v * weights[i], 0) / sum;
  }
  return ridgePredict(model, p);
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
      `Isenção de mensalidade incluída · comparativo de ${r.providerQuotes[0].sourceDate}`);
  lines.push(
    r.supported
      ? `${r.waiverPending || r.termPending || (r.reportNote && !r.providerQuotes?.length) ? "Referência geral para a proteção principal" : "Estimativa"}: ${gbp(r.main)}/mês`
      : "Estimativa principal: requer cotação oficial",
  );
  if (r.supported && !r.illustratedBase)
    lines.push(
      `${r.detailed && r.termPending ? "Faixa das alternativas devolvidas" : r.detailed ? "Faixa para a idade final solicitada" : r.providerQuotes?.length ? r.providerGap ? "Faixa observada entre seguradoras disponíveis" : r.priorityExact ? "Faixa observada entre seguradoras" : "Faixa estimada entre seguradoras" : "Faixa provável"}: ${gbp(r.low)}–${gbp(r.high)}/mês`,
    );
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
      lines.push(`${q.provider} · ${quotedTerm(q)} · ${gbp(q.premium)}/mês${m.c ? ` · com MetLife ${gbp(q.premium + m.total)}/mês` : ""}${q.occupationRated ? " · preço do perfil profissional de referência" : ""}`);
  if (r.reportNote) lines.push(r.reportNote);
  if (r.illustrationNote) lines.push(r.illustrationNote);
  if (r.componentNote) lines.push(r.componentNote);
  if (r.lgTermNote) lines.push(r.lgTermNote);
  if (r.alternativePackage) lines.push(r.alternativePackage);
  if (r.complete)
    lines.push("", `Total estimado: ${gbp(r.main + m.total)}/mês`);
  else lines.push("", "Total do pacote a confirmar.");
  lines.push(
    "",
    "Estimativa baseada em illustrations históricos. Valor final sujeito à cotação oficial e underwriting.",
  );
  return lines.join("\n");
}
function render(p) {
  renderCiComparison(p);
  renderCiComparison(p, true);
  $("coverError").textContent = "";
  if (p.toAge <= p.age)
    throw Error(`A cobertura até ${p.toAge} anos exige idade atual menor.`);
  if (!p.life && !p.ci) throw Error("Selecione ao menos uma cobertura.");
  if (![p.life, p.ci].every(amount => Number.isSafeInteger(amount) && amount >= 0))
    throw Error("Informe os capitais em libras inteiras.");
  let m = metlifeForAge(ml(), p.age),
    key =
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
      estimate = predict(model, p);
    if (Number.isFinite(estimate)) {
      r.supported = true;
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
  r.detailed = r.withWaiver || r.capitalRange || Boolean(priorityMatch.reported && priorityQuotes.length);
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
      priorityMatch.partial
        ? `Cotação oficial ${priorityMatch.gap.modelId}: ${priorityMatch.gap.provider} não retornou preço (${priorityMatch.gap.reason}). Os preços oficiais disponíveis foram preservados sem inventar o valor ausente.`
        : `Cotação oficial ${priorityMatch.gap.modelId}: ${priorityMatch.gap.provider} não retornou preço (${priorityMatch.gap.reason}). A estimativa geral permanece disponível, sem inventar preço específico dessa seguradora.`,
    );
  if (priorityQuotes.length === 3 || ((r.capitalRange || r.withWaiver || priorityMatch.partial) && priorityQuotes.length)) {
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
      !priorityMatch.partial && !r.capitalRange &&
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
    if (!standalone) r.illustrationNote += " O documento inclui outras apólices.";
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
  r.lgTermNote = lgTermReference(p);
  const avivaRecord = illustratedLifeFor(p, "Aviva");
  if (avivaRecord) {
    r.componentNote = "Aviva · " + avivaRecord.source_date + " · prêmio-base de vida " +
      gbp(Number(avivaRecord.base_monthly)) + " + adicionais " + gbp(Number(avivaRecord.additional_monthly)) +
      " = " + gbp(Number(avivaRecord.policy_monthly)) + "/mês. Total conferido no comparativo " + avivaRecord.reference + ".";
  }
  if (r.supported && !r.providerQuotes?.length && !r.illustratedBase)
    warnings.unshift(
      "Estimativa do modelo histórico agregado; ainda sem interpolação validada das três seguradoras prioritárias para esta combinação.",
    );
  if (p.life && p.ci && !r.providerQuotes?.length && !priorityMatch.reported && r.supported) {
    r.reportNote = "A base histórica inclui coberturas em que o diagnóstico antecipa o pagamento de vida. Confirme o preço do pagamento independente no SolutionBuilder.";
    warnings.push(r.reportNote);
  }
  if (r.waiverPending) warnings.unshift(waiverMatch.note + " O preço-base apresentado é a estimativa geral.");
  r.complete = r.supported && !r.waiverPending && !m.unavailable && !priorityMatch.termPending;
  $("results").classList.remove("hidden");
  $("quoteCount").textContent = r.supported ? 1 : 0;
  $("unsupportedCount").textContent = r.complete ? 0 : 1;
  $("resultTitle").textContent = r.supported && !r.complete ? "Estimativa parcial" : r.supported
    ? "Estimativa calculada"
    : "Cotação oficial necessária";
  $("mainPrice").textContent = r.supported
    ? `${gbp(r.main)}/mês`
    : "Não publicado";
  $("range").textContent = r.illustratedBase ? "Prêmio-base de vida registrado na illustration " + r.provider : r.supported
    ? `${r.detailed && r.termPending ? "Faixa das alternativas devolvidas" : r.detailed ? "Faixa para a idade final solicitada" : r.providerQuotes?.length ? r.providerGap ? "Faixa observada entre seguradoras disponíveis" : r.priorityExact ? "Faixa observada entre seguradoras" : "Faixa estimada entre seguradoras" : "Faixa provável"}: ${gbp(r.low)} a ${gbp(r.high)}/mês`
    : "O motor não publica um preço sem validação suficiente.";
  $("totalPrice").textContent = r.complete
    ? `${gbp(r.main + m.total)}/mês`
    : "A confirmar";
  $("warning").textContent = warnings.join(" ");
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
  let confidenceLabel = r.providerQuotes?.length
    ? r.providerGap
      ? "oficial parcial"
      : r.priorityExact
        ? "oficial exata"
        : `interpolação indicativa · arquivo histórico ${(confidenceMetrics.tested || 0) < 30 ? "com amostra limitada" : "avaliado"} (${Number(confidenceMetrics.mape * 100 || 0).toFixed(2)}% MAPE · P95 ${Number(confidenceMetrics.p95 * 100 || 0).toFixed(2)}% · n=${confidenceMetrics.tested || 0}${forwardEvidence})`
    : model
      ? `modelo histórico agregado (${confidencePt(model.confidence)})`
      : "insuficiente";
  let priorityDetail = r.providerQuotes?.length
    ? `<dt>Seguradoras prioritárias</dt><dd>${r.providerQuotes.map((quote) => `${escapeHtml(quote.provider)} ${gbp(quote.premium)}`).join(" · ")}${r.providerGap ? ` · ${escapeHtml(r.providerGap.provider)} sem preço no relatório` : ""}</dd><dt>Preço-base usado</dt><dd>${escapeHtml(r.provider)} · ${escapeHtml(r.product)}</dd><dt>Origem do preço</dt><dd>${r.priorityExact ? `SolutionBuilder ref. ${escapeHtml(r.providerQuotes[0].modelId)}${r.providerQuotes[0].sourceDate ? ` · ${escapeHtml(r.providerQuotes[0].sourceDate)}` : ""}` : "Interpolação de múltiplas âncoras oficiais do SolutionBuilder"}</dd>`
    : "";
  if (r.detailed) {
    const rows = r.providerQuotes.map(q => `<dt>${escapeHtml(q.provider)}</dt><dd>${gbp(q.premium)}/mês · ${escapeHtml(quotedTerm(q))}${m.c ? ` · com MetLife ${gbp(q.premium + m.total)}/mês` : ""}${q.occupationRated ? " · depende da profissão de referência" : ""}</dd>`).join("");
    priorityDetail = `<dt>${r.capitalRange ? "Estimativa por capital" : r.withWaiver ? "Comparativo com isenção" : "Comparativo sem isenção"}</dt><dd>SolutionBuilder · ${escapeHtml(r.providerQuotes[0].sourceDate)}</dd>${rows}`;
    if (r.complete)
      priorityDetail += `<dt>Preço usado no total</dt><dd>${escapeHtml(r.provider)} · até ${p.toAge} anos</dd>`;
  }
  if (r.illustrationNote)
    priorityDetail += `<dt>Prêmio-base documentado</dt><dd>${escapeHtml(r.illustrationNote)}</dd>`;
  if (r.lgTermNote) priorityDetail += `<dt>Prazo e preço documentados pela L&amp;G</dt><dd>${escapeHtml(r.lgTermNote)}</dd>`;
  if (r.componentNote) priorityDetail += `<dt>Composição da apólice histórica</dt><dd>${escapeHtml(r.componentNote)}</dd>`;
  const evidence = r.illustratedBase ? `1 illustration ${escapeHtml(r.provider)} · vida em apólice individual` : r.detailed
    ? r.capitalRange ? `2 capitais de referência · 1 capital de teste · ${r.providerQuotes.length} ${r.providerQuotes.length === 1 ? "seguradora" : "seguradoras"}` : `1 comparativo · ${r.providerQuotes.length} preços históricos`
    : `${model?.records || 0} registros na família · confiança ${escapeHtml(confidenceLabel)}`;
  $("details").innerHTML =
    `<dt>Perfil</dt><dd>${p.age} anos · ${p.smoker === "smoker" ? "fumante" : "não fumante"}</dd><dt>Profissão</dt><dd>${escapeHtml(p.occupation)}</dd><dt>Peso · altura · IMC</dt><dd>${p.weight}kg · ${p.height}cm · ${bmi}</dd><dt>Cobertura solicitada</dt><dd>até ${p.toAge} · ${p.term} anos</dd><dt>Vida</dt><dd>${gbp(p.life)}</dd><dt>Doenças Graves</dt><dd>${gbp(p.ci)}</dd><dt>Premium</dt><dd>Garantido</dd>${priorityDetail}<dt>Base de referência</dt><dd>${evidence}</dd>`;
  if (priorityMatch.reported && r.termPending && !r.waiverPending && !m.unavailable) {
    const alternative = priorityQuotes.find(q => q.differentCapital && !q.occupationRated &&
      q.term === `To Age ${p.toAge}` && q.quotedLife >= p.life && q.quotedCi >= p.ci);
    if (alternative) {
      const cover = [alternative.quotedLife && "vida " + gbp(alternative.quotedLife),
        alternative.quotedCi && "doenças graves " + gbp(alternative.quotedCi)].filter(Boolean).join(" e ");
      const total = gbp(alternative.premium + m.total);
      r.alternativePackage = `Alternativa com capital ajustado · ${alternative.provider} oferece ${cover} até os ${p.toAge} anos. ` +
        (m.c ? `${gbp(alternative.premium)} + ${gbp(m.total)} de MetLife = ${total}/mês.` : `Mensalidade de ${total}.`);
    }
  }
  $("alternativePackage").textContent = r.alternativePackage || "";
  $("alternativePackage").hidden = !r.alternativePackage;
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
