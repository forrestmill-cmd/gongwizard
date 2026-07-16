#!/usr/bin/env node
// Guardrail for the Vercel no-op-build gate. Run: `node scripts/ci/deploy-paths.test.mjs`
// (GongWizard has no CI/test runner, so this is a manual check — but the gate is
// fail-open, so a classifier bug can only over-build, never wrong-skip.)
import assert from 'node:assert/strict';
import { deploymentRequired } from './deploy-paths.mjs';

const SKIP = false, BUILD = true; // deploymentRequired: true = BUILD, false = SKIP
assert.equal(deploymentRequired(['CLAUDE.md']), SKIP, 'docs-only SKIPs');
assert.equal(deploymentRequired(['docs/x.md', 'handoffs/y.md']), SKIP, 'docs+handoffs SKIP');
assert.equal(deploymentRequired(['.github/workflows/ci.yml']), SKIP, '.github SKIPs');
assert.equal(deploymentRequired(['src/app/page.tsx']), BUILD, 'src/ BUILDs');
assert.equal(deploymentRequired(['public/robots.txt']), BUILD, 'public/ BUILDs');
assert.equal(deploymentRequired(['package.json']), BUILD, 'root config BUILDs');
assert.equal(deploymentRequired(['CLAUDE.md', 'src/x.ts']), BUILD, 'mixed BUILDs');
assert.equal(deploymentRequired(['src/readme.md']), BUILD, 'nested *.md BUILDs (root-only rule)');
assert.equal(deploymentRequired([]), BUILD, 'empty diff BUILDs (fail-open)');
console.log('deploy-paths guardrail: ALL PASS');
