# Dependency Audit — GongWizard

**Generated:** 2026-03-02
**Project:** GongWizard (Next.js 16 + Gong API proxy)

## Summary

**Total dependencies:** 24 (12 production + 12 devDependencies)
**Possibly unused:** 4
**Possibly misplaced devDependencies:** 0
**Implicit/config usage:** 3

---

## Dependencies Analysis

### All Dependencies (12 production)

| Package | Version | Import Refs | Status | Notes |
|---------|---------|-------------|--------|-------|
| `next` | 16.1.6 | 12 | ✓ Used | Framework (middleware, routing, navigation) |
| `react` | 19.2.3 | 27 | ✓ Used | Core runtime |
| `react-dom` | 19.2.3 | 0 | ⚠ Unused* | Implicit: Next.js includes it; used by Radix/shadcn indirectly |
| `lucide-react` | 0.575.0 | 7 | ✓ Used | Icons (Eye, EyeOff, Lock, Shield, etc.) |
| `radix-ui` | 1.4.3 | 12 | ✓ Used | Headless UI primitives (for shadcn components) |
| `cmdk` | 1.1.1 | 1 | ✓ Used | Command/search UI (imported by shadcn Command) |
| `class-variance-authority` | 0.7.1 | 5 | ✓ Used | Style composition in UI components |
| `clsx` | 2.1.1 | 1 | ✓ Used | Conditional class names utility |
| `tailwind-merge` | 3.5.0 | 1 | ✓ Used | Merge Tailwind classes without conflicts |
| `date-fns` | 4.1.0 | 1 | ✓ Used | Date formatting (`format`, `subDays`) |
| `react-day-picker` | 9.14.0 | 1 | ✓ Used | Calendar component (shadcn Calendar dependency) |
| `@playwright/test` | 1.58.2 | 0 | ⚠ Unused | E2E testing framework; no test files found in `src/` |

### All DevDependencies (12 devDependencies)

| Package | Version | Import Refs | Status | Notes |
|----------|---------|-------------|--------|-------|
| `typescript` | ^5 | 0 | ✓ Used | Build/type-checking (implicit via Next.js) |
| `eslint` | ^9 | 0 | ✓ Used | Linting (npm run lint) |
| `eslint-config-next` | 16.1.6 | 0 | ✓ Used | ESLint config for Next.js |
| `@types/react` | ^19 | 0 | ✓ Used | TypeScript types for React |
| `@types/react-dom` | ^19 | 0 | ✓ Used | TypeScript types for React DOM |
| `@types/node` | ^20 | 0 | ✓ Used | TypeScript types for Node.js (Next.js server) |
| `tailwindcss` | ^4 | 0 | ✓ Used* | Config file reference + CSS @import |
| `@tailwindcss/postcss` | ^4 | 0 | ✓ Used* | PostCSS plugin (implicit via next.config) |
| `shadcn` | 3.8.5 | 0 | ✓ Used* | CLI tool + config (components.json) + CSS imports |
| `tw-animate-css` | 1.4.0 | 0 | ✓ Used* | CSS @import in globals.css |
| `postcss` | — | — | — | Not listed, but required by tailwindcss (implicit peer) |
| (none listed) | — | — | — | — |

---

## Flagged Items

### Possibly Unused Dependencies (4)

These dependencies have ZERO import statements in source code (`src/`):

#### 1. **@playwright/test** (^1.58.2)
- **Package Purpose:** E2E testing framework for browser automation and testing
- **Import Count:** 0
- **Files:** No `.spec.ts`, `.test.ts`, or test files found in `src/`
- **Recommendation:** Remove if no automated tests are planned. If testing is planned, move to a separate test directory structure.

#### 2. **react-dom** (19.2.3)
- **Package Purpose:** React DOM rendering library
- **Import Count:** 0 direct imports
- **Note:** While directly unused, `react-dom` is a critical peer dependency for:
  - Next.js runtime (hydration)
  - Radix UI components (internal DOM rendering)
  - shadcn/ui component internals
  - React 19 app initialization
- **Status:** KEEP — Essential for runtime, even if not explicitly imported in source.

#### 3. **shadcn** (3.8.5)
- **Package Purpose:** shadcn CLI tool for installing component primitives
- **Import Count:** 0 direct imports
- **Implicit Usage:**
  - Referenced in `components.json` (shadcn configuration)
  - CSS imported in `src/app/globals.css`: `@import "shadcn/tailwind.css";`
  - CLI tool used during development (`npx shadcn-ui add <component>`)
- **Status:** KEEP — Used as CLI tool and CSS import; supports all 15 shadcn/ui components in `src/components/ui/`.

#### 4. **tw-animate-css** (1.4.0)
- **Package Purpose:** Tailwind CSS animation utilities
- **Import Count:** 0 direct imports
- **Implicit Usage:**
  - CSS @import in `src/app/globals.css`: `@import "tw-animate-css";` (line 2)
  - Provides animation classes like `animate-spin` used in JSX (e.g., `<Loader2 className="animate-spin" />`)
- **Status:** KEEP — Used via CSS import for animation classes.

---

## Possibly Misplaced DevDependencies

**None found.** All devDependencies are correctly placed:
- Type definitions (`@types/*`) are devDeps ✓
- Build tools (`typescript`, `eslint`, `tailwindcss`) are devDeps ✓
- Config dependencies (`@tailwindcss/postcss`, `eslint-config-next`) are devDeps ✓
- CLI tools (`shadcn`) are devDeps ✓

---

## Implicit/Config-Based Usage

Three dependencies are used implicitly through configuration or CSS, not direct imports:

### 1. **shadcn** (3.8.5)
- CSS import: `@import "shadcn/tailwind.css";` in `src/app/globals.css`
- Config reference: `components.json` (`$schema: https://ui.shadcn.com/schema.json`)
- Provides 15 UI components in `src/components/ui/` (Badge, Button, Calendar, Card, etc.)

### 2. **tw-animate-css** (1.4.0)
- CSS import: `@import "tw-animate-css";` in `src/app/globals.css`
- Runtime usage: Animation classes like `animate-spin` used in JSX

### 3. **@tailwindcss/postcss** (^4)
- PostCSS plugin (implicit via `next.config.ts` and Tailwind v4 integration)
- Processes `@import "tailwindcss";` in `src/app/globals.css`
- Not directly imported, but required for CSS processing pipeline

---

## Recommendations

### Keep All Current Dependencies

**No changes recommended.** Rationale:

1. **react-dom:** Essential peer dependency, even if not explicitly imported.
2. **shadcn:** CLI tool + CSS library; supports all UI component structure.
3. **tw-animate-css:** Provides animation utilities via CSS import.
4. **@playwright/test:** Unused now, but if E2E testing is planned, it's properly categorized as a devDep.

### If E2E Tests Are Not Planned

Remove `@playwright/test`:
```bash
npm uninstall @playwright/test
```

This would reduce bundle size slightly (though it's a devDep, not shipped to production).

---

## Dependency Count Summary

| Category | Count |
|----------|-------|
| Total Production Dependencies | 12 |
| Total DevDependencies | 12 |
| **Total** | **24** |
| Unused (not recommended to remove) | 3 |
| Truly Unused (safe to remove) | 1 |

---

## Files Analyzed

- Source: `src/middleware.ts`, `src/app/page.tsx`, `src/app/calls/page.tsx`, `src/app/gate/page.tsx`, `src/app/api/auth/route.ts`, `src/app/api/gong/*.ts`, `src/lib/gong-api.ts`, `src/components/ui/*.tsx`
- Config: `components.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`
- CSS: `src/app/globals.css`
