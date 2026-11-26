import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const calculatorDir = join(here, "..");
const baseUrl = "https://edusantospecomercial-byte.github.io/Cota-es/calculadora/";
const localIndex = readFileSync(join(calculatorDir, "index.html"), "utf8");
const localCatalog = JSON.parse(readFileSync(join(calculatorDir, "data/models.json"), "utf8"));
const expectedAppVersion = localIndex.match(/app\.js\?v=([a-f0-9]+)/)?.[1];
const criticalAssets = [
  "data/comparison-pdf-index.csv",
  "data/supplemental-life-offers.csv",
  "data/fixed-term-life.csv",
  "data/comparison-product-declines.csv",
  "data/exact-capital-product-variants.csv",
  "data/smoker-first-event-product-variants.csv",
  "data/non-smoker-first-event-product-variants.csv",
  "data/lg-fixed-term-first-event-product-variants.csv",
  "data/accelerated-comparisons.csv",
  "data/waiver-individual-offers.csv",
  "data/independent-ci-tpd.csv",
  "data/occupation-basis.csv",
  "data/fracture-comparisons.csv",
  "data/fracture-breakdowns.csv",
  "data/aviva-core-breakdowns.csv",
  "data/zurich-core-breakdowns.csv",
  "data/lg-core-breakdowns.csv",
  "data/accelerated-maturity-declines.csv",
  "index.html",
  "style.css",
  "app.js",
  "calibration.js",
  "data/models.json",
  "data/comparisons-with-waiver.csv",
  "data/solutionbuilder-observed-2026-11-24.csv",
  "data/capital-validation-holdout.csv",
  "data/verified-archive-terms.csv",
  "data/zurich-illustrated-life.csv",
  "data/illustration-validation-2026-11-19.csv",
  "data/lg-illustrated-terms.csv",
  "data/live-captures-2026-11-22.csv",
  "data/solutionbuilder-priority-providers-2026-11-20.csv",
  "data/solutionbuilder-priority-provider-archive-2026-11-21.csv",
  "data/solutionbuilder-priority-provider-gaps-2026-11-20.csv",
  "data/solutionbuilder-priority-provider-gap-archive-2026-11-21.csv",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const [pageResponse, catalogResponse] = await Promise.all([
  fetch(baseUrl, { cache: "no-store" }),
  fetch(`${baseUrl}data/models.json`, { cache: "no-store" }),
]);
if (!pageResponse.ok || !catalogResponse.ok)
  throw new Error(JSON.stringify({ pageStatus: pageResponse.status, catalogStatus: catalogResponse.status }));

const liveIndex = await pageResponse.text();
const liveCatalog = await catalogResponse.json();
const liveAppVersion = liveIndex.match(/app\.js\?v=([a-f0-9]+)/)?.[1];
const expected = {
  appVersion: expectedAppVersion,
  calibratedRecords: localCatalog.calibratedRecords,
  priorityPrices: localCatalog.audit?.priorityProviderPrices,
  temporalPredictions: localCatalog.audit?.priorityProviderTemporalHoldout?.predicted,
};
const actual = {
  appVersion: liveAppVersion,
  calibratedRecords: liveCatalog.calibratedRecords,
  priorityPrices: liveCatalog.audit?.priorityProviderPrices,
  temporalPredictions: liveCatalog.audit?.priorityProviderTemporalHoldout?.predicted,
};

const assetChecks = await Promise.all(criticalAssets.map(async (asset) => {
  const local = readFileSync(join(calculatorDir, asset));
  const response = await fetch(`${baseUrl}${asset}`, { cache: "no-store" });
  if (!response.ok) return { asset, status: response.status, match: false };
  const live = Buffer.from(await response.arrayBuffer());
  const localHash = sha256(local);
  const liveHash = sha256(live);
  return { asset, status: response.status, bytes: live.length, localHash, liveHash, match: localHash === liveHash };
}));

if (JSON.stringify(actual) !== JSON.stringify(expected) || assetChecks.some((asset) => !asset.match)) {
  console.error(JSON.stringify({ ok: false, issue: "live deployment differs from local release", expected, actual, assetChecks }, null, 2));
  process.exit(1);
}
const report = { ok: true, url: baseUrl, ...actual, verifiedAssets: assetChecks.length };
console.log(JSON.stringify(
  process.argv.includes("--compact") ? report : { ...report, assetChecks },
  null,
  2,
));
