import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function rows(name) {
  const text = readFileSync(new URL("../data/" + name + ".csv", import.meta.url), "utf8");
  const [head, ...rest] = text.trimEnd().split(/\r?\n/);
  const fields = head.split(",");
  return rest.map(line => Object.fromEntries(line.split(",").map((value, i) => [fields[i], value])));
}

const requests = new Map();
function addRequest(row, digest, years) {
  // The comparison supplies the requested expiry. The carrier illustration supplies the duration.
  const terms = [row.source_date, row.age, row.smoker === "Yes" ? "true" : "false", years, row.to_age];
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.ok([0, 1].includes(Number(row.to_age) - Number(row.age) - Number(years)), digest);
  if (requests.has(digest)) assert.deepEqual(terms, requests.get(digest), digest);
  requests.set(digest, terms);
}
for (const name of ["lg-illustrated-terms", "lg-core-breakdowns"]) {
  for (const row of rows(name)) addRequest(row, row.sha256, row.term_years);
}
for (const row of rows("supplemental-life-offers").filter(row => row.provider === "Legal & General")) {
  for (const digest of [row.waiver_illustration_sha256, row.no_riders_illustration_sha256].filter(Boolean)) {
    const term = /^(\d+) years?$/.exec(row.quoted_term);
    assert.ok(term, digest);
    addRequest(row, digest, term[1]);
  }
}

const catalog = rows("illustration-validation-2026-11-19").filter(row => row.provider === "Legal & General");
const verified = new Set();
for (const row of catalog) {
  const request = requests.get(row.sha256);
  if (request) {
    assert.deepEqual([row.source_date, row.age, row.smoker, row.term_years, row.to_age], request, row.sha256);
    verified.add(row.sha256);
  } else {
    assert.equal(row.to_age, "", "Unverified requested end age for " + row.sha256);
    assert.match(row.term_years, /^[1-9]\d*$/);
  }
}
assert.ok(verified.size && verified.size < new Set(catalog.map(row => row.sha256)).size);
console.log(JSON.stringify({ verifiedRequestDocumentsInCatalog: verified.size,
  verifiedRequestRows: catalog.filter(row => row.to_age).length, durationOnlyRows: catalog.filter(row => !row.to_age).length }));
