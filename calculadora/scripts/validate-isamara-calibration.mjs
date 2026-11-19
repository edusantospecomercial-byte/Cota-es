import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const csvPath = join(dataDir, 'solutionbuilder-isamara-fumante-vida-ci-2026-11-19.csv');
const illustrationPath = join(dataDir, 'illustration-validation-2026-11-19.csv');
const modelsPath = join(dataDir, 'models.json');

const [header, ...lines] = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const columns = header.split(',');
const rows = lines.map((line) => Object.fromEntries(
  line.split(',').map((value, index) => [columns[index], value]),
));

const [illustrationHeader, ...illustrationLines] = readFileSync(illustrationPath, 'utf8').trim().split(/\r?\n/);
const illustrationColumns = illustrationHeader.split(',');
const illustrationRows = illustrationLines.map((line) => Object.fromEntries(
  line.split(',').map((value, index) => [illustrationColumns[index], value]),
));

const catalog = JSON.parse(readFileSync(modelsPath, 'utf8'));
const model = catalog.models?.['life_plus_standalone_ci:standard_core_ci'];

if (!model?.lookup) {
  throw new Error('Combined life + critical illness lookup is missing.');
}

const failures = [];

for (const row of rows) {
  const smoker = row.smoker === 'true' ? 1 : 0;
  const key = `${row.age}|${row.to_age}|${row.life_cover}|${row.critical_illness_cover}|${smoker}`;
  const expected = Number(row.minimum_monthly);
  const actual = model.lookup[key];

  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.0001) {
    failures.push({ key, expected, actual: actual ?? null });
  }
}

if (rows.length !== 11) {
  failures.push({ expectedRows: 11, actualRows: rows.length });
}

if (catalog.calibratedRecords !== 1224 || model.records !== 427) {
  failures.push({
    expectedCounts: { calibratedRecords: 1224, combinedRecords: 427 },
    actualCounts: {
      calibratedRecords: catalog.calibratedRecords,
      combinedRecords: model.records,
    },
  });
}

const hashes = illustrationRows.map((row) => row.sha256);
if (
  illustrationRows.length !== 7
  || new Set(hashes).size !== 7
  || hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))
  || catalog.audit?.illustrationValidationRecords !== 7
) {
  failures.push({
    expectedIllustrationValidation: { rows: 7, uniqueHashes: 7, auditCount: 7 },
    actualIllustrationValidation: {
      rows: illustrationRows.length,
      uniqueHashes: new Set(hashes).size,
      auditCount: catalog.audit?.illustrationValidationRecords,
    },
  });
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  profile: 'Isamara Cotacao',
  exactAnchorsChecked: rows.length,
  illustrationValidationRecords: illustrationRows.length,
  calibratedRecords: catalog.calibratedRecords,
  combinedRecords: model.records,
}, null, 2));
