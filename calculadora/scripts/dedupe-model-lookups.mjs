import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const modelsPath = join(here, '..', 'data', 'models.json');
const gitRef = process.argv.find((argument) => argument.startsWith('--git-ref='))?.split('=')[1];
const repositoryRoot = join(here, '..', '..');
let source = gitRef
  ? execFileSync('git', ['show', `${gitRef}:calculadora/data/models.json`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 50_000_000,
    })
  : readFileSync(modelsPath, 'utf8');

const blocks = [];
for (const match of source.matchAll(/"lookup"\s*:\s*\{/g)) {
  const open = source.indexOf('{', match.index);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) {
      blocks.push({ open, close: index });
      break;
    }
  }
}

let removed = 0;
for (const { open, close } of blocks.reverse()) {
  const lines = source.slice(open + 1, close).split('\n');
  const lastIndex = new Map();
  lines.forEach((line, index) => {
    const key = line.match(/^\s*"([^"]+)"\s*:/)?.[1];
    if (key) lastIndex.set(key, index);
  });
  const deduplicated = lines.filter((line, index) => {
    const key = line.match(/^\s*"([^"]+)"\s*:/)?.[1];
    const keep = !key || lastIndex.get(key) === index;
    if (!keep) removed += 1;
    return keep;
  }).join('\n');
  source = `${source.slice(0, open + 1)}${deduplicated}${source.slice(close)}`;
}

JSON.parse(source);
writeFileSync(modelsPath, source.endsWith('\n') ? source : `${source}\n`);
console.log(`Removed ${removed} duplicate lookup keys from ${modelsPath}.`);
