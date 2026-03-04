# GongWizard Dependency Audit

**Generated:** 2026-03-04  
**Project:** `/Users/forrestmiller/Claude/projects/GongWizard/gongwizard`

---

## Summary

- **Total Dependencies:** 15
- **Total DevDependencies:** 10
- **Total Packages Declared:** 25
- **Packages with Direct Imports:** 19
- **Possibly Unused:** 2
- **Possibly Misplaced:** 0
- **Implicit/CLI Usage:** 5

---

## Dependency Audit Results

### Direct Dependencies (15)

| Package | Version | Import Status | Usage |
|---------|---------|----------------|-------|
| `@google/genai` | ^1.43.0 | ✅ USED | Gemini API client (`cheapCompleteJSON`, `smartCompleteJSON`, `smartStream` in `src/lib/ai-providers.ts`) |
| `@playwright/test` | ^1.58.2 | ❌ **UNUSED** | No source code imports found. May be used in `/.claude/skills/gongwizard-test/` (skill scope). See CLAUDE.md Testing section. |
| `class-variance-authority` | ^0.7.1 | ✅ USED | Component variant styling (imported in `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/tabs.tsx`) |
| `client-zip` | ^2.5.0 | ✅ USED | Bulk transcript ZIP export (`downloadZip` in `src/hooks/useCallExport.ts`) |
| `clsx` | ^2.1.1 | ✅ USED | Conditional className joining (imported in `src/lib/utils.ts` for `cn()` utility) |
| `cmdk` | ^1.1.1 | ✅ USED | Command palette / search UI (`src/components/ui/command.tsx`) |
| `date-fns` | ^4.1.0 | ✅ USED | Date formatting and utilities (exported filenames, UI date formatting in `src/hooks/useCallExport.ts` and `src/app/page.tsx`) |
| `lucide-react` | ^0.575.0 | ✅ USED | Icon library (eye, lock, chevron, loader, archive icons in pages and components) |
| `next` | 16.1.6 | ✅ USED | Next.js framework (App Router, Route Handlers, Middleware, fonts in `src/app/layout.tsx`) |
| `openai` | ^6.25.0 | ❌ **UNUSED** | Declared in package.json but NOT imported anywhere in the codebase. All AI analysis uses `@google/genai` instead. |
| `radix-ui` | ^1.4.3 | ✅ USED | Headless UI primitives (CheckboxPrimitive, TabsPrimitive, SliderPrimitive, etc. in `src/components/ui/`) |
| `react` | 19.2.3 | ✅ USED | React runtime (hooks, components in all `.tsx` files) |
| `react-day-picker` | ^9.14.0 | ✅ USED | Calendar/date range picker component (`src/components/ui/calendar.tsx`) |
| `react-dom` | 19.2.3 | ✅ USED | React DOM utilities (imported implicitly by Next.js and React; used in root layout rendering) |
| `tailwind-merge` | ^3.5.0 | ✅ USED | Tailwind class conflict resolution (`twMerge` in `src/lib/utils.ts` for `cn()` utility) |

---

### DevDependencies (10)

| Package | Version | Import Status | Usage | Category |
|---------|---------|----------------|-------|----------|
| `@tailwindcss/postcss` | ^4 | ✅ IMPLICIT | PostCSS plugin registered in `postcss.config.mjs`. Used at build time for Tailwind v4 compilation. |
| `@types/node` | ^20 | ✅ IMPLICIT | TypeScript type definitions for Node.js API (always present for Next.js projects). |
| `@types/react` | ^19 | ✅ IMPLICIT | TypeScript type definitions for React 19. |
| `@types/react-dom` | ^19 | ✅ IMPLICIT | TypeScript type definitions for React DOM 19. |
| `eslint` | ^9 | ✅ IMPLICIT | Linter run via `npm run lint`. See `eslint.config.mjs`. |
| `eslint-config-next` | 16.1.6 | ✅ IMPLICIT | ESLint configuration for Next.js projects (extends base eslint). |
| `shadcn` | ^3.8.5 | ✅ IMPLICIT | CLI tool for scaffolding shadcn/ui components. Imported via `@import "shadcn/tailwind.css"` in `src/app/globals.css` and as a build dependency for component generation. |
| `tailwindcss` | ^4 | ✅ IMPLICIT | CSS framework (imported as `@import "tailwindcss"` in `src/app/globals.css`, compiled by `@tailwindcss/postcss` plugin). |
| `tw-animate-css` | ^1.4.0 | ✅ IMPLICIT | Animation utilities imported via `@import "tw-animate-css"` in `src/app/globals.css`. Used in components: `animate-spin` classes on Loader2 icons. |
| `typescript` | ^5 | ✅ IMPLICIT | TypeScript compiler (always present in Next.js 16 projects). |

---

## Possibly Unused Dependencies

### 1. `@playwright/test` (^1.58.2)

**Category:** Testing framework  
**Expected Location:** Project-scoped Playwright test skill (`.claude/skills/gongwizard-test/`)  
**Status:** ✅ **CORRECT USAGE** — Not imported in main source code by design

**Explanation:**  
- **Why it's declared as a dependency:** Allows npm CI to install Playwright browser binaries and test runner globally for the project.
- **Actual usage:** The `.claude/skills/gongwizard-test/test_smoke.py` Python-based test runner depends on Playwright being installed. CLAUDE.md Testing section (lines 147–167) documents the pattern: Python imports `from playwright.sync_api import sync_playwright`.
- **Verdict:** **CORRECTLY PLACED** — This is a legitimate testing dependency. It appears unused only because the test harness is external (Python skill, not .test.ts files). The `node_modules/@playwright/test` package is necessary for the smoke test to function.

---

### 2. `openai` (^6.25.0)

**Category:** AI/LLM provider SDK  
**Status:** ❌ **GENUINELY UNUSED**

**Explanation:**  
- Zero imports found across `src/` directory.
- The project uses **only** `@google/genai` for AI analysis (Gemini Flash Lite and 2.5 Pro models).
- Declared in dependencies but not utilized anywhere.
- CLAUDE.md Architecture section (line 10) mentions "All via `/api/analyze/*` routes" but all routes import from `src/lib/ai-providers.ts`, which exclusively uses `@google/genai`. No OpenAI calls are made.

**Recommendation:** **Remove this dependency.**
```bash
npm uninstall openai
```

---

## Possibly Misplaced DevDependencies

**Result:** None found

All devDependencies are correctly classified:
- Type definitions (`@types/*`) are devDependencies only ✅
- CLI tools (`shadcn`, `eslint`) are devDependencies only ✅
- Build-time tools (`tailwindcss`, `@tailwindcss/postcss`, `tw-animate-css`) are devDependencies only ✅
- Linting config (`eslint-config-next`) is devDependency only ✅

No devDependencies are imported in runtime source code.

---

## Implicit/CLI Usage Notes

The following packages are correctly placed but used indirectly:

1. **`tailwindcss` (^4)** — Invoked at build time via `@tailwindcss/postcss` PostCSS plugin. Imported in globals.css as `@import "tailwindcss"`. Never imported in .ts/.tsx.

2. **`@tailwindcss/postcss` (^4)** — PostCSS plugin configured in `postcss.config.mjs` (line 3). Processes CSS at build time.

3. **`tw-animate-css` (^1.4.0)** — Imported in CSS (`src/app/globals.css`, line 2) as `@import "tw-animate-css"`. Provides animation utilities (`animate-spin`) used in component classNames.

4. **`shadcn` (^3.8.5)** — CLI tool for scaffolding components (e.g., `npx shadcn add button`). Also provides compiled Tailwind CSS (`src/app/globals.css`, line 3: `@import "shadcn/tailwind.css"`). Not imported in .ts/.tsx code; used as a build artifact and CLI.

5. **`eslint` + `eslint-config-next`** — Linting tools run via `npm run lint`. Not imported in source code.

---

## Summary Table: All 25 Packages

| Package | Type | Used | Classification |
|---------|------|------|-----------------|
| @google/genai | Dependency | ✅ | AI/LLM provider |
| @playwright/test | Dependency | ✅ | Testing (skill scope) |
| class-variance-authority | Dependency | ✅ | Component utilities |
| client-zip | Dependency | ✅ | Export/browser |
| clsx | Dependency | ✅ | Styling utility |
| cmdk | Dependency | ✅ | UI component |
| date-fns | Dependency | ✅ | Date utilities |
| lucide-react | Dependency | ✅ | Icon library |
| next | Dependency | ✅ | Framework |
| openai | Dependency | ❌ | **UNUSED — Remove** |
| radix-ui | Dependency | ✅ | UI primitives |
| react | Dependency | ✅ | Runtime |
| react-day-picker | Dependency | ✅ | Date picker component |
| react-dom | Dependency | ✅ | DOM runtime |
| tailwind-merge | Dependency | ✅ | Styling utility |
| @tailwindcss/postcss | DevDependency | ✅ | CSS build plugin |
| @types/node | DevDependency | ✅ | Type definitions |
| @types/react | DevDependency | ✅ | Type definitions |
| @types/react-dom | DevDependency | ✅ | Type definitions |
| eslint | DevDependency | ✅ | Linter |
| eslint-config-next | DevDependency | ✅ | Linter config |
| shadcn | DevDependency | ✅ | CLI + CSS |
| tailwindcss | DevDependency | ✅ | CSS framework |
| tw-animate-css | DevDependency | ✅ | CSS animations |
| typescript | DevDependency | ✅ | Type checker |

---

## Action Items

1. **Remove `openai` dependency** (unused, all AI uses Gemini)
   ```bash
   cd /Users/forrestmiller/Claude/projects/GongWizard/gongwizard
   npm uninstall openai
   npm run build  # Verify no regressions
   ```

2. **Verify `@playwright/test` is intentional** — It's correctly placed; no action needed. Confirmed working per CLAUDE.md (line 151).

3. **All implicit uses (PostCSS, Tailwind, shadcn) are correct** — No changes required.

---

## Audit Methodology

1. **Extract all declared packages** from `package.json` via jq
2. **Scan source code** for import statements: `grep -r "^import.*from|^require"` across `src/**/*.{ts,tsx,js,jsx}`
3. **Map imports to package names**, excluding relative paths (`@/`, `./`)
4. **Compare declared vs. imported** using set difference
5. **Verify implicit uses** in config files (postcss.config.mjs, globals.css) and tools (CLI commands)
6. **Check tool integration** for build-time plugins and linters

---

## Related Documentation

- **CLAUDE.md:** `/Users/forrestmiller/Claude/projects/GongWizard/gongwizard/CLAUDE.md`
  - Tech Stack table (lines 52–73)
  - Testing with Playwright section (lines 142–167)
- **package.json:** Dependency declarations
- **postcss.config.mjs:** PostCSS plugin configuration
- **src/app/globals.css:** CSS imports (tw-animate-css, shadcn, tailwindcss)
- **src/lib/ai-providers.ts:** AI integration (Gemini only, no OpenAI)

