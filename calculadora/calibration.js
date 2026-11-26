(function(root){
  function interpolate(points,x,mode='log'){
    const sorted=points.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).sort((a,b)=>a[0]-b[0]);
    if(!sorted.length||x<sorted[0][0]||x>sorted[sorted.length-1][0])return null;
    const exact=sorted.find(p=>p[0]===x);if(exact)return exact[1];
    for(let i=1;i<sorted.length;i++)if(x<sorted[i][0]){
      const [x0,y0]=sorted[i-1],[x1,y1]=sorted[i],ratio=(x-x0)/(x1-x0);
      return mode==='linear'
        ? y0+(y1-y0)*ratio
        : Math.exp(Math.log(y0)+(Math.log(y1)-Math.log(y0))*ratio);
    }
    return null;
  }
  const lookupIndexes = new WeakMap();
  function lookupSlices(model) {
    let index = lookupIndexes.get(model);
    if (index) return index;
    index = [new Map(), new Map()];
    for (const [key, premium] of Object.entries(model.lookup || {})) {
      const [age, toAge, life, ci, smoker] = key.split('|').map(Number);
      if (!index[smoker] || ![age, toAge, life, ci, premium].every(Number.isFinite) || premium <= 0) continue;
      const layers = index[smoker];
      if (!layers.has(ci)) layers.set(ci, { byAge: new Map(), capitals: new Set() });
      const { byAge, capitals } = layers.get(ci);
      capitals.add(life);
      if (!byAge.has(age)) byAge.set(age, new Map());
      const maturities = byAge.get(age);
      if (!maturities.has(toAge)) maturities.set(toAge, []);
      maturities.get(toAge).push([life, premium]);
    }
    lookupIndexes.set(model, index);
    return index;
  }
  function fromLookupSlice(slice, p) {
    if (!slice) return null;
    const byAge = [];
    for (const [age, terms] of slice.byAge) {
      const byTerm = [];
      for (const [end, points] of terms) {
        const price = interpolate(points, p.life, 'linear');
        if (price != null) byTerm.push([end, price]);
      }
      const price = interpolate(byTerm, p.toAge);
      if (price != null) byAge.push([age, price]);
    }
    return interpolate(byAge, p.age);
  }
  root.lookupInterpolate = function(model, p) {
    if (!model?.lookup) return null;
    return fromLookupSlice(lookupSlices(model)[Number(p.smoker === 'smoker')].get(p.ci), p);
  };

  // Pool adjacent decreasing premiums by least squares. Each sampled capital
  // contributes once. Input prices are model budgets, never insurer offers.
  function isotonic(points) {
    const blocks = [];
    for (const [, price] of points) {
      blocks.push({ total: price, count: 1 });
      while (blocks.length > 1) {
        const a = blocks[blocks.length - 2], b = blocks[blocks.length - 1];
        if (a.total / a.count <= b.total / b.count) break;
        a.total += b.total;
        a.count += b.count;
        blocks.pop();
      }
    }
    let i = 0;
    const fitted = [];
    for (const block of blocks) {
      const value = block.total / block.count;
      for (let within = 0; within < block.count; within++) fitted.push([points[i++][0], value]);
    }
    return fitted;
  }

  const budgetSurfaces = new WeakMap();
  function budgetLayers(model, p) {
    let cache = budgetSurfaces.get(model);
    if (!cache) { cache = new Map(); budgetSurfaces.set(model, cache); }
    const key = [p.age, p.toAge, p.smoker, p.ci > 0].join('|');
    if (cache.has(key)) return cache.get(key);
    const curves = [];
    const slices = lookupSlices(model)[Number(p.smoker === 'smoker')];
    for (const [ci, slice] of slices) {
      if ((ci > 0) !== (p.ci > 0)) continue;
      const values = [];
      for (const life of [...slice.capitals].filter(n => n > 0).sort((a, b) => a - b)) {
        const price = fromLookupSlice(slice, { ...p, life });
        if (price != null) values.push([life, price]);
      }
      if (values.length) curves.push([ci, isotonic(values)]);
    }
    curves.sort((a, b) => a[0] - b[0]);
    // Keep the tab's cache bounded when many age and term combinations are tested.
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, curves);
    return curves;
  }

  function alongLife(points, p, fallback) {
    const inside = interpolate(points, p.life, 'linear');
    if (inside != null) return inside;
    const [capital, price] = p.life < points[0][0] ? points[0] : points.at(-1);
    // Extend the fitted boundary continuously using the positive slope of the
    // existing regression. Do not switch models abruptly at a lookup boundary.
    return Math.max(Math.min(4.50, price), price + fallback(p) - fallback({ ...p, life: capital }));
  }
  root.generalBudgetEstimate = function(model, p, fallback) {
    const curves = budgetLayers(model, p);
    if (!curves.length) return fallback(p);
    const byCi = curves.map(([ci, values]) => [ci, alongLife(values, { ...p, ci }, fallback)]);
    if (!p.ci) return byCi[0][1];
    const fitted = isotonic(byCi);
    const inside = interpolate(fitted, p.ci, 'linear');
    if (inside != null) return inside;
    const [capital, price] = p.ci < fitted[0][0] ? fitted[0] : fitted.at(-1);
    const elasticity = Math.max(0, model.coefficients?.[5] || 0);
    return Math.max(Math.min(4.50, price), price * Math.pow((1 + p.ci) / (1 + capital), elasticity));
  };
  // Only comparable guaranteed, standalone Zurich life bases are eligible.
  // Both endpoints must precede every illustration used to check an age interval.
  root.illustratedAgeEstimate = function(rows, p, asOf = Date.now()) {
    if (p.ci || !p.life || p.waiver === "Yes" || p.age < 25 || p.age > 63) return null;
    const smoker = p.smoker === "smoker" ? "Yes" : "No";
    const recent = rows.filter(row => row.provider === "Zurich" && row.policy_count === "1" &&
      Number(row.discount_monthly) === 0 && row.smoker === smoker && Number(row.to_age) === p.toAge &&
      Number(row.life_cover) === p.life && Number(row.base_monthly) > 0 && Number.isInteger(Number(row.age)) &&
      Date.parse(row.source_date) <= asOf && asOf - Date.parse(row.source_date) <= 180 * 86400000);
    if (recent.some(row => Number(row.age) === p.age)) return null;
    const endpoints = [];
    for (const age of new Set(recent.map(row => Number(row.age)))) {
      if (Math.abs(age - p.age) > 5) continue;
      const atAge = recent.filter(row => Number(row.age) === age);
      const latest = atAge.reduce((d, row) => row.source_date > d ? row.source_date : d, "");
      const sameDay = atAge.filter(row => row.source_date === latest);
      const premiums = new Set(sameDay.map(row => Number(row.base_monthly)));
      if (premiums.size === 1) endpoints.push({age, date: latest, price: Number(sameDay[0].base_monthly)});
    }
    const candidates = [];
    for (const lower of endpoints.filter(point => point.age < p.age)) {
      for (const upper of endpoints.filter(point => point.age > p.age && point.price >= lower.price)) {
        const checks = recent.filter(row => lower.age < Number(row.age) && Number(row.age) < upper.age &&
          row.source_date > lower.date && row.source_date > upper.date);
        if (!checks.length) continue;
        const width = upper.age - lower.age;
        const at = age => lower.price + (upper.price - lower.price) * (age - lower.age) / width;
        const errors = checks.map(row => Math.abs(at(Number(row.age)) - Number(row.base_monthly)));
        if (errors.some((err, n) => err > 1 || err / Number(checks[n].base_monthly) > 0.05)) continue;
        candidates.push({lower, upper, width, price: Math.round(at(p.age) * 100) / 100,
          testedAges: new Set(checks.map(row => row.age)).size, maxError: Math.max(...errors),
          latestCheck: checks.reduce((d, row) => row.source_date > d ? row.source_date : d, "")});
      }
    }
    candidates.sort((a, b) => a.width - b.width || b.testedAges - a.testedAges ||
      b.latestCheck.localeCompare(a.latestCheck) || a.lower.age - b.lower.age);
    return candidates[0] || null;
  };
  root.validateIllustratedAges = function(rows) {
    const eligible = rows.filter(row => row.provider === "Zurich" && row.policy_count === "1" &&
      Number(row.discount_monthly) === 0 && Number(row.base_monthly) > 0);
    const dated = new Map();
    for (const row of eligible) {
      const key = [row.source_date, row.smoker, row.to_age, row.life_cover, row.age].join("|");
      if (!dated.has(key)) dated.set(key, []);
      dated.get(key).push(row);
    }
    const groups = new Map();
    for (const sameDay of dated.values()) {
      if (new Set(sameDay.map(row => Number(row.base_monthly))).size !== 1) continue;
      const row = sameDay[0];
      const earlier = eligible.filter(r => r.source_date < row.source_date);
      const profile = {age: Number(row.age), life: Number(row.life_cover), ci: 0, toAge: Number(row.to_age),
        smoker: row.smoker === "Yes" ? "smoker" : "non_smoker", waiver: "No"};
      const estimate = root.illustratedAgeEstimate(earlier, profile, Date.parse(row.source_date));
      if (!estimate) continue;
      const groupKey = [row.smoker, row.to_age, row.life_cover].join("|");
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      const price = Number(row.base_monthly);
      const error = Math.abs(estimate.price - price);
      groups.get(groupKey).push({date: row.source_date, age: profile.age, error, passed: error <= 1 && error / price <= 0.05});
    }
    return groups;
  };
  // Calibrate the difference between two separate premiums and the same carrier's
  // combined offer. Keep the policy terms, day, profile and products together.
  root.buildIndependentPlans = function(rows) {
    const groups = new Map();
    for (const row of rows) {
      if (row.available !== 'true' || row.occupation_rated !== 'No' || (row.quoted_tpd || 'None') !== 'None' ||
          row.quoted_term !== 'To Age ' + row.to_age || row.quoted_life_cover !== row.life_cover ||
          row.quoted_critical_illness_cover !== row.critical_illness_cover || !(Number(row.monthly_premium) > 0)) continue;
      const key = [row.provider, row.source_date, row.age, row.smoker, row.to_age].join('|');
      if (!groups.has(key)) groups.set(key, new Map());
      const grid = groups.get(key);
      const cell = row.life_cover + '|' + row.critical_illness_cover;
      const current = grid.get(cell);
      if (grid.has(cell) && (!current || current.monthly_premium !== row.monthly_premium || current.product !== row.product)) {
        grid.set(cell, null);
      } else if (!current || Number(row.model_id) < Number(current.model_id)) {
        grid.set(cell, row);
      }
    }
    const penny = row => Math.round(Number(row.monthly_premium) * 100);
    const encloses = (examples, life, ci) => examples.length >= 2 &&
      examples.some(t => t.life <= life) && examples.some(t => t.life >= life) &&
      examples.some(t => t.ci <= ci) && examples.some(t => t.ci >= ci);
    const index = new Map();
    for (const grid of groups.values()) {
      const examples = [];
      for (const combo of grid.values()) {
        if (!combo || !Number(combo.life_cover) || !Number(combo.critical_illness_cover)) continue;
        const a = grid.get(combo.life_cover + '|0'), b = grid.get('0|' + combo.critical_illness_cover);
        if (!a || !b) continue;
        examples.push({life: Number(a.life_cover), ci: Number(b.critical_illness_cover),
          a, b, combo, offset: penny(a) + penny(b) - penny(combo),
          id: Number(combo.model_id), knownAt: Math.max(Number(combo.model_id), Number(a.model_id), Number(b.model_id))});
      }
      if (examples.length < 3) continue;
      const first = examples[0];
      if (first.offset < 0 || examples.some(t => t.offset !== first.offset || t.a.product !== first.a.product ||
          t.b.product !== first.b.product || t.combo.product !== first.combo.product)) continue;
      const checks = examples.filter(t => t.knownAt === t.id && Number(t.a.model_id) < t.id && Number(t.b.model_id) < t.id &&
        encloses(examples.filter(p => p.knownAt < t.id), t.life, t.ci));
      if (!checks.length) continue;
      const lifePlans = [...grid.values()].filter(r => r && r.critical_illness_cover === '0' && r.product === first.a.product);
      const ciPlans = [...grid.values()].filter(r => r && r.life_cover === '0' && r.product === first.b.product);
      for (const a of lifePlans) for (const b of ciPlans) {
        const life = Number(a.life_cover), ci = Number(b.critical_illness_cover);
        if (grid.has(life + '|' + ci) || !encloses(examples, life, ci)) continue;
        const price = (penny(a) + penny(b) - first.offset) / 100;
        if (price <= 0) continue;
        const key = [a.age, a.smoker, a.to_age, life, ci].join('|');
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({provider: a.provider, product: first.combo.product,
          sourceDate: a.source_date, term: a.quoted_term, premium: price,
          baseLife: Number(a.monthly_premium), baseCi: Number(b.monthly_premium), offset: first.offset / 100,
          lifeId: a.model_id, ciId: b.model_id, modelId: a.model_id + ' / ' + b.model_id, tested: checks.length});
      }
    }
    return index;
  };
  root.quoteRange=function(model,main,{outside=false,directLookup=false}={}){
    const spread=directLookup
      ? main*(model?.strictlyValidated?0.2:0.35)
      : Math.max(
          model?.residualQ90||0,
          main*(outside||!model?.strictlyValidated?0.35:0.2),
        );
    return {low:Math.max(0,main-spread),high:main+spread};
  };
})(globalThis);
