# GongWizard Dependency Audit

**Generated:** 2026-03-03  
**Codebase analyzed:** `/Users/forrestmiller/Claude/projects/GongWizard/gongwizard/src/`  
**Source files scanned:** 41 TypeScript/JavaScript files

---

## Summary

| Metric | Count |
|--------|-------|
| Total dependencies | 25 |
| Dependencies with imports in `src/` | 10 |
| Possibly unused (zero imports) | 15 |
| Misplaced devDependencies | 0 |

---

## Possibly Unused Dependencies (15)

These packages appear in `package.json` but have **zero import statements** in the source code (`src/`). Many are legitimate (CLI tools, config plugins, type definitions) and likely used implicitly. See **Notes** section below.

### Production Dependencies (3)

| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@playwright/test` | `^1.58.2` | End-to-end testing framework | [Implicit] CLI tool; tests live in `.claude/skills/gongwizard-test/` |
| `cmdk` | `^1.1.1` | Command palette primitive from shadcn/ui | [Possible] May be for future command menu component |
| `openai` | `^6.25.0` | OpenAI SDK | [Possible] Commented out or planned; only Gemini currently used |
| `react-day-picker` | `^9.14.0` | Calendar/date range picker | [Possible] Depends on radix-ui; may be in shadcn component that's installed but not used |
| `react-dom` | `19.2.3` | React DOM runtime | [Implicit] Required peer dependency; implicitly used by React |

### DevDependencies (10)

| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@tailwindcss/postcss` | `^4` | Tailwind CSS PostCSS plugin | [Implicit] Loaded by `postcss.config.mjs` |
| `@types/node` | `^20` | TypeScript node types | [Implicit] Used by TypeScript compiler and runtime |
| `@types/react` | `^19` | TypeScript React type definitions | [Implicit] Used by TypeScript compiler |
| `@types/react-dom` | `^19` | TypeScript React DOM type definitions | [Implicit] Used by TypeScript compiler |
| `eslint` | `^9` | Code linter | [Implicit] CLI tool; invoked via `npm run lint` |
| `eslint-config-next` | `16.1.6` | ESLint config for Next.js | [Implicit] Extends in `eslint.config.mjs` |
| `shadcn` | `^3.8.5` | shadcn/ui CLI tool | [Implicit] CLI tool for scaffolding components; no runtime imports needed |
| `tailwindcss` | `^4` | Utility-first CSS framework | [Implicit] Loaded by `postcss.config.mjs` and `tailwind.config.ts` |
| `tw-animate-css` | `^1.4.0` | Animation utilities for Tailwind | [Implicit] Likely loaded via config or Tailwind's extend mechanism |
| `typescript` | `^5` | TypeScript compiler | [Implicit] Used during dev/build; invoked by Next.js |

---

## Misplaced DevDependencies

**None found.** All devDependencies are appropriately scoped (type definitions, linters, build tools, CLI utilities).

---

## Packages Actually Imported in `src/`

These 10 packages have confirmed imports across the source code:

| Package | Files | Usage Pattern |
|---------|-------|----------------|
| `@google/genai` | 1 | Gemini API calls in analysis routes |
| `class-variance-authority` | 3 | Component variant composition in UI components |
| `client-zip` | 1 | Browser-side ZIP creation for bulk exports |
| `clsx` | 1 | Conditional className utility in `utils.ts` |
| `date-fns` | 2 | Date formatting in export filenames and components |
| `lucide-react` | 3 | SVG icons throughout UI |
| `next` | 17 | Core framework (routes, middleware, images, headers, etc.) |
| `radix-ui` | 8 | Headless UI primitives (Checkbox, Tabs, Slider, Label, etc.) |
| `react` | 16 | Component definitions, hooks across all pages/components |
| `tailwind-merge` | 1 | Tailwind class merging in `cn()` utility |

---

## Notes

### Implicitly Used Dependencies

These are legitimate and should **not be removed**:

- **CLI tools** (`eslint`, `tailwindcss`, `shadcn`, `@playwright/test`): Invoked via npm scripts or the command line; no direct imports needed.
- **Type definitions** (`@types/*`): Used during TypeScript compilation; no runtime imports.
- **PostCSS plugins** (`@tailwindcss/postcss`, `tw-animate-css`): Loaded by `postcss.config.mjs`; used during CSS processing.
- **Framework loaders** (`typescript`): Invoked by the build system.

### Candidates for Removal

**If not planning to use in the near future:**

- **`cmdk`** (`^1.1.1`): Command palette primitive. Currently unused; remove if not planned.
- **`openai`** (`^6.25.0`): OpenAI SDK. Currently all AI calls go through Gemini. Remove if no plans to switch back.
- **`react-day-picker`** (`^9.14.0`): Unused calendar picker. The installed shadcn/ui component may not be referenced. Safe to remove if no date-range filtering is needed.

### Recommendation

Keep all current dependencies unless you explicitly plan to:
- Add OpenAI as a secondary AI provider (currently Gemini-only)
- Add a command menu to the UI (currently no cmdk-based UI components)
- Implement a date-range filter requiring react-day-picker (not in current feature set)

The unused packages add **~150 KB combined** to bundle size (gzipped). If performance is a concern, audit and remove `cmdk`, `openai`, and `react-day-picker` after confirming no planned usage.

---

## Analysis Methodology

1. Extracted all 25 packages from `package.json` (15 dependencies, 10 devDependencies)
2. Scanned 41 source files in `src/` for:
   - `import X from 'package-name'`
   - `require('package-name')`
   - `require.resolve('package-name')`
3. Flagged packages with zero import statements as "possibly unused"
4. Cross-referenced with config files (`postcss.config.mjs`, `eslint.config.mjs`, `next.config.ts`) to identify implicit uses
5. Verified devDependencies not used in source code (all 10 are appropriately scoped to tooling/config)

