import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const csvPath = join(dataDir, 'solutionbuilder-isamara-fumante-vida-ci-2026-11-19.csv');
const illustrationPath = join(dataDir, 'illustration-validation-2026-11-19.csv');
const historyPath = join(dataDir, 'solutionbuilder-history-validation-2026-11-19.csv');
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

const [historyHeader, ...historyLines] = readFileSync(historyPath, 'utf8').trim().split(/\r?\n/);
const historyColumns = historyHeader.split(',');
const historyRows = historyLines.map((line) => Object.fromEntries(
  line.split(',').map((value, index) => [historyColumns[index], value]),
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

if (catalog.calibratedRecords !== 1228 || model.records !== 429 || catalog.models?.life_only?.records !== 751) {
  failures.push({
    expectedCounts: { calibratedRecords: 1228, lifeRecords: 751, combinedRecords: 429 },
    actualCounts: {
      calibratedRecords: catalog.calibratedRecords,
      lifeRecords: catalog.models?.life_only?.records,
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

const historyRecordIds = historyRows.map((row) => row.record_id);
const uniqueHistoryRows = historyRows.filter((row) => !row.logical_duplicate_of);
if (
  historyRows.length !== 15
  || uniqueHistoryRows.length !== 14
  || new Set(historyRecordIds).size !== 15
  || catalog.audit?.solutionBuilderHistoryValidationRecords !== 15
  || catalog.audit?.solutionBuilderHistoryUniqueRecords !== 14
) {
  failures.push({
    expectedHistoryValidation: { rows: 15, uniqueRows: 14, uniqueRecordIds: 15 },
    actualHistoryValidation: {
      rows: historyRows.length,
      uniqueRows: uniqueHistoryRows.length,
      uniqueRecordIds: new Set(historyRecordIds).size,
      auditRows: catalog.audit?.solutionBuilderHistoryValidationRecords,
      auditUniqueRows: catalog.audit?.solutionBuilderHistoryUniqueRecords,
    },
  });
}

const lifeModel = catalog.models?.life_only;
const exactHistoryAnchors = [
  { key: '34|65|50000|10000|0', expected: 7.32, actual: model.lookup['34|65|50000|10000|0'] },
  { key: '54|65|100000|0|0', expected: 19.59, actual: lifeModel?.lookup?.['54|65|100000|0|0'] },
  { key: '51|75|50000|10000|0', expected: 21.36, actual: model.lookup['51|75|50000|10000|0'] },
  { key: '51|75|100000|0|0', expected: 20.24, actual: lifeModel?.lookup?.['51|75|100000|0|0'] },
  { key: '50|70|20000|0|0', expected: 5.65, actual: lifeModel?.lookup?.['50|70|20000|0|0'] },
  { key: '50|70|30000|0|0', expected: 7.50, actual: lifeModel?.lookup?.['50|70|30000|0|0'] },
  { key: '50|70|50000|0|0', expected: 10.08, actual: lifeModel?.lookup?.['50|70|50000|0|0'] },
  { key: '50|70|100000|0|0', expected: 17.84, actual: lifeModel?.lookup?.['50|70|100000|0|0'] },
];
for (const anchor of exactHistoryAnchors) {
  if (!Number.isFinite(anchor.actual) || Math.abs(anchor.actual - anchor.expected) > 0.0001) {
    failures.push(anchor);
  }
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
  solutionBuilderHistoryValidationRecords: historyRows.length,
  solutionBuilderHistoryUniqueRecords: uniqueHistoryRows.length,
  exactHistoryAnchors: exactHistoryAnchors.length,
  calibratedRecords: catalog.calibratedRecords,
  lifeRecords: lifeModel.records,
  combinedRecords: model.records,
}, null, 2));
