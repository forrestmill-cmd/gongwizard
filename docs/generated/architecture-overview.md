# GongWizard Architecture Overview

## System Overview

GongWizard is a stateless Next.js 15 web application that lets Gong customers export call transcripts in formats optimized for AI analysis (ChatGPT, Claude, and other LLMs). The user connects using a Gong API access key and secret key, browses and filters calls by date range, selects calls of interest, and downloads or copies the transcripts in Markdown, XML, or JSONL format.

The system has two authentication layers. A site-level password gate (`gw-auth` cookie, validated by `src/app/api/auth/route.ts` against `SITE_PASSWORD`) guards the entire app via `src/middleware.ts`. Once past that gate, users enter their Gong API credentials on the Connect page (`src/app/page.tsx`); those credentials are Base64-encoded into an `authHeader` string and stored in `sessionStorage` — never on the server. Every subsequent API call sends the `authHeader` value in the `X-Gong-Auth` header to the Next.js proxy routes, which forward it as HTTP Basic auth to the Gong API and return results to the client.

All business logic — speaker classification, transcript grouping, filtering, and export formatting — runs in the browser inside `src/app/calls/page.tsx`. There is no database, no server-side session storage, and no backend state. Credentials are cleared when the browser tab is closed.

---

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Browser["Browser (Client)"]
        GatePage["src/app/gate/page.tsx\nGatePage\n(site password)"]
        ConnectPage["src/app/page.tsx\nConnectPage\n(Gong credentials)"]
        CallsPage["src/app/calls/page.tsx\nCallsPage\n(browse · filter · export)"]
        SessionStorage[("sessionStorage\ngongwizard_session\nauthHeader · users · trackers · workspaces")]
    end

    subgraph Middleware["Next.js Edge"]
        MW["src/middleware.ts\nmiddleware()\ngw-auth cookie check"]
    end

    subgraph APIRoutes["Next.js API Routes (Server — stateless proxies)"]
        AuthRoute["src/app/api/auth/route.ts\nPOST /api/auth\nvalidates SITE_PASSWORD\nsets gw-auth cookie"]
        ConnectRoute["src/app/api/gong/connect/route.ts\nPOST /api/gong/connect\nfetches users · trackers · workspaces"]
        CallsRoute["src/app/api/gong/calls/route.ts\nPOST /api/gong/calls\nfetches + normalizes call list"]
        TranscriptsRoute["src/app/api/gong/transcripts/route.ts\nPOST /api/gong/transcripts\nfetches transcript monologues"]
    end

    subgraph GongAPI["Gong API (External)"]
        GongUsers["GET /v2/users"]
        GongTrackers["GET /v2/settings/trackers"]
        GongWorkspaces["GET /v2/workspaces"]
        GongCallsBasic["GET /v2/calls"]
        GongCallsExtensive["POST /v2/calls/extensive"]
        GongTranscripts["POST /v2/calls/transcript"]
    end

    subgraph UILib["src/components/ui/"]
        UIComponents["Badge · Button · Calendar\nCard · Checkbox · Command\nDialog · Input · Label\nPopover · ScrollArea\nSeparator · Tabs\nToggle · ToggleGroup · Tooltip"]
    end

    subgraph Utils["src/lib/"]
        UtilsCn["utils.ts — cn()"]
    end

    Browser -->|every request| MW
    MW -->|no gw-auth cookie| GatePage
    MW -->|cookie valid| ConnectPage

    GatePage -->|POST /api/auth| AuthRoute
    AuthRoute -->|sets gw-auth cookie| GatePage

    ConnectPage -->|POST /api/gong/connect\nX-Gong-Auth header| ConnectRoute
    ConnectRoute -->|Basic auth forwarded| GongUsers
    ConnectRoute -->|Basic auth forwarded| GongTrackers
    ConnectRoute -->|Basic auth forwarded| GongWorkspaces
    ConnectRoute -->|users · trackers · workspaces · internalDomains| ConnectPage
    ConnectPage -->|saveSession()| SessionStorage
    ConnectPage -->|router.push| CallsPage

    CallsPage -->|getSession()| SessionStorage
    CallsPage -->|POST /api/gong/calls\nX-Gong-Auth header| CallsRoute
    CallsRoute -->|Basic auth forwarded| GongCallsBasic
    CallsRoute -->|Basic auth forwarded — batch 10| GongCallsExtensive
    CallsRoute -->|normalized GongCall[]| CallsPage

    CallsPage -->|POST /api/gong/transcripts\nX-Gong-Auth header| TranscriptsRoute
    TranscriptsRoute -->|Basic auth forwarded — batch 50| GongTranscripts
    TranscriptsRoute -->|transcripts[]| CallsPage

    CallsPage --> UIComponents
    UIComponents --> UtilsCn
```

---

## Key Components

### `src/middleware.ts`
**Purpose:** Edge middleware that enforces site-level authentication on every request. Checks for the `gw-auth` cookie (value `"1"`); redirects to `/gate` if absent. Passes through `/gate`, `/api/`, `/_next/`, and `/favicon` paths unconditionally.

**Key exports:** `middleware` function, `config` matcher.

**Dependencies:** `next/server`. Nothing depends on it at runtime — it intercepts all requests before they reach any page or route handler.

---

### `src/app/gate/page.tsx` — `GatePage`
**Purpose:** Site password prompt. Submits to `POST /api/auth`; on success the server sets the `gw-auth` cookie and the router navigates to `/`.

**Key exports:** default export `GatePage`.

**Depends on:** `Button`, `Card`/`CardContent`/`CardHeader`/`CardTitle`, `Input`, `Label` from `src/components/ui/`.

---

### `src/app/api/auth/route.ts`
**Purpose:** Validates the site password from the request body against `process.env.SITE_PASSWORD`. On match, sets an httpOnly `gw-auth` cookie with a 7-day max-age.

**Key exports:** `POST` handler.

**Dependencies:** `next/server`. No external calls.

---

### `src/app/page.tsx` — `ConnectPage`
**Purpose:** Step 1 of the main flow. Accepts Gong `accessKey` and `secretKey`, constructs a Base64 `authHeader` via `btoa()`, POSTs it to `/api/gong/connect`, and saves the returned session data (users, trackers, workspaces, internalDomains, authHeader) into `sessionStorage` under `gongwizard_session`. Navigates to `/calls` on success.

**Key exports:** default export `ConnectPage`. Local helper `saveSession(data)`.

**Depends on:** `Button`, `Card`, `Input`, `Label` from `src/components/ui/`. Reads/writes `sessionStorage` directly (no custom hook).

---

### `src/app/api/gong/connect/route.ts`
**Purpose:** Validates Gong credentials and pre-fetches workspace-level reference data needed for the session. Fetches `/v2/users` (all pages), `/v2/settings/trackers` (all pages), and `/v2/workspaces` in parallel using `Promise.allSettled`. Derives `internalDomains` by extracting email domains from all users. Returns `{ users, trackers, workspaces, internalDomains, baseUrl, warnings? }`.

**Key exports:** `POST` handler.

**Key internals:** `GongApiError` class, `gongFetch()` helper, `fetchAllPages<T>()` paginator (handles cursor-based pagination with 350 ms inter-page delay).

**Dependencies:** `next/server`. Calls Gong API directly via `fetch`.

---

### `src/app/api/gong/calls/route.ts`
**Purpose:** Two-phase call retrieval and normalization. Phase 1: paginates `GET /v2/calls` to collect all call IDs for the requested date range (and optional `workspaceId`). Phase 2: fetches full metadata via `POST /v2/calls/extensive` in batches of 10, requesting `parties`, `content` (topics, trackers, brief, keyPoints, actionItems, outline), and `context: 'Extended'`. Falls back to basic call data if `/v2/calls/extensive` returns 403. Normalizes both shapes into a flat `GongCall`-compatible object including `accountName`, `accountIndustry`, and `accountWebsite` extracted from nested CRM context.

**Key exports:** `POST` handler.

**Key internals:** `GongApiError` class, `gongFetch()`, `sleep()`, `extractFieldValues()` (parses Gong's nested `context.objects.fields` structure; ported from Python v1).

**Dependencies:** `next/server`. Calls Gong API directly.

---

### `src/app/api/gong/transcripts/route.ts`
**Purpose:** Fetches raw transcript monologues for a given list of call IDs. Sends call IDs to `POST /v2/calls/transcript` in batches of 50 with cursor-based pagination and 350 ms rate-limit delays between batches. Aggregates per-call monologues into a map and returns `{ transcripts: [{ callId, transcript }] }`.

**Key exports:** `POST` handler.

**Key internals:** `GongApiError` class, `gongFetch()`, `sleep()`.

**Dependencies:** `next/server`. Calls Gong API directly.

---

### `src/app/calls/page.tsx` — `CallsPage`
**Purpose:** The main application screen. Reads the session from `sessionStorage`, displays a date-range picker and Load Calls button, renders a filterable/searchable call list, and handles export. Contains all client-side business logic: speaker classification, transcript processing, filtering, and all three export format renderers. This is the largest file in the project and contains no external hook dependencies — all state is local `useState`/`useMemo`.

**Key exports:** default export `CallsPage`.

**Key local interfaces:** `GongCall`, `ExportOptions`, `Speaker`, `TranscriptSentence`, `FormattedTurn`, `CallForExport`.

**Key local functions:**
- `saveSession` / `getSession` — `sessionStorage` read/write
- `estimateTokens(text)` — divides character count by 4
- `contextLabel(tokens)` / `contextColor(tokens)` — maps token count to context window labels and CSS color classes
- `downloadFile(content, filename, mimeType)` — creates a Blob URL and triggers browser download
- `formatDuration(seconds)` — formats seconds to `Xh Ym` / `Xm Ys`
- `formatTimestamp(ms)` — converts milliseconds to `M:SS`
- `groupTranscriptTurns(sentences, speakerMap)` — collapses consecutive same-speaker sentences into `FormattedTurn[]`
- `buildMarkdown(calls, opts)` / `buildCallText(call, opts)` — Markdown export renderer
- `buildXML(calls, opts)` — XML export renderer with `escapeXml()`
- `buildJSONL(calls, opts)` — JSONL export renderer (one JSON object per line)
- `filterFillerTurns(turns)` — removes short/filler utterances matching `FILLER_PATTERNS`
- `condenseInternalMonologues(turns)` — merges runs of 3+ consecutive turns by the same internal speaker
- `fetchTranscriptsForSelected()` — calls `/api/gong/transcripts`, then builds `speakerMap` from stored party data and runs `groupTranscriptTurns`
- `handleExport()` / `handleCopy()` — orchestrate transcript fetch → format render → download or clipboard copy

**Depends on:** all `src/components/ui/` components, `date-fns` (`format`, `subDays`), `lucide-react` icons.

---

### `src/app/layout.tsx` — `RootLayout`
**Purpose:** Next.js root layout. Loads `Geist` and `Geist_Mono` fonts via `next/font/google`, sets `<html lang="en">`, and exports page metadata (`title`, `description`).

**Key exports:** default export `RootLayout`, `metadata`.

---

### `src/components/ui/`
**Purpose:** shadcn/ui component library — 15 pre-built, accessible UI primitives built on Radix UI primitives and styled with Tailwind v4 + `class-variance-authority`.

**Components and their underlying primitives:**

| File | Component(s) | Primitive |
|---|---|---|
| `badge.tsx` | `Badge`, `badgeVariants` | `radix-ui` Slot |
| `button.tsx` | `Button`, `buttonVariants` | `radix-ui` Slot |
| `calendar.tsx` | `Calendar`, `CalendarDayButton` | `react-day-picker` DayPicker |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | plain `div` |
| `checkbox.tsx` | `Checkbox` | `radix-ui` Checkbox |
| `command.tsx` | `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator` | `cmdk` CommandPrimitive |
| `dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` | `radix-ui` Dialog |
| `input.tsx` | `Input` | plain `input` |
| `label.tsx` | `Label` | `radix-ui` Label |
| `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription` | `radix-ui` Popover |
| `scroll-area.tsx` | `ScrollArea`, `ScrollBar` | `radix-ui` ScrollArea |
| `separator.tsx` | `Separator` | `radix-ui` Separator |
| `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `tabsListVariants` | `radix-ui` Tabs |
| `toggle.tsx` | `Toggle`, `toggleVariants` | `radix-ui` Toggle |
| `toggle-group.tsx` | `ToggleGroup`, `ToggleGroupItem`, `ToggleGroupContext` | `radix-ui` ToggleGroup |
| `tooltip.tsx` | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` | `radix-ui` Tooltip |

**Depends on:** `src/lib/utils.ts` (`cn`), `class-variance-authority`, `radix-ui`, `cmdk`, `react-day-picker`, `lucide-react`.

---

### `src/lib/utils.ts`
**Purpose:** Single utility export: `cn(...inputs)`, which merges Tailwind class strings using `clsx` + `tailwind-merge`.

**Key exports:** `cn`.

**Depends on:** `clsx`, `tailwind-merge`.

---

## Technology Stack

| Category | Technology | Version | Purpose |
|---|---|---|---|
| Framework | Next.js | 16.1.6 | App Router, API routes, middleware, SSR/CSR |
| Language | TypeScript | ^5 | Static typing throughout |
| UI Runtime | React | 19.2.3 | Component model |
| UI Runtime | React DOM | 19.2.3 | Browser rendering |
| Styling | Tailwind CSS | ^4 | Utility-first CSS |
| Styling | tw-animate-css | ^1.4.0 | Tailwind animation utilities |
| Styling | @tailwindcss/postcss | ^4 | PostCSS integration for Tailwind v4 |
| Component Library | shadcn (CLI) | ^3.8.5 | Component scaffolding tool (dev only) |
| Component Primitives | radix-ui | ^1.4.3 | Accessible headless UI primitives |
| Component Primitives | cmdk | ^1.1.1 | Command palette primitive |
| Component Primitives | react-day-picker | ^9.14.0 | Calendar/date picker |
| Icons | lucide-react | ^0.575.0 | SVG icon set |
| Styling Utilities | class-variance-authority | ^0.7.1 | Variant-based className composition |
| Styling Utilities | clsx | ^2.1.1 | Conditional className merging |
| Styling Utilities | tailwind-merge | ^3.5.0 | Tailwind class conflict resolution |
| Date Utilities | date-fns | ^4.1.0 | Date formatting and arithmetic |
| Testing | @playwright/test | ^1.58.2 | End-to-end browser tests |
| Linting | ESLint | ^9 | Static analysis |
| Linting | eslint-config-next | 16.1.6 | Next.js ESLint rules |
| Fonts | Geist / Geist Mono | (next/font/google) | Variable fonts via Google Fonts |
| Deployment | Vercel | — | Hosting and edge network |
