# GongWizard

Last doc-update: 2026-03-04

Web app that helps Gong customers export call transcripts optimized for AI analysis in ChatGPT, Claude, and other LLMs. Also includes an AI-powered research pipeline for finding extraction and synthesis across selected calls.

## Table of Contents
- [Architecture Decisions](#architecture-decisions)
- [Tech Stack](#tech-stack)
- [Key Paths](#key-paths)
- [Environment Variables](#environment-variables)
- [Run Commands](#run-commands)
- [Testing with Playwright](#testing-with-playwright)
- [Generated Documentation](#generated-documentation)
- [Gong API Endpoints Used](#gong-api-endpoints-used)
- [PREVIOUS VERSIONS — READ BEFORE BUILDING NEW FEATURES](#previous-versions--read-before-building-new-features)

## Architecture Decisions

- **Two-layer auth**: Site password gate (`gw-auth` cookie, 7-day, httpOnly) enforced by middleware → then user supplies Gong API credentials on Connect page.
- **Stateless proxy**: Client sends credentials via `X-Gong-Auth` header → API routes forward as HTTP Basic auth to Gong → return results. No server state, no DB.
- **Speaker classification**: Derived from `/v2/users` email domains (replaces Google Sheets config from v1). Internal vs. external determined by domain match.
- **Extensive-first**: Try `/v2/calls/extensive` for full metadata. Falls back to basic `/v2/calls` data if 403 (scope issue).
- **All business logic in browser**: Speaker classification, transcript grouping, filtering, filler removal, monologue condensing, token estimation, and all export renderers run client-side. Export logic lives in `src/hooks/useCallExport.ts` and `src/lib/transcript-formatter.ts`.
- **Output formats**: Markdown (ChatGPT upload), XML (Claude structure), JSONL (structured), summary CSV, utterance-level CSV.
- **Rate limiting**: 350 ms delay between paginated/batched Gong API requests in all proxy routes. Exponential backoff with up to 5 retries.
- **SessionStorage key**: `gongwizard_session` holds `authHeader`, `users`, `trackers`, `workspaces`, `internalDomains`, `baseUrl`. Cleared when tab closes.
- **LocalStorage key**: `gongwizard_filters` persists numeric/boolean filter state (duration range, talk ratio range, excludeInternal, minExternalSpeakers) across page reloads.
- **AI research pipeline**: `AnalyzePanel` runs a four-stage pipeline — (1) score calls for relevance via `gemini-2.5-flash-lite`, (2) surgical transcript extraction reducing full transcripts to dense evidence, (3) finding extraction via `gemini-2.5-pro`, (4) synthesis + follow-up Q&A. All via `/api/analyze/*` routes. Credentials: `GEMINI_API_KEY` server-side only.
- **Transcript surgery**: `src/lib/transcript-surgery.ts` filters utterances to relevant sections, strips greetings/closings (first/last 60s, <8 words), enriches external utterances with context, flags long internal monologues for AI-assisted condensing.
- **Tracker alignment**: Four-step algorithm ported from GongWizard v2 — exact containment → ±3s fallback → speaker preference → closest midpoint.

## Tech Stack

| Category | Technology | Version | Purpose |
| --- | --- | --- | --- |
| Framework | Next.js | 16.1.6 | App Router, Route Handlers, Edge Middleware, Turbopack dev server |
| Language | TypeScript | ^5 | Type safety across all source files |
| UI Runtime | React | 19.2.3 | Client components, hooks |
| Styling | Tailwind CSS | ^4 | Utility-first CSS; CSS variable theming |
| Styling | tw-animate-css | ^1.4.0 | Animation utilities |
| Component Library | shadcn/ui | ^3.8.5 (dev CLI) | Component scaffolding |
| Component Primitives | radix-ui | ^1.4.3 | Accessible headless UI (Checkbox, Tabs, Slider, ScrollArea, Separator, Label, Dialog, Popover) |
| Style Utilities | class-variance-authority | ^0.7.1 | Variant-based className composition |
| Style Utilities | clsx | ^2.1.1 | Conditional className joining |
| Style Utilities | tailwind-merge | ^3.5.0 | Tailwind class conflict resolution in `cn()` |
| Icons | lucide-react | ^0.575.0 | SVG icon library |
| Command Menu | cmdk | ^1.1.1 | Command palette primitive |
| Date Picker | react-day-picker | ^9.14.0 | Calendar/date range picker |
| Date Utilities | date-fns | ^4.1.0 | Date formatting in export filenames |
| AI Provider | @google/genai | ^1.43.0 | `gemini-2.5-flash-lite` (scoring, truncation) and `gemini-2.5-pro` (analysis, synthesis, follow-up) |
| OpenAI SDK | openai | ^6.25.0 | In package.json; not used in current route handlers |
| ZIP Export | client-zip | ^2.5.0 | Browser-side ZIP creation for bulk transcript exports |
| Testing | @playwright/test | ^1.58.2 | End-to-end smoke tests |
| Linting | ESLint | ^9 | Code quality (`eslint-config-next` 16.1.6) |
| Deployment | Vercel | — | Serverless; `maxDuration = 60` on batch-run, run, synthesize, and followup routes |

Stateless — no database, credentials in sessionStorage only.

## Key Paths

### Pages & Middleware

- `src/middleware.ts` — Edge middleware; enforces site-level auth (`gw-auth` cookie) on every request
- `src/app/gate/page.tsx` — Site password prompt (GatePage)
- `src/app/page.tsx` — Step 1: Connect (Gong API key entry, builds authHeader, saves session)
- `src/app/calls/page.tsx` — Step 2: Browse, filter, select, export calls; hosts AnalyzePanel
- `src/app/layout.tsx` — Root layout; loads Geist/Geist Mono fonts

### Auth API

- `src/app/api/auth/route.ts` — POST /api/auth; validates `SITE_PASSWORD`, sets httpOnly `gw-auth` cookie (7-day)

### Gong Proxy API Routes

- `src/app/api/gong/connect/route.ts` — Proxy: fetches users, trackers, workspaces; derives internalDomains
- `src/app/api/gong/calls/route.ts` — Proxy: paginates call list, batches extensive metadata fetch (30-day chunks, 365-day max)
- `src/app/api/gong/transcripts/route.ts` — Proxy: batched transcript monologue fetch (50 per batch)
- `src/app/api/gong/search/route.ts` — Streaming keyword search across transcripts; returns NDJSON

### AI Analysis API Routes

- `src/app/api/analyze/score/route.ts` — Relevance scoring (`gemini-2.5-flash-lite`, scores 0–10 per call)
- `src/app/api/analyze/process/route.ts` — Smart truncation of long internal rep monologues (`gemini-2.5-flash-lite`)
- `src/app/api/analyze/run/route.ts` — Single-call finding extraction (`gemini-2.5-pro`; `maxDuration = 60`)
- `src/app/api/analyze/batch-run/route.ts` — Multi-call finding extraction (`gemini-2.5-pro`; `maxDuration = 60`)
- `src/app/api/analyze/synthesize/route.ts` — Cross-call synthesis (`gemini-2.5-pro`; `maxDuration = 60`)
- `src/app/api/analyze/followup/route.ts` — Follow-up Q&A against cached evidence (`gemini-2.5-pro`; `maxDuration = 60`)

### Components & Hooks

- `src/components/analyze-panel.tsx` — AI research panel; orchestrates four-stage analysis pipeline
- `src/hooks/useCallExport.ts` — All export logic: fetch transcripts, assemble CallForExport, dispatch to formatter
- `src/hooks/useFilterState.ts` — Filter state management; persists to localStorage, keeps text/multi-select in React state
- `src/components/ui/` — 15 shadcn/ui primitives: Badge, Button, Calendar, Card, Checkbox, Command, Dialog, Input, Label, MultiSelect, Popover, ScrollArea, Separator, Slider, Tabs

### Lib Modules

- `src/lib/gong-api.ts` — Shared Gong API utilities: `GongApiError`, `makeGongFetch`, `handleGongError`, rate limit + batch constants, exponential backoff
- `src/lib/ai-providers.ts` — Gemini abstraction: `cheapCompleteJSON` (`gemini-2.5-flash-lite`) and `smartCompleteJSON`/`smartStream` (`gemini-2.5-pro`)
- `src/lib/transcript-formatter.ts` — All export rendering: `buildMarkdown`, `buildXML`, `buildJSONL`, `buildCSVSummary`, `buildUtteranceCSV`, `buildExportContent`
- `src/lib/transcript-surgery.ts` — Surgical transcript extraction for AI analysis: `performSurgery`, `formatExcerptsForAnalysis`, `buildSmartTruncationPrompt`
- `src/lib/tracker-alignment.ts` — Aligns tracker occurrences to utterances; `buildUtterances`, `alignTrackersToUtterances`
- `src/lib/filters.ts` — Pure filter predicates for call list: `matchesTextSearch`, `matchesTrackers`, `matchesTopics`, `matchesDurationRange`, `matchesTalkRatioRange`, `matchesParticipantName`, `matchesMinExternalSpeakers`, `matchesAiContentSearch`
- `src/lib/session.ts` — Thin `sessionStorage` wrapper: `saveSession`, `getSession` for `gongwizard_session` key
- `src/lib/format-utils.ts` — `formatDuration`, `formatTimestamp`, `isInternalParty`, `truncateToFirstSentence`
- `src/lib/token-utils.ts` — `estimateTokens` (length/4), `contextLabel` (model name thresholds up to 200K), `contextColor`
- `src/lib/browser-utils.ts` — `downloadFile` (ephemeral `<a>` + `URL.createObjectURL`)
- `src/lib/utils.ts` — `cn()` utility (clsx + tailwind-merge)
- `src/types/gong.ts` — All shared TypeScript interfaces: `GongCall`, `GongParty`, `GongSession`, `TranscriptMonologue`, `ScoredCall`, `AnalysisFinding`, `SynthesisTheme`, etc.

## Environment Variables

| Name | Purpose | Required |
|---|---|---|
| `SITE_PASSWORD` | Password checked on gate page to issue `gw-auth` session cookie | Required |
| `GEMINI_API_KEY` | API key for Google Gemini (`gemini-2.5-flash-lite` and `gemini-2.5-pro`) | Required for AI analysis features |

Gong API credentials are user-supplied at runtime, passed via `X-Gong-Auth` header, and held only in browser `sessionStorage` under `gongwizard_session`. Never persisted server-side.

## Run Commands

```bash
npm run dev     # Dev server (Turbopack — enabled by default in Next.js 16)
npm run build   # Production build
npm run start   # Start production server
npm run lint    # ESLint
```

## Testing with Playwright

A project-scoped skill handles all auth and credential injection automatically.

**Run the smoke test (22 checks — gate, session, load calls, export tabs, utterance CSV, transcript search):**
```bash
python3 .claude/skills/gongwizard-test/test_smoke.py
```

**Write a new test:**
```python
import sys
sys.path.insert(0, '.claude/skills/gongwizard-test')
from base_session import setup_page, BASE_URL
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context().new_page()
    setup_page(page)                          # handles gate + session injection
    page.goto(f'{BASE_URL}/calls')
    page.wait_for_load_state('networkidle')
    # ... your test logic ...
    browser.close()
```

`setup_page()` reads `GONG_DEV_ACCESS_KEY` / `GONG_DEV_SECRET_KEY` from `.env.local`, passes the site gate (`RingMyBell`), and injects the Gong session into `sessionStorage` — no manual credential handling needed.

Skill files: `.claude/skills/gongwizard-test/` — `SKILL.md` (full docs), `base_session.py` (helper), `test_smoke.py` (smoke test).

## Generated Documentation

Full auto-generated docs in `docs/generated/`. See [`docs/generated/README.md`](docs/generated/README.md) for the index.

- [`architecture-overview.md`](docs/generated/architecture-overview.md) — System design, component relationships, tech stack
- [`api-routes.md`](docs/generated/api-routes.md) — All HTTP endpoints with request/response schemas and auth details
- [`component-tree.md`](docs/generated/component-tree.md) — Page hierarchy, component structure, hooks, UI library usage
- [`data-flows.md`](docs/generated/data-flows.md) — Sequence diagrams for auth, connection, call fetch, and export pipelines
- [`lib-modules.md`](docs/generated/lib-modules.md) — Shared library code, dependency graph, configuration constants
- [`configuration-reference.md`](docs/generated/configuration-reference.md) — Env vars, build config, feature flags, third-party services

Regenerate: run `/doc-update` in Claude Code from within the project directory.

## Gong API Endpoints Used

| Endpoint | Method | Batching | Purpose |
|---|---|---|---|
| `/v2/users` | GET (paginated) | — | Internal speaker detection; extract email domains |
| `/v2/settings/trackers` | GET (paginated) | — | Company keyword trackers |
| `/v2/workspaces` | GET | — | Workspace list for optional filtering |
| `/v2/calls` | GET (paginated) | — | Basic call list (IDs + date range); 30-day chunks |
| `/v2/calls/extensive` | POST | 10 per batch | Full metadata: parties, topics, trackers, brief, CRM context, outline, interactionStats |
| `/v2/calls/transcript` | POST | 50 per batch | Transcript monologues (speakerId, text, start time) |

All proxy routes accept an optional `baseUrl` in the POST body (default: `https://api.gong.io`) to support custom Gong instance URLs.

## PREVIOUS VERSIONS — READ BEFORE BUILDING NEW FEATURES

GongWizard v4 (this repo) was built from scratch in Next.js, but **three prior Python versions exist** with features, patterns, and lessons that MUST be consulted before implementing anything that might already be solved. All three live in sibling directories under `/Users/forrestmiller/Claude/projects/GongWizard/`.

| Version | Directory | Key Differentiator | Full Docs |
|---------|-----------|-------------------|-----------|
| **v1 — gong-wizard-uri** | `../gong-wizard-uri/gong-wizard-web-main/` | Most feature-rich: OAuth login, Claude AI analysis, chatbot, advanced export | `../gong-wizard-uri/gong-wizard-web-main/DOCUMENTATION.md` |
| **v2 — gong-wizard-two** | `../gong-wizard-two-main/` | Utterance-level output, tracker alignment, 18 config tabs, most granular controls | `../gong-wizard-two-main/DOCUMENTATION.md` |
| **v3 — gong-wizard-web** | `../gong-wizard-web-main/` | Simplest: no auth, no AI, stateless creds — closest to v4's architecture | `../gong-wizard-web-main/DOCUMENTATION.md` |

Each `DOCUMENTATION.md` covers: routes, pipeline, config, output formats, and design decisions.

**When to consult these:**
- Adding a feature → check if a prior version already implemented it
- Debugging Gong API behavior → v1 has the most battle-tested API handling
- Export format questions → v2 has the most format options and configurability
- Architecture decisions → v3 is the most similar to v4's stateless proxy model

### Other Reference Materials

- **Gong API reference:** `../gong_api_full_reference_COMPLETE.docx.md` (1,942 lines, authoritative)
- **Raw call data samples:** `../Call summaries/`
