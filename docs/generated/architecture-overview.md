# Architecture Overview

## System Overview

GongWizard is a Next.js 15 web application that acts as a stateless proxy between a user's browser and the Gong REST API. Its purpose is to let Gong customers browse their recorded sales calls, select a subset, fetch transcripts, and export them in formats optimized for LLM consumption (Markdown, XML, JSONL). No data is persisted server-side at any layer — there is no database, no session store, and no server-side credential storage.

The application uses a two-layer auth model. A site-level password gate (`/gate`) issues an httpOnly cookie (`gw-auth`) that middleware checks on every page request, restricting access to known users. Once past the gate, users supply their Gong API Access Key and Secret Key on the Connect page (`/`). Those credentials are base64-encoded into an auth header, stored in browser `sessionStorage` under the key `gongwizard_session`, and forwarded with every subsequent API proxy call via the `X-Gong-Auth` request header. Credentials are cleared when the browser tab closes.

All business logic runs client-side in `src/app/calls/page.tsx`: speaker classification (internal vs. external via email domain matching), transcript grouping into turns, filler word removal, monologue condensing, token estimation, and all three export renderers. The three Next.js API routes (`/api/gong/connect`, `/api/gong/calls`, `/api/gong/transcripts`) are thin proxies that accept Gong credentials via `X-Gong-Auth`, forward requests to the Gong API with HTTP Basic auth, handle pagination, batching, and rate limiting, then return normalized JSON to the browser.

---

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Browser["Browser (Client-Side)"]
        A[GatePage\nsrc/app/gate/page.tsx] -->|POST password| B[/api/auth/route.ts]
        B -->|Set gw-auth cookie| C[ConnectPage\nsrc/app/page.tsx]
        C -->|POST X-Gong-Auth header| D[/api/gong/connect/route.ts]
        D -->|users, trackers, workspaces,\ninternalDomains| E[CallsPage\nsrc/app/calls/page.tsx]
        E -->|POST X-Gong-Auth + date range| F[/api/gong/calls/route.ts]
        F -->|normalized GongCall array| E
        E -->|POST X-Gong-Auth + callIds| G[/api/gong/transcripts/route.ts]
        G -->|transcript monologues| E
        E -->|buildMarkdown / buildXML / buildJSONL| H[File Download / Clipboard]
    end

    subgraph Middleware["Edge Middleware\nsrc/middleware.ts"]
        M[Check gw-auth cookie\nRedirect to /gate if missing]
    end

    subgraph GongAPI["Gong REST API\nhttps://api.gong.io"]
        G1[/v2/users]
        G2[/v2/settings/trackers]
        G3[/v2/workspaces]
        G4[/v2/calls]
        G5[/v2/calls/extensive]
        G6[/v2/calls/transcript]
    end

    subgraph Lib["src/lib/"]
        L1[gong-api.ts\nGongApiError, makeGongFetch,\nhandleGongError, constants]
        L2[utils.ts\ncn]
    end

    Browser -->|every page request| Middleware
    D --> G1
    D --> G2
    D --> G3
    F --> G4
    F --> G5
    G --> G6
    D --> L1
    F --> L1
    G --> L1
```

---

## Key Components

### `src/middleware.ts`

Enforces site-level auth on every request at the Next.js Edge layer. Checks for the `gw-auth` cookie (value `"1"`); if absent, redirects to `/gate`. Passes through requests to `/gate`, `/api/`, `/_next/`, and `/favicon` without checking the cookie.

**Key exports:** `middleware` (default), `config` (matcher config).
**Depends on:** `next/server`.
**Depended on by:** All page routes implicitly via Next.js middleware config.

---

### `src/app/gate/page.tsx` — `GatePage`

Client component that renders the site password entry form. Submits a POST to `/api/auth` with the entered password. On success, calls `router.push('/')` to redirect to `ConnectPage`.

**Key exports:** `GatePage` (default export).
**Depends on:** `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Input`, `Label` from `src/components/ui/`; `lucide-react` (`Eye`, `EyeOff`, `Loader2`).

---

### `src/app/api/auth/route.ts`

POST handler that validates the submitted password against `process.env.SITE_PASSWORD`. On match, sets an httpOnly `gw-auth` cookie with a 7-day `maxAge` and returns `{ ok: true }`. Returns 401 on mismatch, 500 if `SITE_PASSWORD` is not configured.

**Key exports:** `POST` (named export, Next.js Route Handler).
**Depends on:** `next/server` (`NextResponse`).

---

### `src/app/page.tsx` — `ConnectPage`

Client component (Step 1 of the user flow). Accepts a Gong Access Key and Secret Key, base64-encodes them into an `authHeader` (`btoa(accessKey + ':' + secretKey)`), and POSTs to `/api/gong/connect` with the result as the `X-Gong-Auth` header. On success, calls `saveSession()` to write the response payload (`users`, `trackers`, `workspaces`, `internalDomains`, `authHeader`, `baseUrl`) to `sessionStorage` under `gongwizard_session`, then navigates to `/calls`.

**Key exports:** `ConnectPage` (default export).
**Key functions:** `saveSession` (module-scoped, writes to `sessionStorage`).
**Depends on:** `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Input`, `Label` from `src/components/ui/`; `lucide-react`.

---

### `src/app/api/gong/connect/route.ts`

POST proxy that initializes a Gong session. Reads `X-Gong-Auth` from request headers. Calls `/v2/users` (paginated), `/v2/settings/trackers` (paginated), and `/v2/workspaces` in parallel via `Promise.allSettled`. Extracts unique email domains from the user list to produce `internalDomains`. Returns all four datasets plus warnings for any failed sub-requests. Contains a local `fetchAllPages` utility that handles cursor-based pagination with `GONG_RATE_LIMIT_MS` delays between pages.

**Key exports:** `POST`.
**Depends on:** `GongApiError`, `sleep`, `makeGongFetch`, `handleGongError`, `GONG_RATE_LIMIT_MS` from `src/lib/gong-api.ts`.

---

### `src/app/api/gong/calls/route.ts`

POST proxy that fetches call metadata for a date range. Two-step process:

1. Paginates `GET /v2/calls` to collect all call IDs in the date range (supports optional `workspaceId` filter).
2. Batches IDs into groups of `EXTENSIVE_BATCH_SIZE` (10) and POSTs each batch to `/v2/calls/extensive` with a `contentSelector` requesting parties, topics, trackers, brief, keyPoints, actionItems, outline, and `Extended` CRM context.

If `/v2/calls/extensive` returns 403 (API scope issue), falls back to basic call data with empty parties/topics/trackers. Normalizes both response shapes to a consistent flat object via `normalizeExtensiveCall`. Contains `extractFieldValues` to navigate Gong's nested `context.objects.fields` structure for CRM account data.

**Key exports:** `POST`.
**Key functions:** `extractFieldValues`, `normalizeExtensiveCall` (both module-scoped).
**Depends on:** `GongApiError`, `sleep`, `makeGongFetch`, `handleGongError`, `GONG_RATE_LIMIT_MS`, `EXTENSIVE_BATCH_SIZE` from `src/lib/gong-api.ts`.

---

### `src/app/api/gong/transcripts/route.ts`

POST proxy that fetches transcript monologues for a list of call IDs. Batches IDs into groups of `TRANSCRIPT_BATCH_SIZE` (50) and POSTs each batch to `/v2/calls/transcript`. Accumulates monologues into a `transcriptMap` keyed by `callId`, handles cursor-based pagination within each batch, then returns an array of `{ callId, transcript }` objects.

**Key exports:** `POST`.
**Depends on:** `sleep`, `makeGongFetch`, `handleGongError`, `GONG_RATE_LIMIT_MS`, `TRANSCRIPT_BATCH_SIZE` from `src/lib/gong-api.ts`.

---

### `src/app/calls/page.tsx` — `CallsPage`

The main application page (Step 2 of the user flow). Contains all client-side business logic. On mount reads `gongwizard_session` from `sessionStorage`; redirects to `/` if absent.

**Call loading.** `loadCalls()` POSTs to `/api/gong/calls` with the date range and optional workspace filter. Processes the response with `isInternalParty` to classify speakers (using `party.affiliation` as primary signal, email domain match as fallback) and extracts active tracker names.

**Filtering.** `filteredCalls` (memoized with `useMemo`) applies text search on title and brief, an `excludeInternal` toggle, and per-tracker filters. `trackerCounts` (also memoized) precomputes how many loaded calls match each tracker.

**Transcript fetch.** `fetchTranscriptsForSelected()` POSTs to `/api/gong/transcripts`, then builds a `speakerMap` from stored party data, flattens all `TranscriptSentence` objects from monologue tracks into chronological order, and calls `groupTranscriptTurns` to merge consecutive same-speaker sentences into `FormattedTurn` objects.

**Export.** `buildExportContent` dispatches to `buildMarkdown`, `buildXML`, or `buildJSONL` based on selected format. Each renderer optionally applies `filterFillerTurns` (removes short social filler via `FILLER_PATTERNS`) and `condenseInternalMonologues` (merges runs of 3+ consecutive turns by the same internal speaker) per `ExportOptions`.

**Token estimation.** `estimateTokens` (~4 chars/token heuristic), `contextLabel`, and `contextColor` display a live context-window fit indicator against common LLM context sizes.

**Key types:** `GongCall`, `ExportOptions`, `Speaker`, `TranscriptSentence`, `FormattedTurn`, `CallForExport`.

**Key functions:** `buildMarkdown`, `buildXML`, `buildJSONL`, `buildExportContent`, `buildCallText`, `groupTranscriptTurns`, `filterFillerTurns`, `condenseInternalMonologues`, `isInternalParty`, `estimateTokens`, `contextLabel`, `contextColor`, `formatDuration`, `formatTimestamp`, `escapeXml`, `downloadFile`, `getSession`, `saveSession`.

**Depends on:** `Badge`, `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Checkbox`, `Input`, `Label`, `Separator`, `Tabs`, `TabsList`, `TabsTrigger` from `src/components/ui/`; `date-fns` (`format`, `subDays`); `lucide-react`.

---

### `src/lib/gong-api.ts`

Shared utilities used by all three Gong proxy routes. Centralizes authenticated fetch construction, error handling, and API constants.

**Key exports:**
- `GongApiError` — Error subclass carrying `status` (HTTP status code) and `endpoint` string fields.
- `makeGongFetch(baseUrl, authHeader)` — Returns a `gongFetch` closure that injects `Authorization: Basic <authHeader>` and `Content-Type: application/json` on every request; throws `GongApiError` on non-2xx responses.
- `handleGongError(error)` — Converts a `GongApiError` or unknown error into an appropriate `NextResponse` JSON error. Maps 401 to `{ error: 'Invalid API credentials' }`, propagates 4xx status codes, falls back to 500.
- `sleep(ms)` — Promise-based delay.
- `GONG_RATE_LIMIT_MS = 350` — Inter-request delay (Gong enforces ~3 req/s).
- `EXTENSIVE_BATCH_SIZE = 10` — Max IDs per `/v2/calls/extensive` POST.
- `TRANSCRIPT_BATCH_SIZE = 50` — Max IDs per `/v2/calls/transcript` POST.

**Depends on:** `next/server` (`NextResponse`).
**Depended on by:** `src/app/api/gong/connect/route.ts`, `src/app/api/gong/calls/route.ts`, `src/app/api/gong/transcripts/route.ts`.

---

### `src/lib/utils.ts`

Single utility `cn` that merges Tailwind class strings using `clsx` and `tailwind-merge`.

**Key exports:** `cn`.
**Depended on by:** All 15 `src/components/ui/` components.

---

### `src/components/ui/` (15 components)

shadcn/ui component primitives. All are styled wrappers over Radix UI primitives (via `radix-ui` package) or `cmdk`, using Tailwind classes and `class-variance-authority` for variant handling. No application-specific logic.

| File | Primitive / Library | Key exports |
|---|---|---|
| `badge.tsx` | `radix-ui` Slot | `Badge`, `badgeVariants` |
| `button.tsx` | `radix-ui` Slot | `Button`, `buttonVariants` |
| `calendar.tsx` | `react-day-picker` DayPicker | `Calendar`, `CalendarDayButton` |
| `card.tsx` | HTML `div` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` |
| `checkbox.tsx` | `radix-ui` Checkbox | `Checkbox` |
| `command.tsx` | `cmdk` Command | `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator` |
| `dialog.tsx` | `radix-ui` Dialog | `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger` |
| `input.tsx` | HTML `input` | `Input` |
| `label.tsx` | `radix-ui` Label | `Label` |
| `popover.tsx` | `radix-ui` Popover | `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription` |
| `scroll-area.tsx` | `radix-ui` ScrollArea | `ScrollArea`, `ScrollBar` |
| `separator.tsx` | `radix-ui` Separator | `Separator` |
| `tabs.tsx` | `radix-ui` Tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `tabsListVariants` |
| `toggle.tsx` | `radix-ui` Toggle | `Toggle`, `toggleVariants` |
| `toggle-group.tsx` | `radix-ui` ToggleGroup | `ToggleGroup`, `ToggleGroupItem` |
| `tooltip.tsx` | `radix-ui` Tooltip | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` |

**Depends on:** `src/lib/utils.ts` (`cn`), `class-variance-authority`, `radix-ui`, `cmdk`, `lucide-react`, `react-day-picker`.
**Internal cross-dependencies:** `command.tsx` imports `dialog.tsx`; `toggle-group.tsx` imports `toggle.tsx`; `calendar.tsx` imports `button.tsx`.

---

### `src/app/layout.tsx` — `RootLayout`

Root Next.js layout. Loads Geist Sans and Geist Mono via `next/font/google`, applies font CSS variables to `<body>`, and exports the `metadata` object that sets `<title>` and `<meta name="description">` for the entire app.

**Key exports:** `RootLayout` (default), `metadata`.
**Depends on:** `next/font/google`.

---

## Technology Stack

| Category | Technology | Version | Purpose |
|---|---|---|---|
| Framework | Next.js | 16.1.6 | App Router, API routes, Edge middleware |
| Language | TypeScript | ^5 | Static typing across all source files |
| UI Runtime | React | 19.2.3 | Client components, hooks |
| UI Runtime | React DOM | 19.2.3 | DOM rendering |
| Styling | Tailwind CSS | ^4 | Utility-first CSS |
| Styling | tw-animate-css | ^1.4.0 | Tailwind-compatible animation utilities |
| Styling | @tailwindcss/postcss | ^4 | PostCSS integration for Tailwind v4 |
| Component Library | shadcn (CLI) | ^3.8.5 | Component scaffolding (devDependency only) |
| Component Primitives | radix-ui | ^1.4.3 | Accessible headless UI primitives |
| Component Primitives | cmdk | ^1.1.1 | Command palette primitive |
| Component Primitives | react-day-picker | ^9.14.0 | Calendar / date picker primitive |
| Icons | lucide-react | ^0.575.0 | SVG icon set |
| Styling Utilities | class-variance-authority | ^0.7.1 | Component variant definitions |
| Styling Utilities | clsx | ^2.1.1 | Conditional class merging |
| Styling Utilities | tailwind-merge | ^3.5.0 | Tailwind class deduplication |
| Date Utilities | date-fns | ^4.1.0 | Date formatting and arithmetic in `CallsPage` |
| Testing | @playwright/test | ^1.58.2 | End-to-end browser testing |
| Linting | ESLint | ^9 | Code quality |
| Linting | eslint-config-next | 16.1.6 | Next.js ESLint rule set |
| Deployment | Vercel | — | Hosting and CI/CD |
