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

const modelsJson = readFileSync(modelsPath, 'utf8');
const catalog = JSON.parse(modelsJson);
const model = catalog.models?.['life_plus_standalone_ci:standard_core_ci'];

if (!model?.lookup) {
  throw new Error('Combined life + critical illness lookup is missing.');
}

const failures = [];

// JSON.parse silently keeps the last value when an object repeats a key. Since
// each lookup key represents one exact insurance scenario, reject duplicate
// keys before parsing can hide an accidental overwrite.
for (const match of modelsJson.matchAll(/"lookup"\s*:\s*\{/g)) {
  const open = modelsJson.indexOf('{', match.index);
  let depth = 0;
  let inString = false;
  let escaped = false;
  let close = -1;
  for (let index = open; index < modelsJson.length; index += 1) {
    const character = modelsJson[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) {
      close = index;
      break;
    }
  }
  if (close < 0) {
    failures.push({ issue: 'unterminated lookup object', offset: open });
    continue;
  }
  const keys = [...modelsJson.slice(open + 1, close).matchAll(/^\s*"([^"]+)"\s*:/gm)]
    .map((keyMatch) => keyMatch[1]);
  const seen = new Set();
  const duplicates = [...new Set(keys.filter((key) => seen.has(key) || !seen.add(key)))];
  if (duplicates.length) failures.push({ issue: 'duplicate lookup keys', duplicates });
}

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

if (catalog.calibratedRecords !== 1384 || model.records !== 521 || catalog.models?.life_only?.records !== 815) {
  failures.push({
    expectedCounts: { calibratedRecords: 1384, lifeRecords: 815, combinedRecords: 521 },
    actualCounts: {
      calibratedRecords: catalog.calibratedRecords,
      lifeRecords: catalog.models?.life_only?.records,
      combinedRecords: model.records,
    },
  });
}

const hashes = illustrationRows.map((row) => row.sha256);
const illustrationFingerprints = illustrationRows.map((row) => [
  row.sha256,
  row.provider,
  row.product,
  row.to_age,
  row.life_component,
  row.critical_illness_component,
  row.total_monthly,
].join('|'));
if (
  illustrationRows.length !== 469
  || new Set(hashes).size !== 375
  || new Set(illustrationFingerprints).size !== illustrationRows.length
  || hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))
  || catalog.audit?.illustrationValidationRecords !== 469
) {
  failures.push({
    expectedIllustrationValidation: { rows: 469, uniqueDocuments: 375, uniqueRecords: 469, auditCount: 469 },
    actualIllustrationValidation: {
      rows: illustrationRows.length,
      uniqueDocuments: new Set(hashes).size,
      uniqueRecords: new Set(illustrationFingerprints).size,
      auditCount: catalog.audit?.illustrationValidationRecords,
    },
  });
}

for (const row of illustrationRows) {
  const term = Number(row.term_years);
  const expectedTerm = Number(row.to_age) - Number(row.age);
  const total = Number(row.total_monthly);
  const components =
    Number(row.base_life_monthly)
    + Number(row.base_ci_monthly)
    + Number(row.optional_monthly);
  const validTerms = new Set([expectedTerm, expectedTerm - 1]);
  if (!Number.isFinite(term) || !validTerms.has(term)) {
    failures.push({
      illustrationHash: row.sha256,
      issue: 'term does not reconcile with current-age or age-next-birthday basis',
      term,
      acceptedTerms: [...validTerms],
    });
  }
  if (!Number.isFinite(total) || !Number.isFinite(components) || Math.abs(total - components) > 0.011) {
    failures.push({
      illustrationHash: row.sha256,
      issue: 'premium components do not reconcile with total',
      total,
      components,
    });
  }
}

const historyRecordIds = historyRows.map((row) => row.record_id);
const uniqueHistoryRows = historyRows.filter((row) => !row.logical_duplicate_of);
if (
  historyRows.length !== 171
  || uniqueHistoryRows.length !== 170
  || new Set(historyRecordIds).size !== 171
  || catalog.audit?.solutionBuilderHistoryValidationRecords !== 171
  || catalog.audit?.solutionBuilderHistoryUniqueRecords !== 170
) {
  failures.push({
    expectedHistoryValidation: { rows: 171, uniqueRows: 170, uniqueRecordIds: 171 },
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
  { key: '49|65|10000|10000|0', expected: 9.89, actual: model.lookup['49|65|10000|10000|0'] },
  { key: '56|70|50000|0|0', expected: 17.29, actual: lifeModel?.lookup?.['56|70|50000|0|0'] },
  { key: '38|65|100000|0|0', expected: 9.26, actual: lifeModel?.lookup?.['38|65|100000|0|0'] },
  { key: '36|65|100000|0|0', expected: 8.44, actual: lifeModel?.lookup?.['36|65|100000|0|0'] },
  { key: '61|85|80000|0|0', expected: 59.77, actual: lifeModel?.lookup?.['61|85|80000|0|0'] },
  { key: '46|65|500000|0|0', expected: 49.28, actual: lifeModel?.lookup?.['46|65|500000|0|0'] },
  { key: '32|65|160000|10000|0', expected: 14.07, actual: model.lookup['32|65|160000|10000|0'] },
  { key: '41|64|90000|10000|0', expected: 16.42, actual: model.lookup['41|64|90000|10000|0'] },
  { key: '56|70|60000|10000|0', expected: 35.77, actual: model.lookup['56|70|60000|10000|0'] },
  { key: '41|65|100000|0|0', expected: 10.90, actual: lifeModel?.lookup?.['41|65|100000|0|0'] },
  { key: '54|64|50000|0|0', expected: 13.01, actual: lifeModel?.lookup?.['54|64|50000|0|0'] },
  { key: '54|65|50000|0|0', expected: 15.12, actual: lifeModel?.lookup?.['54|65|50000|0|0'] },
  { key: '47|69|80000|0|0', expected: 14.13, actual: lifeModel?.lookup?.['47|69|80000|0|0'] },
  { key: '47|69|100000|0|0', expected: 17.16, actual: lifeModel?.lookup?.['47|69|100000|0|0'] },
  { key: '47|70|70000|0|0', expected: 13.27, actual: lifeModel?.lookup?.['47|70|70000|0|0'] },
  { key: '34|65|70000|20000|0', expected: 14.69, actual: model.lookup['34|65|70000|20000|0'] },
  { key: '34|65|50000|10000|0', expected: 7.32, actual: model.lookup['34|65|50000|10000|0'] },
  { key: '54|65|100000|0|0', expected: 19.59, actual: lifeModel?.lookup?.['54|65|100000|0|0'] },
  { key: '51|75|50000|10000|0', expected: 21.36, actual: model.lookup['51|75|50000|10000|0'] },
  { key: '51|75|100000|0|0', expected: 20.24, actual: lifeModel?.lookup?.['51|75|100000|0|0'] },
  { key: '32|65|100000|0|0', expected: 7.13, actual: lifeModel?.lookup?.['32|65|100000|0|0'] },
  { key: '42|65|100000|0|0', expected: 11.55, actual: lifeModel?.lookup?.['42|65|100000|0|0'] },
  { key: '49|65|50000|0|0', expected: 10.05, actual: lifeModel?.lookup?.['49|65|50000|0|0'] },
  { key: '50|70|20000|0|0', expected: 5.65, actual: lifeModel?.lookup?.['50|70|20000|0|0'] },
  { key: '50|70|30000|0|0', expected: 7.50, actual: lifeModel?.lookup?.['50|70|30000|0|0'] },
  { key: '50|70|50000|0|0', expected: 10.08, actual: lifeModel?.lookup?.['50|70|50000|0|0'] },
  { key: '50|70|100000|0|0', expected: 17.84, actual: lifeModel?.lookup?.['50|70|100000|0|0'] },
  { key: '45|65|20000|0|0', expected: 5.00, actual: lifeModel?.lookup?.['45|65|20000|0|0'] },
  { key: '45|65|30000|0|0', expected: 5.43, actual: lifeModel?.lookup?.['45|65|30000|0|0'] },
  { key: '45|65|50000|0|0', expected: 6.38, actual: lifeModel?.lookup?.['45|65|50000|0|0'] },
  { key: '45|65|100000|0|0', expected: 10.65, actual: lifeModel?.lookup?.['45|65|100000|0|0'] },
  { key: '45|70|20000|0|0', expected: 5.00, actual: lifeModel?.lookup?.['45|70|20000|0|0'] },
  { key: '45|70|30000|0|0', expected: 6.00, actual: lifeModel?.lookup?.['45|70|30000|0|0'] },
  { key: '45|70|50000|0|0', expected: 6.83, actual: lifeModel?.lookup?.['45|70|50000|0|0'] },
  { key: '45|70|100000|0|0', expected: 11.97, actual: lifeModel?.lookup?.['45|70|100000|0|0'] },
  { key: '45|75|20000|0|0', expected: 5.12, actual: lifeModel?.lookup?.['45|75|20000|0|0'] },
  { key: '45|75|30000|0|0', expected: 6.38, actual: lifeModel?.lookup?.['45|75|30000|0|0'] },
  { key: '45|75|50000|0|0', expected: 7.46, actual: lifeModel?.lookup?.['45|75|50000|0|0'] },
  { key: '45|75|100000|0|0', expected: 12.11, actual: lifeModel?.lookup?.['45|75|100000|0|0'] },
  { key: '45|85|20000|0|0', expected: 5.29, actual: lifeModel?.lookup?.['45|85|20000|0|0'] },
  { key: '45|85|30000|0|0', expected: 6.86, actual: lifeModel?.lookup?.['45|85|30000|0|0'] },
  { key: '45|85|50000|0|0', expected: 8.07, actual: lifeModel?.lookup?.['45|85|50000|0|0'] },
  { key: '45|85|100000|0|0', expected: 14.61, actual: lifeModel?.lookup?.['45|85|100000|0|0'] },
  { key: '55|65|20000|0|0', expected: 6.60, actual: lifeModel?.lookup?.['55|65|20000|0|0'] },
  { key: '55|65|30000|0|0', expected: 8.48, actual: lifeModel?.lookup?.['55|65|30000|0|0'] },
  { key: '55|65|50000|0|0', expected: 12.69, actual: lifeModel?.lookup?.['55|65|50000|0|0'] },
  { key: '55|65|100000|0|0', expected: 20.57, actual: lifeModel?.lookup?.['55|65|100000|0|0'] },
  { key: '55|70|20000|0|0', expected: 6.61, actual: lifeModel?.lookup?.['55|70|20000|0|0'] },
  { key: '55|70|30000|0|0', expected: 9.56, actual: lifeModel?.lookup?.['55|70|30000|0|0'] },
  { key: '55|70|50000|0|0', expected: 14.60, actual: lifeModel?.lookup?.['55|70|50000|0|0'] },
  { key: '55|70|100000|0|0', expected: 25.01, actual: lifeModel?.lookup?.['55|70|100000|0|0'] },
  { key: '55|75|20000|0|0', expected: 7.62, actual: lifeModel?.lookup?.['55|75|20000|0|0'] },
  { key: '55|75|30000|0|0', expected: 10.97, actual: lifeModel?.lookup?.['55|75|30000|0|0'] },
  { key: '55|75|50000|0|0', expected: 15.97, actual: lifeModel?.lookup?.['55|75|50000|0|0'] },
  { key: '55|75|100000|0|0', expected: 27.49, actual: lifeModel?.lookup?.['55|75|100000|0|0'] },
  { key: '55|85|20000|0|0', expected: 9.13, actual: lifeModel?.lookup?.['55|85|20000|0|0'] },
  { key: '55|85|30000|0|0', expected: 12.84, actual: lifeModel?.lookup?.['55|85|30000|0|0'] },
  { key: '55|85|50000|0|0', expected: 18.65, actual: lifeModel?.lookup?.['55|85|50000|0|0'] },
  { key: '55|85|100000|0|0', expected: 32.88, actual: lifeModel?.lookup?.['55|85|100000|0|0'] },
  { key: '60|65|20000|0|0', expected: 7.59, actual: lifeModel?.lookup?.['60|65|20000|0|0'] },
  { key: '60|65|30000|0|0', expected: 10.07, actual: lifeModel?.lookup?.['60|65|30000|0|0'] },
  { key: '60|65|50000|0|0', expected: 14.57, actual: lifeModel?.lookup?.['60|65|50000|0|0'] },
  { key: '60|65|100000|0|0', expected: 26.12, actual: lifeModel?.lookup?.['60|65|100000|0|0'] },
  { key: '60|70|20000|0|0', expected: 9.62, actual: lifeModel?.lookup?.['60|70|20000|0|0'] },
  { key: '60|70|30000|0|0', expected: 13.05, actual: lifeModel?.lookup?.['60|70|30000|0|0'] },
  { key: '60|70|50000|0|0', expected: 20.00, actual: lifeModel?.lookup?.['60|70|50000|0|0'] },
  { key: '60|70|100000|0|0', expected: 34.40, actual: lifeModel?.lookup?.['60|70|100000|0|0'] },
  { key: '60|75|20000|0|0', expected: 14.81, actual: lifeModel?.lookup?.['60|75|20000|0|0'] },
  { key: '60|75|30000|0|0', expected: 14.82, actual: lifeModel?.lookup?.['60|75|30000|0|0'] },
  { key: '60|75|50000|0|0', expected: 23.37, actual: lifeModel?.lookup?.['60|75|50000|0|0'] },
  { key: '60|75|100000|0|0', expected: 40.24, actual: lifeModel?.lookup?.['60|75|100000|0|0'] },
  { key: '60|85|20000|0|0', expected: 14.53, actual: lifeModel?.lookup?.['60|85|20000|0|0'] },
  { key: '60|85|30000|0|0', expected: 20.58, actual: lifeModel?.lookup?.['60|85|30000|0|0'] },
  { key: '60|85|50000|0|0', expected: 30.26, actual: lifeModel?.lookup?.['60|85|50000|0|0'] },
  { key: '60|85|100000|0|0', expected: 57.74, actual: lifeModel?.lookup?.['60|85|100000|0|0'] },
  { key: '60|70|50000|10000|0', expected: 33.55, actual: model.lookup['60|70|50000|10000|0'] },
  { key: '60|70|100000|10000|0', expected: 51.82, actual: model.lookup['60|70|100000|10000|0'] },
  { key: '60|70|50000|20000|0', expected: 52.11, actual: model.lookup['60|70|50000|20000|0'] },
  { key: '60|70|100000|20000|0', expected: 64.13, actual: model.lookup['60|70|100000|20000|0'] },
  { key: '60|65|50000|10000|0', expected: 33.63, actual: model.lookup['60|65|50000|10000|0'] },
  { key: '60|65|100000|10000|0', expected: 43.69, actual: model.lookup['60|65|100000|10000|0'] },
  { key: '60|65|50000|20000|0', expected: 48.48, actual: model.lookup['60|65|50000|20000|0'] },
  { key: '60|65|100000|20000|0', expected: 59.59, actual: model.lookup['60|65|100000|20000|0'] },
  { key: '60|75|50000|10000|0', expected: 40.63, actual: model.lookup['60|75|50000|10000|0'] },
  { key: '60|75|100000|10000|0', expected: 60.76, actual: model.lookup['60|75|100000|10000|0'] },
  { key: '60|75|50000|20000|0', expected: 62.91, actual: model.lookup['60|75|50000|20000|0'] },
  { key: '60|75|100000|20000|0', expected: 77.04, actual: model.lookup['60|75|100000|20000|0'] },
  { key: '60|85|50000|10000|0', expected: 77.61, actual: model.lookup['60|85|50000|10000|0'] },
  { key: '60|85|100000|10000|0', expected: 109.98, actual: model.lookup['60|85|100000|10000|0'] },
  { key: '60|85|50000|20000|0', expected: 110.60, actual: model.lookup['60|85|50000|20000|0'] },
  { key: '60|85|100000|20000|0', expected: 142.97, actual: model.lookup['60|85|100000|20000|0'] },
  { key: '45|65|50000|10000|0', expected: 13.60, actual: model.lookup['45|65|50000|10000|0'] },
  { key: '45|70|50000|10000|0', expected: 14.33, actual: model.lookup['45|70|50000|10000|0'] },
  { key: '45|75|50000|10000|0', expected: 16.41, actual: model.lookup['45|75|50000|10000|0'] },
  { key: '45|85|50000|10000|0', expected: 31.18, actual: model.lookup['45|85|50000|10000|0'] },
  { key: '45|70|100000|10000|0', expected: 19.17, actual: model.lookup['45|70|100000|10000|0'] },
  { key: '45|70|50000|20000|0', expected: 20.99, actual: model.lookup['45|70|50000|20000|0'] },
  { key: '45|70|100000|20000|0', expected: 25.98, actual: model.lookup['45|70|100000|20000|0'] },
  { key: '45|65|100000|10000|0', expected: 17.57, actual: model.lookup['45|65|100000|10000|0'] },
  { key: '45|75|100000|10000|0', expected: 20.76, actual: model.lookup['45|75|100000|10000|0'] },
  { key: '45|85|100000|10000|0', expected: 43.63, actual: model.lookup['45|85|100000|10000|0'] },
  { key: '45|65|50000|20000|0', expected: 19.85, actual: model.lookup['45|65|50000|20000|0'] },
  { key: '45|75|50000|20000|0', expected: 23.62, actual: model.lookup['45|75|50000|20000|0'] },
  { key: '45|85|50000|20000|0', expected: 44.23, actual: model.lookup['45|85|50000|20000|0'] },
  { key: '45|65|100000|20000|0', expected: 23.97, actual: model.lookup['45|65|100000|20000|0'] },
  { key: '45|75|100000|20000|0', expected: 27.87, actual: model.lookup['45|75|100000|20000|0'] },
  { key: '45|85|100000|20000|0', expected: 56.68, actual: model.lookup['45|85|100000|20000|0'] },
  { key: '45|70|20000|10000|0', expected: 12.38, actual: model.lookup['45|70|20000|10000|0'] },
  { key: '45|70|30000|10000|0', expected: 13.73, actual: model.lookup['45|70|30000|10000|0'] },
  { key: '45|70|20000|20000|0', expected: 19.04, actual: model.lookup['45|70|20000|20000|0'] },
  { key: '45|70|30000|20000|0', expected: 20.39, actual: model.lookup['45|70|30000|20000|0'] },
  { key: '45|65|20000|10000|0', expected: 11.45, actual: model.lookup['45|65|20000|10000|0'] },
  { key: '45|75|20000|10000|0', expected: 14.07, actual: model.lookup['45|75|20000|10000|0'] },
  { key: '45|85|20000|10000|0', expected: 22.40, actual: model.lookup['45|85|20000|10000|0'] },
  { key: '45|65|30000|10000|0', expected: 12.72, actual: model.lookup['45|65|30000|10000|0'] },
  { key: '45|75|30000|10000|0', expected: 15.53, actual: model.lookup['45|75|30000|10000|0'] },
  { key: '45|85|30000|10000|0', expected: 25.44, actual: model.lookup['45|85|30000|10000|0'] },
  { key: '45|65|20000|20000|0', expected: 17.70, actual: model.lookup['45|65|20000|20000|0'] },
  { key: '45|75|20000|20000|0', expected: 21.28, actual: model.lookup['45|75|20000|20000|0'] },
  { key: '45|85|20000|20000|0', expected: 35.45, actual: model.lookup['45|85|20000|20000|0'] },
  { key: '45|65|30000|20000|0', expected: 18.97, actual: model.lookup['45|65|30000|20000|0'] },
  { key: '45|75|30000|20000|0', expected: 22.74, actual: model.lookup['45|75|30000|20000|0'] },
  { key: '45|85|30000|20000|0', expected: 38.49, actual: model.lookup['45|85|30000|20000|0'] },
  { key: '45|70|150000|0|0', expected: 17.15, actual: lifeModel?.lookup?.['45|70|150000|0|0'] },
  { key: '45|70|200000|0|0', expected: 21.78, actual: lifeModel?.lookup?.['45|70|200000|0|0'] },
  { key: '45|70|250000|0|0', expected: 25.82, actual: lifeModel?.lookup?.['45|70|250000|0|0'] },
  { key: '45|70|150000|10000|0', expected: 24.10, actual: model.lookup['45|70|150000|10000|0'] },
  { key: '45|70|200000|10000|0', expected: 28.73, actual: model.lookup['45|70|200000|10000|0'] },
  { key: '45|70|250000|10000|0', expected: 32.27, actual: model.lookup['45|70|250000|10000|0'] },
  { key: '45|70|150000|20000|0', expected: 30.91, actual: model.lookup['45|70|150000|20000|0'] },
  { key: '45|65|150000|20000|0', expected: 28.34, actual: model.lookup['45|65|150000|20000|0'] },
  { key: '45|75|150000|20000|0', expected: 33.33, actual: model.lookup['45|75|150000|20000|0'] },
  { key: '45|85|150000|20000|0', expected: 64.93, actual: model.lookup['45|85|150000|20000|0'] },
  { key: '45|70|200000|20000|0', expected: 35.54, actual: model.lookup['45|70|200000|20000|0'] },
  { key: '45|65|200000|20000|0', expected: 32.47, actual: model.lookup['45|65|200000|20000|0'] },
  { key: '45|75|200000|20000|0', expected: 38.79, actual: model.lookup['45|75|200000|20000|0'] },
  { key: '45|85|200000|20000|0', expected: 75.58, actual: model.lookup['45|85|200000|20000|0'] },
  { key: '45|70|250000|20000|0', expected: 38.83, actual: model.lookup['45|70|250000|20000|0'] },
  { key: '45|65|250000|20000|0', expected: 35.36, actual: model.lookup['45|65|250000|20000|0'] },
  { key: '45|75|250000|20000|0', expected: 42.99, actual: model.lookup['45|75|250000|20000|0'] },
  { key: '45|85|250000|20000|0', expected: 85.59, actual: model.lookup['45|85|250000|20000|0'] },
  { key: '45|65|50000|30000|0', expected: 25.01, actual: model.lookup['45|65|50000|30000|0'] },
  { key: '45|70|50000|30000|0', expected: 27.59, actual: model.lookup['45|70|50000|30000|0'] },
  { key: '45|75|50000|30000|0', expected: 30.46, actual: model.lookup['45|75|50000|30000|0'] },
  { key: '45|85|50000|30000|0', expected: 57.61, actual: model.lookup['45|85|50000|30000|0'] },
  { key: '45|65|100000|30000|0', expected: 28.88, actual: model.lookup['45|65|100000|30000|0'] },
  { key: '45|70|100000|30000|0', expected: 32.33, actual: model.lookup['45|70|100000|30000|0'] },
  { key: '45|75|100000|30000|0', expected: 34.71, actual: model.lookup['45|75|100000|30000|0'] },
  { key: '45|85|100000|30000|0', expected: 70.06, actual: model.lookup['45|85|100000|30000|0'] },
  { key: '45|65|150000|30000|0', expected: 33.25, actual: model.lookup['45|65|150000|30000|0'] },
  { key: '45|70|150000|30000|0', expected: 37.26, actual: model.lookup['45|70|150000|30000|0'] },
  { key: '45|75|150000|30000|0', expected: 40.17, actual: model.lookup['45|75|150000|30000|0'] },
  { key: '45|85|150000|30000|0', expected: 78.31, actual: model.lookup['45|85|150000|30000|0'] },
  { key: '45|65|200000|30000|0', expected: 37.38, actual: model.lookup['45|65|200000|30000|0'] },
  { key: '45|70|200000|30000|0', expected: 41.89, actual: model.lookup['45|70|200000|30000|0'] },
  { key: '45|75|200000|30000|0', expected: 51.13, actual: model.lookup['45|75|200000|30000|0'] },
  { key: '45|85|200000|30000|0', expected: 88.96, actual: model.lookup['45|85|200000|30000|0'] },
  { key: '45|65|250000|30000|0', expected: 40.27, actual: model.lookup['45|65|250000|30000|0'] },
  { key: '45|70|250000|30000|0', expected: 50.68, actual: model.lookup['45|70|250000|30000|0'] },
  { key: '45|75|250000|30000|0', expected: 55.08, actual: model.lookup['45|75|250000|30000|0'] },
  { key: '45|85|250000|30000|0', expected: 98.97, actual: model.lookup['45|85|250000|30000|0'] },
  { key: '45|65|150000|0|0', expected: 15.27, actual: lifeModel?.lookup?.['45|65|150000|0|0'] },
  { key: '45|75|150000|0|0', expected: 17.82, actual: lifeModel?.lookup?.['45|75|150000|0|0'] },
  { key: '45|85|150000|0|0', expected: 21.17, actual: lifeModel?.lookup?.['45|85|150000|0|0'] },
  { key: '45|65|200000|0|0', expected: 19.40, actual: lifeModel?.lookup?.['45|65|200000|0|0'] },
  { key: '45|75|200000|0|0', expected: 23.28, actual: lifeModel?.lookup?.['45|75|200000|0|0'] },
  { key: '45|85|200000|0|0', expected: 27.21, actual: lifeModel?.lookup?.['45|85|200000|0|0'] },
  { key: '45|65|250000|0|0', expected: 23.04, actual: lifeModel?.lookup?.['45|65|250000|0|0'] },
  { key: '45|75|250000|0|0', expected: 28.48, actual: lifeModel?.lookup?.['45|75|250000|0|0'] },
  { key: '45|85|250000|0|0', expected: 32.74, actual: lifeModel?.lookup?.['45|85|250000|0|0'] },
  { key: '45|65|150000|10000|0', expected: 21.94, actual: model.lookup['45|65|150000|10000|0'] },
  { key: '45|75|150000|10000|0', expected: 26.22, actual: model.lookup['45|75|150000|10000|0'] },
  { key: '45|85|150000|10000|0', expected: 51.88, actual: model.lookup['45|85|150000|10000|0'] },
  { key: '45|65|200000|10000|0', expected: 26.07, actual: model.lookup['45|65|200000|10000|0'] },
  { key: '45|75|200000|10000|0', expected: 31.68, actual: model.lookup['45|75|200000|10000|0'] },
  { key: '45|85|200000|10000|0', expected: 62.53, actual: model.lookup['45|85|200000|10000|0'] },
  { key: '45|65|250000|10000|0', expected: 29.21, actual: model.lookup['45|65|250000|10000|0'] },
  { key: '45|75|250000|10000|0', expected: 36.13, actual: model.lookup['45|75|250000|10000|0'] },
  { key: '45|85|250000|10000|0', expected: 72.94, actual: model.lookup['45|85|250000|10000|0'] },
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
