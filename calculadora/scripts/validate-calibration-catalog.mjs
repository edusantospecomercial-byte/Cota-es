import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const csvPath = join(dataDir, 'solutionbuilder-profile-b-fumante-vida-ci-2026-11-19.csv');
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

if (catalog.calibratedRecords !== 1394 || model.records !== 522 || catalog.models?.life_only?.records !== 824) {
  failures.push({
    expectedCounts: { calibratedRecords: 1394, lifeRecords: 824, combinedRecords: 522 },
    actualCounts: {
      calibratedRecords: catalog.calibratedRecords,
      lifeRecords: catalog.models?.life_only?.records,
      combinedRecords: model.records,
    },
  });
}

// The single-policy L&G illustration pays £20,000 for life or earlier critical illness.
const extraCi = illustrationRows.find(row => row.sha256 === 'd720579e7cc2358cb34640ef807741afdb3d6d3c88c7d576479b5360c690a189');
if (extraCi?.product !== 'Life or Earlier CI Extra' || extraCi.critical_illness_component !== '20000'
    || extraCi.base_ci_monthly !== '12.85' || extraCi.optional_monthly !== '0.15'
    || extraCi.total_monthly !== '13.00') {
  failures.push({ issue: 'L&G enhanced critical illness and TPD premium differs from the illustration' });
}
const lifeAtSameTerms = illustrationRows.filter(row => row.age === '36' && row.smoker === 'false'
  && row.to_age === '64' && row.life_component === '20000' && row.critical_illness_component === '0');
if (!lifeAtSameTerms.length && catalog.models.life_only.lookup['36|64|20000|0|0'] === 13) {
  failures.push({ issue: 'Enhanced L&G premium attached to life-only cover' });
}

// These billed amounts were previously attached to a different smoking status, capital or benefit.
const correctedLgPolicies = [
  ['63fd5e44a3d9faab3ca989bb19bd349a2dad08c1856a0c44a2f40b7b04b0777b', '47.82', 'true', '50000', '0', '1.39'],
  ['94f5bd7795dade5ed64861c953e04fbc462a5edf5095b9e3bf702f0c89b0eb48', '37.85', 'true', '50000', '0', '0.74'],
  ['87a10876982d91c0379b0a4419cf376fddab451b50b8c4acd3729923e1ce8de9', '11.22', 'true', '20000', '20000', '0.19'],
];
for (const [digest, total, smoker, life, ci, optional] of correctedLgPolicies) {
  const row = illustrationRows.find(entry => entry.sha256 === digest && entry.total_monthly === total);
  if (!row || row.smoker !== smoker || row.life_component !== life ||
      row.critical_illness_component !== ci || row.optional_monthly !== optional)
    failures.push({ issue: 'L&G policy differs from the original illustrated terms', digest, total });
}
if (catalog.models.life_only.lookup['57|69|50000|0|0'] === 46.43 ||
    model.lookup['41|64|90000|10000|0'] === 16.42 ||
    model.lookup['26|64|10000|10000|1'] === 11.16)
  failures.push({ issue: 'Historical L&G premium reused for incompatible benefits or smoking status' });

// The £35.77 Aviva package contains £50k life and £10k life or earlier CI.
const avivaPackage = illustrationRows.find(row => row.sha256 === '7a981c1026538918932d9678c629c2ad1c6da20057bbff53c60a8a5c81cfc0ad' && row.total_monthly === '35.77');
if (avivaPackage?.product !== 'Life + Life or Earlier CI Core' || avivaPackage.life_component !== '50000' ||
    avivaPackage.critical_illness_component !== '10000' || avivaPackage.base_life_monthly !== '18.92' ||
    avivaPackage.base_ci_monthly !== '16.34' || avivaPackage.optional_monthly !== '0.51' ||
    model.lookup['56|70|60000|10000|0'] === 35.77 || model.lookup['49|65|10000|10000|0'] === 9.89) {
  failures.push({ issue: 'Aviva shared life and CI premium reused for an independent diagnosis benefit' });
}
const independentSmoker = illustrationRows.find(row => row.sha256 === 'fd563b6a9784aaa755cc9a501bc13644a1215b2f7b29691c6b1be1eade9b142c' && row.total_monthly === '29.31');
if (independentSmoker?.product !== 'Critical Illness+ Core (package component)' || independentSmoker.smoker !== 'true' ||
    independentSmoker.life_component !== '0' || independentSmoker.critical_illness_component !== '10000' ||
    independentSmoker.base_ci_monthly !== '28.78' || independentSmoker.optional_monthly !== '0.53') {
  failures.push({ issue: 'Aviva independent CI component differs from the smoker illustration' });
}

const correctedZurichLife = illustrationRows.find(row => row.sha256.startsWith('577d3298f12e'));
if (correctedZurichLife?.product !== 'Life discounted multipolicy' || correctedZurichLife.life_component !== '50000' ||
    correctedZurichLife.critical_illness_component !== '0' || correctedZurichLife.total_monthly !== '8.61' ||
    catalog.models.life_only.lookup['59|70|20000|0|1'] !== 30.35 ||
    model.lookup['32|65|160000|10000|0'] === 14.07 || model.lookup['34|65|70000|20000|0'] === 14.69) {
  failures.push({ issue: 'Zurich historical policy used for an incompatible family or capital' });
}

const shortLgLife = [['20|65|144073|0|0', 5.97], ['45|65|60000|0|1', 20.35],
  ['50|65|70000|0|0', 12.67], ['54|75|50000|0|0', 17.18]];
for (const [key, shorterPremium] of shortLgLife) {
  if (catalog.models.life_only.lookup[key] === shorterPremium)
    failures.push({ key, issue: 'Shorter L&G policy was used as an end-age anchor' });
}
const matchingZurich = illustrationRows.find(row => row.provider === 'Zurich' && row.to_age === '75' &&
  row.age === '54' && row.smoker === 'false' && row.life_component === '50000' &&
  row.critical_illness_component === '0' && row.base_life_monthly === '17.67');
if (!matchingZurich || catalog.models.life_only.lookup['54|75|50000|0|0'] !== Number(matchingZurich.base_life_monthly))
  failures.push({ issue: 'Full-duration Zurich life premium differs from the verified source' });

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
  illustrationRows.length !== 508
  || new Set(hashes).size !== 392
  || catalog.audit?.illustrationValidationDocuments !== new Set(hashes).size
  || new Set(illustrationFingerprints).size !== illustrationRows.length
  || hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))
  || catalog.audit?.illustrationValidationRecords !== 508
) {
  failures.push({
    expectedIllustrationValidation: { rows: 508, uniqueDocuments: 392, uniqueRecords: 508, auditCount: 508 },
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
  const fixedOnly = row.to_age === '' && row.provider === 'Legal & General' && Number.isInteger(term) && term > 0;
  if (!fixedOnly && (!Number.isFinite(term) || !validTerms.has(term))) {
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
  { key: '56|70|50000|0|0', expected: 17.29, actual: lifeModel?.lookup?.['56|70|50000|0|0'] },
  { key: '38|65|100000|0|0', expected: 9.26, actual: lifeModel?.lookup?.['38|65|100000|0|0'] },
  { key: '36|65|100000|0|0', expected: 8.44, actual: lifeModel?.lookup?.['36|65|100000|0|0'] },
  { key: '61|85|80000|0|0', expected: 59.77, actual: lifeModel?.lookup?.['61|85|80000|0|0'] },
  { key: '46|65|500000|0|0', expected: 49.28, actual: lifeModel?.lookup?.['46|65|500000|0|0'] },
  { key: '57|69|50000|0|1', expected: 46.43, actual: lifeModel?.lookup?.['57|69|50000|0|1'] },
  { key: '41|65|100000|0|0', expected: 10.90, actual: lifeModel?.lookup?.['41|65|100000|0|0'] },
  { key: '54|64|50000|0|0', expected: 13.01, actual: lifeModel?.lookup?.['54|64|50000|0|0'] },
  { key: '54|65|50000|0|0', expected: 15.12, actual: lifeModel?.lookup?.['54|65|50000|0|0'] },
  { key: '47|69|80000|0|0', expected: 14.13, actual: lifeModel?.lookup?.['47|69|80000|0|0'] },
  { key: '47|69|100000|0|0', expected: 17.16, actual: lifeModel?.lookup?.['47|69|100000|0|0'] },
  { key: '47|70|70000|0|0', expected: 13.27, actual: lifeModel?.lookup?.['47|70|70000|0|0'] },
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
  profile: 'Calibration Profile',
  exactAnchorsChecked: rows.length,
  illustrationValidationRecords: illustrationRows.length,
  solutionBuilderHistoryValidationRecords: historyRows.length,
  solutionBuilderHistoryUniqueRecords: uniqueHistoryRows.length,
  exactHistoryAnchors: exactHistoryAnchors.length,
  calibratedRecords: catalog.calibratedRecords,
  lifeRecords: lifeModel.records,
  combinedRecords: model.records,
}, null, 2));
