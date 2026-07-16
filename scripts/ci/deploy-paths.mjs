#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Single source of truth for files that CANNOT change the deployed GongWizard
// runtime. If a commit touches only these, the production build is a no-op and
// Vercel can skip it. Consumed by scripts/ci/vercel-ignore-build.sh.
//
// Exit contract MATCHES Vercel's ignoreCommand: 0 = no deploy (SKIP), 1 = deploy
// required (BUILD). Bias is ALWAYS toward BUILD — only provably-non-runtime paths
// are ignorable; anything unrecognized forces a BUILD.
//
// Allowlist verification (2026-07-15): docs/ + handoffs/ have ZERO imports from
// src/ (grep-confirmed); .github/ + .claude/ are CI/agent config; root *.md are
// docs/prompt files. Deliberately NOT ignored: src/ (all app code), public/
// (served assets), and root config (package.json, next.config.*, vercel.json).
// Locked by scripts/ci/deploy-paths.test.mjs (`node scripts/ci/deploy-paths.test.mjs`).

export const DEPLOY_IGNORE_PATTERNS = Object.freeze([
  'docs/**',
  'handoffs/**',
  '.github/**',
  '.claude/**',
  '*.md', // root-level markdown only (see matcher)
]);

export const DEPLOY_FORCE_PATTERNS = Object.freeze([]);

function normalizePath(file) {
  return String(file).trim().replace(/^\.\//, '').replace(/\\/g, '/');
}

export function matchesDeployPattern(file, pattern) {
  const normalized = normalizePath(file);
  if (!normalized) return false;
  if (pattern === '*.md') return !normalized.includes('/') && normalized.endsWith('.md');
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
  return normalized === pattern;
}

export function deploymentRequired(files) {
  const normalized = (files ?? []).map(normalizePath).filter(Boolean);
  if (normalized.length === 0) return true; // unknown/empty diff -> fail open to BUILD
  return normalized.some((file) => (
    DEPLOY_FORCE_PATTERNS.some((pattern) => matchesDeployPattern(file, pattern))
    || !DEPLOY_IGNORE_PATTERNS.some((pattern) => matchesDeployPattern(file, pattern))
  ));
}

function main() {
  const files = readFileSync(0, 'utf8').split(/\r?\n/).map(normalizePath).filter(Boolean);
  const required = deploymentRequired(files);
  process.stdout.write(`[deploy-paths] ${required ? 'runtime deployment required' : 'no runtime deployment'} (${files.length} changed path(s))\n`);
  process.exit(required ? 1 : 0); // Vercel ignoreCommand contract: 0=skip, 1=build
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
