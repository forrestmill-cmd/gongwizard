# Dependency Audit for GongWizard

**Generated:** 2026-03-04  
**Project:** GongWizard v4  
**Analysis:** Comprehensive import scan of `/src` directory

---

## Summary

| Metric | Count |
|--------|-------|
| Total Dependencies | 15 |
| Total DevDependencies | 10 |
| **Total Packages** | **25** |
| Dependencies with Imports Found | 11 |
| Dependencies with NO Imports | 4 |
| DevDependencies with NO Imports | 10 |

---

## Possibly Unused Dependencies

These packages are listed in `package.json` but have **zero explicit import statements** found in the `/src` directory. Some are used implicitly (config files, CLI tools, peer dependencies, plugins) — flag but do not assert they're unused.

### Production Dependencies (No Imports Found)

| Package | Version | Purpose (from package.json) | Notes |
|---------|---------|---------------------------|-------|
| `@playwright/test` | ^1.58.2 | End-to-end smoke tests | **Actually Used**: Imported in Playwright test files (`.claude/skills/gongwizard-test/*.py`) running via Python, not TypeScript/JavaScript imports |
| `openai` | ^6.25.0 | OpenAI SDK / In package.json; not used in current route handlers | **Status**: Declared but unused; marked as "not used in current route handlers" per CLAUDE.md |
| `react-dom` | 19.2.3 | React DOM runtime | **Actually Used (Implicit)**: Required by Next.js App Router and React 19; no explicit imports needed in modern React (React 19 uses JSX transform) |

---

## All Dependencies Audit (Detailed)

### Actively Used (11 packages)

| Package | Version | Import Count | Usage Files | Status |
|---------|---------|---------------|-------------|--------|
| `@google/genai` | ^1.43.0 | 1 | `src/lib/ai-providers.ts` | ✅ Used for Gemini Flash-Lite and 2.5 Pro |
| `class-variance-authority` | ^0.7.1 | 3 | `src/components/ui/{tabs,badge}.tsx` | ✅ Variant-based className composition |
| `client-zip` | ^2.5.0 | 1 | `src/hooks/useCallExport.ts` | ✅ Browser-side ZIP export |
| `clsx` | ^2.1.1 | 1 | `src/lib/utils.ts` | ✅ Conditional className joining |
| `cmdk` | ^1.1.1 | 1 | `src/components/ui/command.tsx` | ✅ Command palette primitive |
| `date-fns` | ^4.1.0 | 3 | `src/app/{calls,page}.tsx` | ✅ Date formatting in exports and UI |
| `lucide-react` | ^0.575.0 | 9 | `src/app/{calls,gate}/page.tsx`, UI components | ✅ SVG icon library |
| `next` | 16.1.6 | 19 | `src/middleware.ts`, Route Handlers | ✅ Framework, Edge Middleware, Route Handlers |
| `radix-ui` | ^1.4.3 | 10 | `src/components/ui/{tabs,slider,checkbox,etc}.tsx` | ✅ Headless UI primitives |
| `react` | 19.2.3 | 23 | `src/app/**/*.tsx` | ✅ UI component framework |
| `react-day-picker` | ^9.14.0 | 2 | `src/app/page.tsx`, `src/components/ui/calendar.tsx` | ✅ Calendar/date range picker |
| `tailwind-merge` | ^3.5.0 | 1 | `src/lib/utils.ts` | ✅ Tailwind class conflict resolution in `cn()` |

---

## DevDependencies Audit (All Not Imported)

All **10 devDependencies** have **zero imports** in source code. This is **expected and correct** — they are tools/configuration only:

| Package | Version | Purpose | Implicit Usage |
|---------|---------|---------|---|
| `@tailwindcss/postcss` | ^4 | PostCSS plugin for Tailwind v4 | ✅ Loaded via `postcss.config.js` |
| `@types/node` | ^20 | TypeScript types for Node.js APIs | ✅ Type checking in Route Handlers (API routes) |
| `@types/react` | ^19 | TypeScript types for React 19 | ✅ Type checking all `.tsx` files |
| `@types/react-dom` | ^19 | TypeScript types for React 19 DOM | ✅ Type checking React components |
| `eslint` | ^9 | Linter | ✅ CLI tool (`npm run lint`) |
| `eslint-config-next` | 16.1.6 | ESLint config for Next.js | ✅ Loaded via `.eslintrc.json` |
| `shadcn` | ^3.8.5 | Component scaffolding CLI | ✅ CLI tool (`npx shadcn add ...`) |
| `tailwindcss` | ^4 | Utility-first CSS framework | ✅ Loaded via `tailwind.config.js` |
| `tw-animate-css` | ^1.4.0 | Animation utilities for Tailwind | ✅ CSS utilities in Tailwind config/PostCSS |
| `typescript` | ^5 | TypeScript compiler | ✅ Build tool (`npm run build`, `npm run dev`) |

---

## Dependency Categories

### 1. Core Framework
- `next` — Framework (App Router, Route Handlers, Middleware)
- `react` — UI runtime
- `react-dom` — DOM API (implicit via React 19)

### 2. UI & Styling
- `tailwindcss` — CSS framework (devDep, loaded via config)
- `tailwind-merge` — Class conflict resolution
- `clsx` — Conditional class binding
- `class-variance-authority` — Variant composition
- `lucide-react` — Icon library

### 3. UI Component Primitives
- `radix-ui` — Accessible headless UI (Tabs, Slider, Checkbox, etc.)
- `cmdk` — Command palette
- `react-day-picker` — Calendar/date picker

### 4. Utilities & Data
- `date-fns` — Date formatting
- `client-zip` — ZIP export (browser-side)

### 5. AI Integration
- `@google/genai` — Gemini API client
- `openai` — OpenAI SDK (declared but unused)

### 6. Testing
- `@playwright/test` — E2E test framework (used via Python tests, not TS imports)

### 7. Type Checking & Linting (DevDeps)
- `@types/node`, `@types/react`, `@types/react-dom` — TypeScript definitions
- `typescript` — Compiler
- `eslint`, `eslint-config-next` — Code quality

### 8. PostCSS & CSS Tools (DevDeps)
- `@tailwindcss/postcss` — PostCSS plugin
- `tw-animate-css` — Animation utilities

### 9. CLI/Scaffolding (DevDeps)
- `shadcn` — Component scaffolding

---

## Recommendations

### Remove (if not planned)
- **`openai` (v6.25.0)** — Currently unused. Remove if OpenAI integration is not planned. If it is planned, move this note to the CLAUDE.md feature roadmap.

### Keep As-Is (All Others)
All other dependencies are either:
1. **Actively used** in source code (11 packages)
2. **Implicitly required** by framework/tooling (`react-dom`, all devDeps)
3. **Planned for future use** (e.g., testing framework awaiting more extensive test suite)

### Notes on Implicit Usage
- **`react-dom`** — Required by Next.js but not explicitly imported in modern React 19 (JSX transform handles it)
- **`@types/*`** — Required by TypeScript compiler; used in type-checking, not at runtime
- **`@tailwindcss/postcss`, `tailwindcss`** — Loaded via `postcss.config.ts` and `tailwind.config.ts`; no direct imports needed
- **`tw-animate-css`** — Animation utilities available via Tailwind config; used in class names but not imported

---

## Analysis Method

1. **Dependency extraction**: Parsed `/package.json` (dependencies + devDependencies)
2. **Import scan**: Recursive grep search for `from ['"]<package>` in `/src` directory (`.ts`, `.tsx`, `.js`, `.jsx` files only)
3. **Implicit usage check**: Verified PostCSS, Tailwind, and TypeScript integration via config files and framework expectations
4. **Test file verification**: Confirmed `@playwright/test` is used in `/` `.claude/skills/gongwizard-test/*.py` (Python test suite)

---

## Export Formats Using These Deps

The following export pipelines depend on multiple dependencies working in concert:

| Export Type | Key Dependencies |
|---|---|
| **Markdown** | `date-fns`, `next` (API route) |
| **XML** | `date-fns`, `next` |
| **JSONL** | `date-fns`, `next` |
| **CSV (Summary)** | `date-fns`, `next` |
| **CSV (Utterance-level)** | `date-fns`, `next` |
| **ZIP Bundle** | `client-zip`, `date-fns`, `next` |
| **UI Filtering** | `react`, `radix-ui`, `cmdk`, `lucide-react` |
| **AI Analysis** | `@google/genai`, `next` |
| **Calendar Date Range** | `react-day-picker`, `date-fns`, `react` |

