# GongWizard Dependency Audit

**Generated:** 2026-03-03  
**Project:** `/Users/forrestmiller/Claude/projects/GongWizard/gongwizard`

## Summary

| Metric | Count |
|--------|-------|
| Total dependencies | 14 |
| Total devDependencies | 8 |
| **Total declared** | **26** |
| Confirmed in use | 16 |
| Possibly unused | 10 |
| Possibly misplaced devDeps | 1 |

---

## Confirmed Dependencies (In Use)

These dependencies have explicit `import`/`require` statements in the source code:

| Dependency | Type | Used In | Purpose |
|------------|------|---------|---------|
| `react` | dep | src/app/, src/components/, src/hooks/ | React component runtime |
| `react-dom` | dep | src/app/layout.tsx | React DOM rendering (implicit via Next.js) |
| `next` | dep | src/app/, src/middleware.ts | Next.js framework |
| `lucide-react` | dep | src/app/page.tsx, src/app/gate/page.tsx, src/components/ui/checkbox.tsx | Icon library |
| `clsx` | dep | src/lib/utils.ts | Conditional className builder |
| `tailwind-merge` | dep | src/lib/utils.ts | Merge Tailwind classes |
| `class-variance-authority` | dep | src/components/ui/tabs.tsx, src/components/ui/button.tsx, src/components/ui/badge.tsx, src/components/ui/slider.tsx | Variant pattern library |
| `radix-ui` | dep | src/components/ui/tabs.tsx, src/components/ui/checkbox.tsx, src/components/ui/label.tsx, src/components/ui/button.tsx, src/components/ui/scroll-area.tsx, src/components/ui/separator.tsx, src/components/ui/slider.tsx | Unstyled UI primitives |
| `date-fns` | dep | src/app/calls/page.tsx, src/hooks/useCallExport.ts | Date formatting & manipulation |
| `client-zip` | dep | src/hooks/useCallExport.ts | Client-side ZIP file generation |
| `@google/genai` | dep | src/lib/ai-providers.ts | Google AI Generative API client |
| `@tailwindcss/postcss` | devDep | postcss.config.mjs | PostCSS plugin (implicit — config-based) |
| `eslint-config-next` | devDep | eslint.config.mjs | ESLint Next.js config (implicit — config-based) |
| `tailwindcss` | devDep | implicitly loaded by @tailwindcss/postcss | Tailwind CSS framework (dev tooling) |
| `typescript` | devDep | src/ (throughout) | TypeScript compilation (implicit — tsconfig.json) |
| `@types/react` | devDep | src/ (throughout) | React type definitions (implicit — tsconfig.json) |

---

## Possibly Unused Dependencies

These are declared in `package.json` but have **zero explicit import/require statements** in the source code. They may still be used implicitly (e.g., CLI tools, optional transitive features, or shadcn scaffolding) — flag for review but don't assert they're unused:

| Dependency | Type | Declared Purpose | Notes |
|------------|------|-------------------|-------|
| `@playwright/test` | **dep** | E2E testing framework (v1.58.2) | **FLAGGED**: Should be devDep, not prod dependency. Used in test files (`.claude/skills/gongwizard-test/`), not source code. No import in src/. |
| `cmdk` | dep | Command palette component (v1.1.1) | No import found; unused UI primitive for shadcn/ui. May be leftover from design exploration. |
| `react-day-picker` | dep | Calendar component (v9.14.0) | No import found; shadcn/ui primitive. Unused unless calendar UI is rendered. |
| `openai` | dep | OpenAI API client (v6.25.0) | No import in src/; only `@google/genai` is actively used. Appears to be dead code or planned feature. |
| `radix-ui` (specific submodules) | dep | Radix UI primitives (v1.4.3) | Confirmed in use for tabs, checkbox, label, button, scroll-area, separator, slider — but the version listed is the metapackage. Verify it's the right entry. |
| `tw-animate-css` | devDep | Tailwind animation utilities (v1.4.0) | No import found; possibly a Tailwind plugin or preset. Not referenced in tailwind.config or postcss.config. |
| `@types/node` | devDep | Node.js type definitions (v20) | Standard Next.js dependency; implicit via tsconfig.json but no explicit import found. |
| `@types/react-dom` | devDep | React DOM type definitions (v19) | Implicit via tsconfig.json; no explicit import found. |
| `shadcn` | devDep | shadcn/ui CLI tool (v3.8.5) | CLI tool for scaffolding components; not used in source code (only during setup). Safe as devDep. |
| `eslint` | devDep | ESLint linter (v9) | Configured in eslint.config.mjs but not imported; CLI tool. Correct placement as devDep. |

---

## Possibly Misplaced DevDependencies

These are in `devDependencies` but appear in source code (not just config/test files). Flag for review:

| Dependency | Type | Location | Analysis |
|------------|------|----------|----------|
| (None found) | — | — | All type definition packages and ESLint configs correctly reside in devDependencies. No source code imports found. |

**Note:** `@types/*`, `eslint*`, and PostCSS plugins are correctly placed as devDependencies. TypeScript compilation and type-checking are build-time concerns.

---

## Key Findings

1. **@playwright/test is a production dependency** — should be moved to devDependencies. Tests live in `.claude/skills/gongwizard-test/`, not in src/.

2. **OpenAI SDK is unused** — codebase only uses `@google/genai` for AI analysis. `openai` appears to be dead code from an earlier iteration. Consider removal if not planned for future features.

3. **cmdk and react-day-picker** are shadcn/ui primitives but have no visible usage in the codebase. These may have been scaffolded by `shadcn add` but never actually used in components. Review and remove if not needed.

4. **tw-animate-css** has no configuration reference — unclear if it's actually loaded or functional. Verify in Tailwind build process.

5. **Implicit dependencies are correct** — @tailwindcss/postcss, eslint-config-next, TypeScript, and type definitions are all properly referenced in config files (postcss.config.mjs, eslint.config.mjs, tsconfig.json).

6. **radix-ui metapackage** — Confirmed in use for multiple UI components (tabs, checkbox, label, button, scroll-area, separator, slider). This is the correct dependency.

---

## Recommendations

| Priority | Action | Dependency | Rationale |
|----------|--------|------------|-----------|
| **High** | Move to devDep | `@playwright/test` | Not used in production; only in test suite |
| **High** | Remove | `openai` | No imports; `@google/genai` is the active AI client |
| **Medium** | Audit usage | `cmdk` | No visible component usage; may be unused scaffolding |
| **Medium** | Audit usage | `react-day-picker` | No visible component usage; may be unused scaffolding |
| **Medium** | Verify build | `tw-animate-css` | Unclear if actually loaded; check Tailwind config |
| **Low** | Document | `radix-ui` | Confirm version matches all imported submodule versions |

