import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const csvPaths = [
  join(dataDir, 'solutionbuilder-priority-providers-2026-11-20.csv'),
  join(dataDir, 'solutionbuilder-priority-provider-archive-2026-11-21.csv'),
];
const modelsPath = join(dataDir, 'models.json');
const expectedHeader = 'source_date,model_id,profile,age,sex,smoker,to_age,life_cover,critical_illness_cover,provider,product,monthly_premium,available,notes';
const providers = new Set(['Zurich', 'Legal & General', 'Aviva']);
const expectedProducts = {
  'Legal & General': { life: 'Legal & General Life', ci: 'Legal & General Life + CI (Standard)' },
  Zurich: { life: 'Zurich Life', ci: 'Zurich Life & CI' },
  Aviva: { life: 'Aviva Life Insurance+', ci: 'Aviva Multi-Product with Core CI' },
};
const allowedProfiles = new Set(['Calibration Profile', 'Comparison Report Archive']);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const archiveEvidence = /^Official comparison report ref \d+ sha256 [a-f0-9]{64}$/;

const fileRows = csvPaths.map((csvPath) => {
  const [header, ...lines] = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  if (header !== expectedHeader) throw new Error(`Priority-provider CSV header changed unexpectedly: ${csvPath}`);
  return lines;
});
const columns = expectedHeader.split(',');
const rows = fileRows.flat().map((line) => Object.fromEntries(
  line.split(',').map((value, index) => [columns[index], value]),
));
const failures = [];
const scenarioProviders = new Map();
const uniqueRows = new Set();
const modelScenarios = new Map();

for (const row of rows) {
  const scenario = [row.model_id, row.age, row.sex, row.smoker, row.to_age, row.life_cover, row.critical_illness_cover].join('|');
  const uniqueKey = `${scenario}|${row.provider}`;
  if (uniqueRows.has(uniqueKey)) failures.push({ duplicate: uniqueKey });
  uniqueRows.add(uniqueKey);
  if (!providers.has(row.provider)) failures.push({ unexpectedProvider: row.provider });
  if (!allowedProfiles.has(row.profile)) failures.push({ unexpectedProfile: row.profile, modelId: row.model_id });
  if (!isoDate.test(row.source_date) || !Number.isFinite(Date.parse(`${row.source_date}T00:00:00Z`))) {
    failures.push({ invalidSourceDate: row.source_date, modelId: row.model_id });
  }
  if (!['F', 'M'].includes(row.sex)) failures.push({ invalidSex: row.sex, modelId: row.model_id });
  if (!['No', 'Yes'].includes(row.smoker)) failures.push({ invalidSmoker: row.smoker, modelId: row.model_id });
  if (row.available !== 'true') failures.push({ unavailableRow: uniqueKey });
  if (!Number.isFinite(Number(row.monthly_premium)) || Number(row.monthly_premium) <= 0) {
    failures.push({ invalidPremium: uniqueKey, value: row.monthly_premium });
  }
  if (!/^\d+$/.test(row.model_id)) failures.push({ invalidModelId: row.model_id });
  const age = Number(row.age);
  const toAge = Number(row.to_age);
  const lifeCover = Number(row.life_cover);
  const ciCover = Number(row.critical_illness_cover);
  if (!Number.isInteger(age) || age < 18 || age > 85) failures.push({ invalidAge: row.age, modelId: row.model_id });
  if (!Number.isInteger(toAge) || toAge <= age || toAge > 90) failures.push({ invalidToAge: row.to_age, modelId: row.model_id });
  if (!Number.isFinite(lifeCover) || lifeCover <= 0) failures.push({ invalidLifeCover: row.life_cover, modelId: row.model_id });
  if (!Number.isFinite(ciCover) || ciCover < 0) failures.push({ invalidCriticalIllnessCover: row.critical_illness_cover, modelId: row.model_id });
  const expectedProduct = expectedProducts[row.provider]?.[ciCover > 0 ? 'ci' : 'life'];
  if (expectedProduct && row.product !== expectedProduct) {
    failures.push({ unexpectedProduct: row.product, expectedProduct, modelId: row.model_id });
  }
  if (row.profile === 'Comparison Report Archive' && !archiveEvidence.test(row.notes)) {
    failures.push({ missingArchiveEvidence: row.model_id, notes: row.notes });
  }
  if (row.profile === 'Calibration Profile' && !row.notes.trim()) {
    failures.push({ missingCaptureEvidence: row.model_id });
  }
  const existingScenario = modelScenarios.get(row.model_id);
  const parameters = [row.age, row.sex, row.smoker, row.to_age, row.life_cover, row.critical_illness_cover].join('|');
  if (existingScenario && existingScenario !== parameters) {
    failures.push({ modelIdReusedAcrossScenarios: row.model_id, existingScenario, parameters });
  }
  modelScenarios.set(row.model_id, parameters);
  const found = scenarioProviders.get(scenario) ?? new Set();
  found.add(row.provider);
  scenarioProviders.set(scenario, found);
}

for (const [scenario, found] of scenarioProviders) {
  if (found.size !== providers.size || [...providers].some((provider) => !found.has(provider))) {
    failures.push({ incompleteScenario: scenario, providers: [...found] });
  }
}

const catalog = JSON.parse(readFileSync(modelsPath, 'utf8'));
if (catalog.audit?.priorityProviderPrices !== rows.length) {
  failures.push({ auditPrices: catalog.audit?.priorityProviderPrices, csvPrices: rows.length });
}
if (catalog.audit?.priorityProviderScenarios !== scenarioProviders.size) {
  failures.push({ auditScenarios: catalog.audit?.priorityProviderScenarios, csvScenarios: scenarioProviders.size });
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Priority-provider validation passed: ${scenarioProviders.size} scenarios, ${rows.length} official prices.`);
