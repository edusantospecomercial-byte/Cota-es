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

for (const row of rows) {
  const scenario = [row.model_id, row.age, row.sex, row.smoker, row.to_age, row.life_cover, row.critical_illness_cover].join('|');
  const uniqueKey = `${scenario}|${row.provider}`;
  if (uniqueRows.has(uniqueKey)) failures.push({ duplicate: uniqueKey });
  uniqueRows.add(uniqueKey);
  if (!providers.has(row.provider)) failures.push({ unexpectedProvider: row.provider });
  if (row.available !== 'true') failures.push({ unavailableRow: uniqueKey });
  if (!Number.isFinite(Number(row.monthly_premium)) || Number(row.monthly_premium) <= 0) {
    failures.push({ invalidPremium: uniqueKey, value: row.monthly_premium });
  }
  if (!/^\d+$/.test(row.model_id)) failures.push({ invalidModelId: row.model_id });
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
