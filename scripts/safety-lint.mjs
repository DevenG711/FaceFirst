#!/usr/bin/env node
// FaceFirst safety lint. Enforces .kiro/steering/safety.md:
//   1. No banned reassuring words in result.* / card.* i18n strings or result/card screens.
//   2. The Call 911 button exists, uses tel:911, and is rendered from the root layout.
//   3. Thresholds are marked uncalibrated.
//   4. .kiro is never gitignored.
// Zero dependencies. Exit 0 = pass, 1 = violations (printed to stderr).
// Usage: node scripts/safety-lint.mjs

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const errors = [];
const rel = (p) => relative(root, p);
const read = (p) => readFileSync(p, 'utf8');

// ---------- banned words ----------
const bannedPath = join(root, 'src/lib/triage/bannedWords.json');
if (!existsSync(bannedPath)) {
  console.error('safety-lint: missing src/lib/triage/bannedWords.json');
  process.exit(1);
}
const bannedByLocale = JSON.parse(read(bannedPath));
const banned = [
  ...new Set(
    Object.entries(bannedByLocale)
      .filter(([k]) => !k.startsWith('_'))
      .flatMap(([, words]) => words)
  ),
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Unicode-aware whole-word match ("abnormal" must not match "normal").
const patterns = banned.map((w) => ({
  word: w,
  re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(?![\\p{L}\\p{N}])`, 'iu'),
}));
const normalize = (s) => s.replace(/[\u2018\u2019\u02BC]/g, "'");

function scanText(text, where) {
  const t = normalize(text);
  for (const { word, re } of patterns) {
    if (re.test(t)) errors.push(`${where}: banned word "${word}"`);
  }
}

// i18n: only result.* and card.* namespaces
function walkKeys(obj, prefix, file) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') walkKeys(v, key, file);
    else if (typeof v === 'string' && /^(result|card)\./.test(key)) scanText(v, `${file} [${key}]`);
  }
}
const i18nDir = join(root, 'src/lib/i18n');
if (existsSync(i18nDir)) {
  for (const f of readdirSync(i18nDir).filter((f) => f.endsWith('.json'))) {
    const p = join(i18nDir, f);
    try {
      walkKeys(JSON.parse(read(p)), '', rel(p));
    } catch (e) {
      errors.push(`${rel(p)}: invalid JSON (${e.message})`);
    }
  }
}

// Svelte files under result/ and card/ routes
function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}
for (const sub of ['src/routes/result', 'src/routes/card']) {
  for (const p of walkFiles(join(root, sub)).filter((p) => p.endsWith('.svelte'))) {
    scanText(read(p), rel(p));
    if (/\bgreen\b|#(?:4caf50|2e7d32|00ff00|22c55e|16a34a)\b/i.test(read(p))) {
      errors.push(`${rel(p)}: green color on a result/card screen`);
    }
  }
}

// ---------- 911 button ----------
const layout = join(root, 'src/routes/+layout.svelte');
const button = join(root, 'src/lib/components/Call911Button.svelte');
if (existsSync(layout)) {
  if (!/Call911Button/.test(read(layout))) {
    errors.push('src/routes/+layout.svelte: must render <Call911Button> so 911 is on every screen');
  }
  if (!existsSync(button)) errors.push('src/lib/components/Call911Button.svelte: missing');
}
if (existsSync(button) && !/href\s*=\s*["']tel:911["']/.test(read(button))) {
  errors.push('src/lib/components/Call911Button.svelte: must use href="tel:911"');
}

// ---------- thresholds ----------
const thresholds = join(root, 'src/lib/triage/thresholds.ts');
if (existsSync(thresholds) && !/UNCALIBRATED/.test(read(thresholds))) {
  errors.push('src/lib/triage/thresholds.ts: must be documented as UNCALIBRATED research placeholders');
}

// ---------- .kiro not gitignored ----------
const gitignore = join(root, '.gitignore');
if (existsSync(gitignore)) {
  const bad = read(gitignore)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
    .filter((l) => /^\/?\.kiro(\/.*)?$/.test(l));
  if (bad.length) errors.push(`.gitignore: must not ignore .kiro (found: ${bad.join(', ')})`);
}

if (errors.length) {
  console.error(`SAFETY LINT FAILED (${errors.length} issue${errors.length > 1 ? 's' : ''}):`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error('Fix the code or copy. Do not weaken this lint. See .kiro/steering/safety.md.');
  process.exit(1);
}
console.log('safety-lint: OK');
