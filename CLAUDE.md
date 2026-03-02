# GongWizard

Last doc-update: 2026-03-02

Web app that helps Gong customers export call transcripts optimized for AI analysis in ChatGPT, Claude, and other LLMs.

## Table of Contents
- [Architecture Decisions](#architecture-decisions)
- [Tech Stack](#tech-stack)
- [Key Paths](#key-paths)
- [Environment Variables](#environment-variables)
- [Run Commands](#run-commands)
- [Gong API Endpoints Used](#gong-api-endpoints-used)
- [Generated Documentation](#generated-documentation)
- [Reference Code & Legacy](#reference-code--legacy)

## Architecture Decisions

- **Two-layer auth**: Site password gate (`gw-auth` cookie, 7-day, httpOnly) enforced by middleware → then user supplies Gong API credentials on Connect page.
- **Stateless proxy**: Client sends credentials via `X-Gong-Auth` header → API routes forward as HTTP Basic auth to Gong → return results. No server state, no DB.
- **Speaker classification**: Derived from `/v2/users` email domains (replaces Google Sheets config from v1). Internal vs. external determined by domain match.
- **Extensive-first**: Try `/v2/calls/extensive` for full metadata. Falls back to basic `/v2/calls` data if 403 (scope issue).
- **All business logic in browser**: Speaker classification, transcript grouping, filtering, filler removal, monologue condensing, token estimation, and all export renderers run client-side in `src/app/calls/page.tsx`.
- **Output formats**: Markdown (ChatGPT upload), XML (Claude structure), JSONL (structured).
- **Rate limiting**: 350 ms delay between paginated/batched Gong API requests in all three proxy routes.
- **SessionStorage key**: `gongwizard_session` holds `authHeader`, `users`, `trackers`, `workspaces`, `internalDomains`, `baseUrl`. Cleared when tab closes.

## Tech Stack

| Category | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.1.6 |
| Language | TypeScript | ^5 |
| UI Runtime | React | 19.2.3 |
| Styling | Tailwind CSS | ^4 |
| Styling | tw-animate-css | ^1.4.0 |
| Component Library | shadcn/ui | — |
| Component Primitives | radix-ui | ^1.4.3 |
| Component Primitives | cmdk | ^1.1.1 |
| Component Primitives | react-day-picker | ^9.14.0 |
| Icons | lucide-react | ^0.575.0 |
| Styling Utilities | class-variance-authority | ^0.7.1 |
| Styling Utilities | clsx | ^2.1.1 |
| Styling Utilities | tailwind-merge | ^3.5.0 |
| Date Utilities | date-fns | ^4.1.0 |
| Testing | @playwright/test | ^1.58.2 |
| Linting | ESLint | ^9 |
| Deployment | Vercel | — |

Stateless — no database, credentials in sessionStorage only.

## Key Paths

- `src/middleware.ts` — Edge middleware; enforces site-level auth (`gw-auth` cookie) on every request
- `src/app/gate/page.tsx` — Site password prompt (GatePage)
- `src/app/api/auth/route.ts` — POST /api/auth; validates `SITE_PASSWORD`, sets httpOnly `gw-auth` cookie (7-day)
- `src/app/page.tsx` — Step 1: Connect (Gong API key entry, builds authHeader, saves session)
- `src/app/calls/page.tsx` — Step 2: Browse, filter, select, export calls (all client-side business logic lives here)
- `src/app/api/gong/connect/route.ts` — Proxy: fetches users, trackers, workspaces; derives internalDomains
- `src/app/api/gong/calls/route.ts` — Proxy: paginates call list, batches extensive metadata fetch
- `src/app/api/gong/transcripts/route.ts` — Proxy: batched transcript monologue fetch
- `src/app/layout.tsx` — Root layout; loads Geist/Geist Mono fonts
- `src/components/ui/` — 15 shadcn/ui primitives (Badge, Button, Calendar, Card, Checkbox, Command, Dialog, Input, Label, Popover, ScrollArea, Separator, Tabs, Toggle, ToggleGroup, Tooltip)
- `src/lib/gong-api.ts` — Shared Gong API utilities (GongApiError, makeGongFetch, handleGongError, rate limit + batch constants)
- `src/lib/utils.ts` — `cn()` utility (clsx + tailwind-merge)

## Environment Variables

| Name | Purpose | Required |
|---|---|---|
| `SITE_PASSWORD` | Password checked on gate page to issue `gw-auth` session cookie | Required |

No other `process.env` references exist. Gong API credentials are user-supplied at runtime, passed via `X-Gong-Auth` header, and held only in browser `sessionStorage` under `gongwizard_session`.

## Run Commands

```bash
npm run dev     # Dev server (Turbopack — enabled by default in Next.js 16)
npm run build   # Production build
npm run lint    # ESLint
```

## Gong API Endpoints Used

| Endpoint | Method | Batching | Purpose |
|---|---|---|---|
| `/v2/users` | GET (paginated) | — | Internal speaker detection; extract email domains |
| `/v2/settings/trackers` | GET (paginated) | — | Company keyword trackers |
| `/v2/workspaces` | GET | — | Workspace list for optional filtering |
| `/v2/calls` | GET (paginated) | — | Basic call list (IDs + date range) |
| `/v2/calls/extensive` | POST | 10 per batch | Full metadata: parties, topics, trackers, brief, CRM context |
| `/v2/calls/transcript` | POST | 50 per batch | Transcript monologues (speakerId, text, start time) |

All proxy routes accept an optional `baseUrl` in the POST body (default: `https://api.gong.io`) to support custom Gong instance URLs.

## Generated Documentation

Full auto-generated docs in `docs/generated/`. See [`docs/generated/README.md`](docs/generated/README.md) for the index.

- [`architecture-overview.md`](docs/generated/architecture-overview.md) — System design, component relationships, tech stack
- [`api-routes.md`](docs/generated/api-routes.md) — All HTTP endpoints with request/response schemas and auth details
- [`component-tree.md`](docs/generated/component-tree.md) — Page hierarchy, component structure, hooks, UI library usage
- [`data-flows.md`](docs/generated/data-flows.md) — Sequence diagrams for auth, connection, call fetch, and export pipelines
- [`lib-modules.md`](docs/generated/lib-modules.md) — Shared library code, dependency graph, configuration constants
- [`configuration-reference.md`](docs/generated/configuration-reference.md) — Env vars, build config, feature flags, third-party services

Regenerate: run `/doc-update` in Claude Code from within the project directory.

## Reference Code & Legacy

- Python v1: `../gong-wizard-uri/gong-wizard-web-main/app.py`
- API docs: `../gong_api_full_reference_COMPLETE.docx.md` (1,942 lines, authoritative)
- Older variants (reference only): `../gong-wizard-two-main/`, `../gong-wizard-web-main/`
- Raw data: `../Call summaries/`

### Legacy Codebase Documentation

Each legacy Python codebase has a full `DOCUMENTATION.md` covering routes, pipeline, config, output formats, and design decisions:
- **gong-wizard-uri** (most feature-rich — OAuth, Claude AI, chatbot): `../gong-wizard-uri/gong-wizard-web-main/DOCUMENTATION.md`
- **gong-wizard-web** (simplest — no auth, no AI, stateless creds): `../gong-wizard-web-main/DOCUMENTATION.md`
- **gong-wizard-two** (utterance-level output, tracker alignment, 18 config tabs): `../gong-wizard-two-main/DOCUMENTATION.md`
