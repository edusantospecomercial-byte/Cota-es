let catalog = { models: {} },
  priorityRows = [],
  priorityGapRows = [],
  lastPayload = null;
const $ = (id) => document.getElementById(id),
  num = (id) => Number($(id).value || 0),
  gbp = (n) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
    }).format(n);
function toast(s) {
  $("toast").textContent = s;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2200);
}
async function init() {
  [catalog, priorityRows, priorityGapRows] = await Promise.all([
    fetch("./data/models.json?v=20261120-105")
      .then((r) => r.json())
      .catch(() => ({ models: {} })),
    fetch(
      "./data/solutionbuilder-priority-providers-2026-11-20.csv?v=20261120-103",
    )
      .then((r) => r.text())
      .then(parsePriorityCsv)
      .catch(() => []),
    fetch(
      "./data/solutionbuilder-priority-provider-gaps-2026-11-20.csv?v=20261120-104",
    )
      .then((r) => r.text())
      .then(parsePriorityCsv)
      .catch(() => []),
  ]);
  let n = Object.keys(catalog.models).length,
    records =
      catalog.calibratedRecords ||
      Object.values(catalog.models).reduce((s, m) => s + (m.records || 0), 0),
    priority = catalog.audit?.priorityProviderPrices || 0;
  $("baseStatus").textContent = n
    ? `${records} registros confiáveis · ${priority} preços prioritários · ${n} famílias calibradas`
    : "Base histórica · cotação oficial necessária";
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
function priorityQuotesFor(p) {
  let expectedSmoker = p.smoker === "smoker" ? "Yes" : "No";
  let knownGap = priorityGapRows.find(
    (row) =>
      row.smoker === expectedSmoker &&
      Number(row.age) === p.age &&
      Number(row.to_age) === p.toAge &&
      Number(row.life_cover) === p.life &&
      Number(row.critical_illness_cover) === p.ci,
  );
  if (knownGap) {
    let exactAvailableQuotes =
      Number(knownGap.critical_illness_cover) === 0
        ? [
            {
              provider: "Zurich",
              product: "Zurich Life",
              premium: Number(knownGap.zurich_premium),
              modelId: knownGap.model_id,
            },
            {
              provider: "Aviva",
              product: "Aviva Life Insurance+",
              premium: Number(knownGap.aviva_premium),
              modelId: knownGap.model_id,
            },
          ]
            .filter((quote) => Number.isFinite(quote.premium))
            .sort((a, b) => a.premium - b.premium)
        : [];
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
  let rawCandidates = priorityRows
    .filter(
      (row) =>
        row.available === "true" &&
        row.smoker === expectedSmoker &&
        Number(row.critical_illness_cover) === p.ci,
    )
    .map((row) => ({
      provider: row.provider,
      product: row.product,
      premium: Number(row.monthly_premium),
      modelId: row.model_id,
      age: Number(row.age),
      life: Number(row.life_cover),
      toAge: Number(row.to_age),
    }))
    .filter((row) => Number.isFinite(row.premium));
  let latestByAnchor = new Map();
  for (const row of rawCandidates) {
    let key = [row.provider, row.age, row.toAge, row.life].join("|"),
      previous = latestByAnchor.get(key);
    if (!previous || Number(row.modelId) > Number(previous.modelId))
      latestByAnchor.set(key, row);
  }
  let candidates = [...latestByAnchor.values()];
  let exact = candidates
    .filter(
      (row) =>
        row.age === p.age && row.life === p.life && row.toAge === p.toAge,
    )
    .sort((a, b) => a.premium - b.premium);
  if (new Set(exact.map((row) => row.provider)).size === 3)
    return { quotes: exact, exact: true };
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
              premium:
                belowAge.premium +
                (aboveAge.premium - belowAge.premium) * ratio,
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
        premium:
          belowTerm.premium + (aboveTerm.premium - belowTerm.premium) * ratio,
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
function updateMetlife() {
  let m = ml();
  $("metlifePreview").textContent = gbp(m.total);
  $("metlifeBreakdown").textContent = m.c
    ? `${gbp(m.base)} Essencial${m.lux ? " + " + gbp(m.lux) + " Luxações" : ""}${m.child ? " + " + gbp(m.child) + " Crianças" : ""}`
    : "Não incluído";
}
function normalizeStep(id) {
  let el = $(id),
    v = Number(el.value);
  if (v) el.value = Math.max(Number(el.min), Math.round(v / 10000) * 10000);
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
    waiver: "No",
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
  let m = ml(),
    lines = [
      "Estimativa de proteção",
      "",
      `Idade: ${p.age} anos`,
      p.smoker === "smoker" ? "Fumante" : "Não fumante",
      `Profissão: ${p.occupation}`,
      `Cobertura até: ${p.toAge} anos`,
      `Seguro de Vida: ${gbp(p.life)}`,
      `Diagnóstico de Doenças Graves: ${gbp(p.ci)}`,
    ];
  lines.push(
    r.supported
      ? `Estimativa: ${gbp(r.main)}/mês`
      : "Estimativa principal: requer cotação oficial",
  );
  if (r.supported)
    lines.push(`Faixa provável: ${gbp(r.low)}–${gbp(r.high)}/mês`);
  if (r.provider)
    lines.push(`Referência prioritária: ${r.provider} — ${gbp(r.main)}/mês`);
  if (r.providerQuotes?.length)
    lines.push(
      `Seguradoras prioritárias: ${r.providerQuotes.map((quote) => `${quote.provider} ${gbp(quote.premium)}`).join(" · ")}${r.providerGap ? ` · ${r.providerGap.provider} indisponível` : ""}`,
    );
  if (m.c)
    lines.push(
      "",
      `MetLife MultiProtect: ${m.c} Cota${m.c > 1 ? "s" : ""}${m.lux ? " + Luxações" : ""}${m.child ? " + Crianças" : ""}`,
      `${gbp(m.total)}/mês (${gbp(m.base)} Essencial${m.lux ? " + " + gbp(m.lux) + " Luxações" : ""}${m.child ? " + " + gbp(m.child) + " Crianças" : ""})`,
    );
  if (r.supported)
    lines.push("", `Total estimado: ${gbp(r.main + m.total)}/mês`);
  lines.push(
    "",
    "Estimativa baseada em illustrations históricos. Valor final sujeito à cotação oficial e underwriting.",
  );
  return lines.join("\n");
}
function render(p) {
  $("coverError").textContent = "";
  if (p.toAge <= p.age)
    throw Error(`A cobertura até ${p.toAge} anos exige idade atual menor.`);
  if (!p.life && !p.ci) throw Error("Selecione ao menos uma cobertura.");
  if (p.life % 10000 || p.ci % 10000)
    throw Error(
      "Vida e Doenças Graves devem usar intervalos inteiros de £10.000.",
    );
  let m = ml(),
    key =
      p.life && p.ci
        ? "life_plus_standalone_ci:standard_core_ci"
        : p.life
          ? "life_only"
          : "critical_illness_only",
    model =
      catalog.models[key] ||
      catalog.models["life_plus_standalone_ci:standard_core_ci"] ||
      Object.values(catalog.models)[0],
    warnings = [],
    r = { supported: false, main: 0, low: 0, high: 0 };
  if (p.age === 65 && m.c)
    warnings.push(
      "MetLife aos 65 anos exige data de nascimento e verificação do aniversário.",
    );
  if (p.age >= 66 && m.c) {
    warnings.push("Nova contratação MetLife indisponível para esta idade.");
    m.total = 0;
  }
  if (model) {
    let outside =
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
      let spread = Math.max(
        model.residualQ90 || 0,
        r.main * (outside || !model.strictlyValidated ? 0.35 : 0.2),
      );
      r.low = Math.max(0, r.main - spread);
      r.high = r.main + spread;
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
      "Esta combinação ainda não passou nos controles de validação. Faça a cotação oficial no SolutionBuilder.",
    );
  let priorityMatch = priorityQuotesFor(p),
    priorityQuotes = priorityMatch.quotes;
  if (priorityMatch.gap)
    warnings.unshift(
      priorityMatch.partial
        ? `Cotação oficial ${priorityMatch.gap.modelId}: ${priorityMatch.gap.provider} não retornou preço (${priorityMatch.gap.reason}). Os preços oficiais disponíveis foram preservados sem inventar o valor ausente.`
        : `Cotação oficial ${priorityMatch.gap.modelId}: ${priorityMatch.gap.provider} não retornou preço (${priorityMatch.gap.reason}). A estimativa geral permanece disponível, sem inventar preço específico dessa seguradora.`,
    );
  if (priorityQuotes.length === 3 || (priorityMatch.partial && priorityQuotes.length)) {
    let selected = priorityQuotes[0];
    r.supported = true;
    r.main = selected.premium;
    r.low = selected.premium;
    r.high = priorityQuotes.at(-1).premium;
    r.provider = selected.provider;
    r.product = selected.product;
    r.providerQuotes = priorityQuotes;
    r.providerGap = priorityMatch.gap || null;
    r.priorityExact = priorityMatch.exact;
    warnings.unshift(
      priorityMatch.partial
        ? `Preços oficiais exatos disponíveis para ${priorityQuotes.map((quote) => quote.provider).join(" e ")}; ${priorityMatch.gap.provider} ficou indisponível neste cenário.`
        : priorityMatch.exact
        ? `Preço oficial exato do SolutionBuilder: ${selected.provider} entre as seguradoras prioritárias.`
        : `Estimativa interpolada entre âncoras oficiais do SolutionBuilder: ${selected.provider} entre as seguradoras prioritárias.`,
    );
  }
  $("results").classList.remove("hidden");
  $("quoteCount").textContent = r.supported ? 1 : 0;
  $("unsupportedCount").textContent = r.supported ? 0 : 1;
  $("resultTitle").textContent = r.supported
    ? "Estimativa calculada"
    : "Cotação oficial necessária";
  $("mainPrice").textContent = r.supported
    ? `${gbp(r.main)}/mês`
    : "Não publicado";
  $("range").textContent = r.supported
    ? `Faixa provável: ${gbp(r.low)} a ${gbp(r.high)}/mês`
    : "O motor não publica um preço sem validação suficiente.";
  $("totalPrice").textContent = r.supported
    ? `${gbp(r.main + m.total)}/mês`
    : m.total
      ? `${gbp(m.total)}/mês`
      : "—";
  $("warning").textContent = warnings.join(" ");
  let bmi = (p.weight / (p.height / 100) ** 2).toFixed(1);
  let priorityDetail = r.providerQuotes?.length
    ? `<dt>Seguradoras prioritárias</dt><dd>${r.providerQuotes.map((quote) => `${quote.provider} ${gbp(quote.premium)}`).join(" · ")}${r.providerGap ? ` · ${r.providerGap.provider} indisponível` : ""}</dd><dt>Referência usada</dt><dd>${r.provider} · ${r.product}</dd>`
    : "";
  $("details").innerHTML =
    `<dt>Perfil</dt><dd>${p.age} anos · ${p.smoker === "smoker" ? "fumante" : "não fumante"}</dd><dt>Profissão</dt><dd>${p.occupation}</dd><dt>Peso · altura · IMC</dt><dd>${p.weight}kg · ${p.height}cm · ${bmi}</dd><dt>Cobertura</dt><dd>até ${p.toAge} · ${p.term} anos</dd><dt>Vida</dt><dd>${gbp(p.life)}</dd><dt>Doenças Graves</dt><dd>${gbp(p.ci)}</dd><dt>Premium</dt><dd>Garantido</dd>${priorityDetail}<dt>Base comparável</dt><dd>${model?.records || 0} casos · confiança ${model?.confidence || "insuficiente"}</dd>`;
  $("metlifeResult").textContent = m.c
    ? `MultiProtect ${m.c} cota(s): ${gbp(m.total)} — ${gbp(m.base)} Essencial${m.lux ? ", " + gbp(m.lux) + " Luxações" : ""}${m.child ? ", " + gbp(m.child) + " Crianças" : ""}`
    : "MultiProtect não incluído";
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
["age", "weight", "height"].forEach((id) =>
  $(id).addEventListener("input", updateProfile),
);
document
  .querySelectorAll('input[name="toAge"]')
  .forEach((x) => x.addEventListener("change", updateProfile));
["life", "ci"].forEach((id) =>
  $(id).addEventListener("change", () => normalizeStep(id)),
);
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
            `<div class="savedItem"><span>${x.age} anos · ${x.occupation} · Vida ${gbp(x.life)} + CI ${gbp(x.ci)}</span><button onclick="delSaved('${x.id}')">Excluir</button></div>`,
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
