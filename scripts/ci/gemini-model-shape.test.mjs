#!/usr/bin/env node
// Guardrail for the Gemini request shape + model pinning.
// Run: `node scripts/ci/gemini-model-shape.test.mjs`
//
// GongWizard has no CI and no test runner, and `next build` / `eslint` both pass
// regardless of which model string is in the source — the model is a runtime
// value handed to the SDK, so neither TypeScript nor ESLint validates it. This
// script is therefore the ONLY automated thing standing between this repo and a
// repeat of 2026-03-04, when it shipped broken because Google retired the
// gemini-2.0 models out from under it.
//
// Two layers, deliberately:
//   (1) BEHAVIOUR — import the real helper and assert what it emits. A
//       source-scan alone would pass an inverted version comparison, which is
//       exactly the gap in the sibling implementation this was ported from.
//   (2) SOURCE — scan src/ for model literals and hand-rolled configs, which a
//       unit assertion cannot see.
//
// Node >= 22.18 strips TS types natively, so the .ts helper imports directly.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const {
  GEMINI_SMART_MODEL,
  GEMINI_CHEAP_MODEL,
  isGemini3OrNewer,
  lowestThinkingLevelFor,
  thinkingLevelForBudget,
  geminiTuning,
} = await import('../../src/lib/gemini-generation-shape.ts');

// ── (1) Behaviour ──────────────────────────────────────────────────────────

// Version parsing. The leading major is what decides the request shape, so an
// unreleased gemini-4-* must read as "3 or newer", never fall back to 2.5.
assert.equal(isGemini3OrNewer('gemini-2.5-pro'), false, '2.5-pro is pre-3');
assert.equal(isGemini3OrNewer('gemini-2.5-flash-lite'), false, '2.5-flash-lite is pre-3');
assert.equal(isGemini3OrNewer('gemini-3.8-flash'), true, '3.8-flash is 3+');
assert.equal(isGemini3OrNewer('gemini-4-neon'), true, 'an unreleased 4.x reads as 3+');
assert.equal(isGemini3OrNewer('models/gemini-3.8-flash'), true, 'the models/ prefix is a real form');
assert.equal(isGemini3OrNewer(''), false, 'garbage fails closed to the 2.5 shape');

// Thinking floors. MINIMAL is NOT universal: Google documents it as rejected
// with a 400 on gemini-3.8-flash and the Gemini 4 family. Getting this backwards
// is a hard failure on every analyze call, so it is pinned per model.
assert.equal(lowestThinkingLevelFor('gemini-3.8-flash'), 'LOW', '3.8-flash REJECTS minimal');
assert.equal(lowestThinkingLevelFor('gemini-3.7-flash'), 'LOW', '3.7-flash REJECTS minimal');
assert.equal(lowestThinkingLevelFor('gemini-4-neon'), 'LOW', 'Gemini 4 REJECTS minimal');
assert.equal(lowestThinkingLevelFor('gemini-3.6-flash'), 'MINIMAL', '3.6 and below accept minimal');
assert.equal(lowestThinkingLevelFor('gemini-3.5-flash-lite'), 'MINIMAL', '3.5-lite accepts minimal');

// A caller asking for reasoning must still get reasoning — translated, never
// silently discarded down to the floor.
assert.equal(thinkingLevelForBudget(128, 'gemini-3.6-flash'), 'LOW', 'a positive budget keeps thinking ON');
assert.equal(thinkingLevelForBudget(0, 'gemini-3.6-flash'), 'MINIMAL', 'budget 0 means the floor');

// The smart tier's real wire shape. This is the assertion that would have
// caught the Dec-1 break: temperature gone, thinking in the 3.x vocabulary,
// everything outside the deprecation untouched.
const smart = geminiTuning(GEMINI_SMART_MODEL, {
  temperature: 0.3,
  maxOutputTokens: 16384,
  thinkingConfig: { thinkingBudget: 0 },
  systemInstruction: 'sys',
  responseMimeType: 'application/json',
});
assert.ok(!('temperature' in smart), 'smart tier must not send the deprecated temperature');
assert.ok(!('topP' in smart) && !('topK' in smart), 'smart tier must not send topP/topK');
assert.equal(smart.thinkingConfig.thinkingLevel, 'LOW', 'smart tier sends thinkingLevel LOW');
assert.ok(!('thinkingBudget' in smart.thinkingConfig), 'thinkingBudget is the 2.5 vocabulary');
assert.equal(smart.maxOutputTokens, 16384, 'maxOutputTokens is not in the deprecation set');
assert.equal(smart.systemInstruction, 'sys', 'systemInstruction passes through');
assert.equal(smart.responseMimeType, 'application/json', 'responseMimeType passes through');

// An EXPLICIT thinkingLevel the caller set is never overwritten.
const explicit = geminiTuning(GEMINI_SMART_MODEL, { thinkingConfig: { thinkingLevel: 'HIGH', thinkingBudget: 0 } });
assert.equal(explicit.thinkingConfig.thinkingLevel, 'HIGH', 'an explicit level wins over the floor');

// The cheap tier is pre-3 and NOT deprecated: identity, byte-for-byte. If this
// ever starts stripping, every cheap-tier call silently loses its temperature.
const cheapIn = { temperature: 0.3, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } };
const cheapOut = geminiTuning(GEMINI_CHEAP_MODEL, cheapIn);
assert.equal(cheapOut, cheapIn, 'a pre-3 model returns the SAME object reference (identity)');
assert.equal(cheapOut.temperature, 0.3, 'pre-3 keeps temperature — it is load-bearing there');
assert.equal(cheapOut.thinkingConfig.thinkingBudget, 0, 'pre-3 keeps the native thinkingBudget');

// ── (2) Source scan ────────────────────────────────────────────────────────

// Scoped to src/ — re-derived for THIS repo. The sibling implementations scan
// ["app","lib","scripts"], which under this layout would match nothing at all.
function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(full);
  }
  return out;
}

const SHAPE_MODULE = 'src/lib/gemini-generation-shape.ts';
const files = walk('src');
assert.ok(files.length > 0, 'the scan must actually find files — an empty scan passes vacuously');
assert.ok(files.includes(SHAPE_MODULE), `the scan must cover ${SHAPE_MODULE}`);

// Strip comments so prose ABOUT the retirement stays legal — these files
// document the migration heavily, on purpose.
const stripComments = (src) =>
  src.split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/^\s*\/\*.*$/, ''))
    .join('\n');

// `gemini-2.5-flash` is a literal SUBSTRING of the NOT-retired
// `gemini-2.5-flash-lite`, so the lookahead is load-bearing: without it this
// flags the one model that is actually fine.
const RETIRED = /(?<![-\w])gemini-2\.5-(?:flash|pro)(?!-lite)(?![-\w])/;

const retiredOffenders = [];
const literalOffenders = [];
const handRolled = [];
const missingThinking = [];

for (const file of files) {
  const code = stripComments(readFileSync(file, 'utf8'));

  if (RETIRED.test(code)) retiredOffenders.push(file);

  // Every model id lives in the shape module. A bare literal anywhere else is
  // how this file ended up with three of them that could drift apart.
  if (file !== SHAPE_MODULE && /['"]gemini-[0-9]/.test(code)) literalOffenders.push(file);

  // A config handed to the SDK must go through geminiTuning, or it keeps
  // sending whatever shape its author happened to copy off the internet.
  if (file !== SHAPE_MODULE && /generateContent(?:Stream)?\s*\(/.test(code)) {
    const total = (code.match(/config:/g) ?? []).length;
    const viaHelper = (code.match(/config:\s*geminiTuning\(/g) ?? []).length;
    if (total !== viaHelper) handRolled.push(`${file}: ${total - viaHelper} hand-rolled config`);

    // geminiTuning TRANSLATES an existing thinking config; it cannot invent
    // one. So every tuned call site must actually pass one — otherwise the
    // model falls back to its own default (MEDIUM on the 3.x flash tier),
    // thinking comes back ON, thought tokens eat the maxOutputTokens budget,
    // and a JSON.parse caller truncates mid-object. That failure is invisible
    // to every other assertion here, because the emitted SHAPE is still valid.
    const tuned = (code.match(/geminiTuning\(/g) ?? []).length;
    const thinking = (code.match(/thinkingConfig\s*:/g) ?? []).length;
    if (thinking < tuned) {
      missingThinking.push(`${file}: ${tuned} geminiTuning call(s), only ${thinking} thinkingConfig`);
    }
  }
}

assert.deepEqual(retiredOffenders, [], 'no executable code may name a model retired on 2026-12-01');
assert.deepEqual(literalOffenders, [], `every model id belongs in ${SHAPE_MODULE}`);
assert.deepEqual(handRolled, [], 'every Gemini config must be built by geminiTuning');
assert.deepEqual(missingThinking, [], 'every tuned call site must pass an explicit thinkingConfig');

// Guard the guard: prove the retired-model pattern fires and spares the
// survivor, so the assertion above cannot pass by matching nothing.
assert.equal(RETIRED.test("model: 'gemini-2.5-pro'"), true, 'pattern catches 2.5-pro');
assert.equal(RETIRED.test("model: 'gemini-2.5-flash'"), true, 'pattern catches 2.5-flash');
assert.equal(RETIRED.test("'gemini-2.5-flash-lite'"), false, 'pattern spares 2.5-flash-lite');
assert.equal(RETIRED.test(GEMINI_SMART_MODEL), false, 'pattern spares the pinned smart model');
assert.equal(RETIRED.test(GEMINI_CHEAP_MODEL), false, 'pattern spares the pinned cheap model');

console.log(
  `gemini-model-shape guardrail: ALL PASS ` +
  `(smart=${GEMINI_SMART_MODEL} thinkingLevel=${smart.thinkingConfig.thinkingLevel}, ` +
  `cheap=${GEMINI_CHEAP_MODEL} identity, ${files.length} src files scanned)`,
);
