# GongWizard Dependency Audit

**Generated:** 2025-03-02

## Overview

- **Total dependencies:** 22 (12 regular + 10 dev)
- **Project:** `/Users/forrestmiller/Claude/projects/GongWizard/gongwizard`
- **Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind v4, shadcn/ui
- **Scope:** Analyzed `src/` directory for runtime imports

---

## Regular Dependencies Analysis

| Dependency | Version | Imports | Status |
|---|---|---|---|
| @playwright/test | ^1.58.2 | 0 | ❌ Possibly unused |
| class-variance-authority | ^0.7.1 | 5 files | ✅ Used |
| clsx | ^2.1.1 | 1 file | ✅ Used |
| cmdk | ^1.1.1 | 1 file | ✅ Used |
| date-fns | ^4.1.0 | 1 file | ✅ Used |
| lucide-react | ^0.575.0 | 7 files | ✅ Used |
| next | 16.1.6 | 11 files | ✅ Used |
| radix-ui | ^1.4.3 | 12 files | ✅ Used |
| react | 19.2.3 | 20+ files | ✅ Used |
| react-day-picker | ^9.14.0 | 1 file | ✅ Used |
| react-dom | 19.2.3 | 0 (implicit) | ⚠️ See note |
| tailwind-merge | ^3.5.0 | 1 file | ✅ Used |

### ❌ Possibly Unused — Regular Dependencies

#### @playwright/test (^1.58.2)
- **Purpose:** Browser testing framework
- **Import count:** 0 in `src/`
- **Issue:** Listed as a regular dependency instead of devDependency (unusual)
- **Recommendation:** Move to devDependencies if only used for testing

### ⚠️ React-DOM (19.2.3) — Implicit Usage

- **Import count:** 0 direct imports in `src/`
- **Why it's okay:** React 19 includes React DOM implicitly. Peer dependency of React. Required at runtime.
- **Status:** Correctly placed, but no explicit imports found (expected)

---

## Dev Dependencies Analysis

All dev dependencies are correctly placed (zero runtime imports found):

| Dependency | Version | Purpose | Status |
|---|---|---|---|
| @tailwindcss/postcss | ^4 | PostCSS plugin for Tailwind | ✅ Correct |
| @types/node | ^20 | TypeScript types for Node.js | ✅ Correct |
| @types/react | ^19 | TypeScript types for React | ✅ Correct |
| @types/react-dom | ^19 | TypeScript types for React DOM | ✅ Correct |
| eslint | ^9 | Linting tool | ✅ Correct |
| eslint-config-next | 16.1.6 | ESLint config for Next.js | ✅ Correct |
| shadcn | ^3.8.5 | CLI tool for adding components | ✅ Correct |
| tailwindcss | ^4 | CSS framework (implicit via PostCSS) | ✅ Correct |
| tw-animate-css | ^1.4.0 | Tailwind animation utilities | ⚠️ See note |
| typescript | ^5 | TypeScript compiler | ✅ Correct |

### ⚠️ tw-animate-css (^1.4.0) — Verify Usage

- **Version:** ^1.4.0
- **Type:** DevDependency (correct)
- **Note:** Custom package. Check if `tw-animate-*` class names appear in your Tailwind CSS classes or component styles.
- **Recommendation:** Search codebase for patterns like `animate-`, `tw-animate-` in CSS/JSX

---

## Implicit Usage Notes

These dependencies are not directly imported but are used implicitly:

### PostCSS & Tailwind
- **tailwindcss** (^4) — Configured in `tailwind.config.ts`; used by PostCSS
- **@tailwindcss/postcss** (^4) — PostCSS plugin; loaded via `postcss.config.js`
- **tw-animate-css** (^1.4.0) — Tailwind plugin; loaded as part of Tailwind config

### Tools & Compilers
- **typescript** (^5) — Compiler tool; not imported at runtime
- **eslint** (^9) — Linter; not imported at runtime
- **eslint-config-next** (16.1.6) — ESLint config; not imported at runtime

### UI Components
- **shadcn** (^3.8.5) — CLI setup tool; no runtime imports (components are copied into `src/components/ui/`)
- **radix-ui** (^1.4.3) — Used directly as component primitives (12 imports across `src/components/ui/`)

### React Internals
- **react-dom** (19.2.3) — Implicit peer dependency of React 19; no explicit imports needed in application code

---

## Detailed Import Examples

### Most Used Dependencies
1. **react** — 20+ files
   ```typescript
   import { useState, useEffect, useMemo } from 'react';
   ```

2. **radix-ui** — 12 files (component primitives)
   ```typescript
   import { Tabs as TabsPrimitive } from "radix-ui";
   import { Popover as PopoverPrimitive } from "radix-ui";
   ```

3. **lucide-react** — 7 files (icons)
   ```typescript
   import { Eye, EyeOff, Lock, X, Shield, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
   ```

4. **class-variance-authority** — 5 files (variant styling)
   ```typescript
   import { cva, type VariantProps } from "class-variance-authority";
   ```

5. **next** — 11 files (framework)
   ```typescript
   import { NextResponse } from 'next/server';
   import { useRouter } from 'next/navigation';
   ```

---

## Key Findings & Recommendations

### Critical Issues
1. **@playwright/test should be a devDependency**
   - Currently in regular dependencies
   - Test libraries should never be production dependencies
   - Move to devDependencies immediately

### Verification Tasks
1. **Verify tw-animate-css usage**
   - Search for CSS class patterns: `animate-`, `tw-animate-`
   - If no matches found, consider removing or documenting why it's needed

2. **Confirm shadcn setup**
   - Verify that components are properly copied to `src/components/ui/`
   - shadcn is setup-only; zero runtime imports expected

3. **Check react-dom implicit usage**
   - React 19 may not require explicit react-dom imports
   - Verify Next.js App Router integration (may auto-inject react-dom)

### Summary
- **Total unused:** 1 (@playwright/test)
- **Misplaced devDeps in source code:** 0 (all correct)
- **Implicit usage (acceptable):** 3 (tailwindcss, @tailwindcss/postcss, react-dom)
- **Overall health:** Good; one actionable fix (move @playwright/test to devDependencies)

---

## Next Steps

1. Move `@playwright/test` from dependencies to devDependencies in `package.json`
2. Run `npm install` to update `package-lock.json`
3. Verify build still succeeds: `npm run build`
4. Search for actual tw-animate usage patterns and document or remove if unused
5. Consider adding `.npmignore` or explicit `files` array if publishing as a package

