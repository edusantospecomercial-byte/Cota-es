import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const calculatorDir = join(here, "..");
const scriptFiles = readdirSync(here).filter((name) => name.endsWith(".mjs")).sort();
const validators = scriptFiles
  .filter((name) => name.startsWith("validate-") && name.endsWith(".mjs") && name !== "validate-all.mjs")
  .sort();
const commands = [
  [process.execPath, ["--check", join(calculatorDir, "app.js")]],
  ...scriptFiles.map((name) => [process.execPath, ["--check", join(here, name)]]),
  ...validators.map((name) => [process.execPath, [join(here, name)]]),
  [process.execPath, [join(here, "test-lookup-interpolation.mjs")]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`All calculator checks passed: app and ${scriptFiles.length} script syntax checks, ${validators.length} validators, and interpolation tests.`);
