import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const calculatorDir = join(here, "..");
const index = readFileSync(join(calculatorDir, "index.html"), "utf8");
const assets = ["calibration.js", "app.js"];
const versions = {};

for (const asset of assets) {
  const content = readFileSync(join(calculatorDir, asset));
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const expected = `${asset}?v=${hash}`;
  if (!index.includes(expected)) {
    throw new Error(JSON.stringify({
      issue: "stale browser cache version",
      asset,
      expected,
    }, null, 2));
  }
  versions[asset] = hash;
}

console.log(JSON.stringify({ ok: true, assetVersions: versions }, null, 2));
