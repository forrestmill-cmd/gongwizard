# GongWizard Architecture Overview

## System Overview

GongWizard is a stateless Next.js web application that acts as a proxy and analysis layer between a user's browser and the Gong API. Users enter their Gong API credentials once per browser session; those credentials are held only in `sessionStorage` under the key `gongwizard_session` and are never persisted on the server. Every API request from the browser to Gong flows through a Next.js Route Handler that forwards the credentials as HTTP Basic auth via the `X-Gong-Auth` header — there is no database, no user accounts, and no server-side credential storage.

The application has two primary workflows. The first is a transcript export pipeline: users select a date range, load calls with full metadata from Gong's `/v2/calls/extensive` endpoint, filter and select calls of interest, and download transcripts in one of five formats (Markdown, XML, JSONL, summary CSV, utterance-level CSV). All export rendering — speaker classification, turn grouping, monologue condensing, token estimation, and ZIP packaging — runs entirely in the browser via `src/lib/transcript-formatter.ts` and `src/hooks/useCallExport.ts`. The second workflow is an AI-powered research pipeline: the `AnalyzePanel` component scores selected calls for relevance using Gemini Flash-Lite, performs surgical transcript extraction to reduce full call transcripts to dense evidence excerpts, submits the evidence to Gemini 2.5 Pro for finding extraction and synthesis, and supports follow-up questions against the cached evidence.

The two auth layers are distinct: a site-level password gate enforced by `src/middleware.ts` (issues a `gw-auth` httpOnly cookie for 7 days), and a per-session Gong credential layer where the Base64-encoded `accessKey:secretKey` string is stored client-side and passed as `X-Gong-Auth` on every request to the four Gong proxy routes. The single server-side environment variable is `SITE_PASSWORD`; the AI routes consume `GEMINI_API_KEY`, accessed only by the analyze route handlers.

---

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Browser
        A[GatePage\nsrc/app/gate/page.tsx]
        B[ConnectPage\nsrc/app/page.tsx]
        C[CallsPage\nsrc/app/calls/page.tsx]
        D[AnalyzePanel\nsrc/components/analyze-panel.tsx]
        E[useCallExport\nsrc/hooks/useCallExport.ts]
        F[useFilterState\nsrc/hooks/useFilterState.ts]
        SS[(sessionStorage\ngongwizard_session)]
        LS[(localStorage\ngongwizard_filters)]
    end

    subgraph NextJS_API["Next.js API Routes (src/app/api/)"]
        subgraph Auth_Routes["Auth"]
            AR[/api/auth/route.ts]
        end
        subgraph Gong_Routes["Gong Proxy Routes"]
            GC[/api/gong/connect/route.ts]
            GL[/api/gong/calls/route.ts]
            GT[/api/gong/transcripts/route.ts]
            GS[/api/gong/search/route.ts]
        end
        subgraph Analyze_Routes["Analyze Routes"]
            AS[/api/analyze/score/route.ts]
            AP[/api/analyze/process/route.ts]
            ABR[/api/analyze/batch-run/route.ts]
            ASY[/api/analyze/synthesize/route.ts]
            AF[/api/analyze/followup/route.ts]
        end
    end

    subgraph Middleware
        MW[src/middleware.ts\ngw-auth cookie check]
    end

    subgraph LibLayer["src/lib/"]
        GA[gong-api.ts\nGongApiError · makeGongFetch\nrate limit · retry]
        TF[transcript-formatter.ts\nbuildMarkdown · buildXML\nbuildJSONL · buildCSVSummary\nbuildUtteranceCSV · buildExportContent]
        TS[transcript-surgery.ts\nperformSurgery · buildChapterWindows\nformatExcerptsForAnalysis\nbuildSmartTruncationPrompt]
        TA[tracker-alignment.ts\nbuildUtterances\nalignTrackersToUtterances\nextractTrackerOccurrences]
        AI[ai-providers.ts\ncheapCompleteJSON (Flash-Lite)\nsmartCompleteJSON (2.5 Pro)\nsmartStream]
        FU[format-utils.ts\nformatDuration · formatTimestamp\nisInternalParty]
        SES[session.ts\nsaveSession · getSession]
        TK[token-utils.ts\nestimateTokens · contextLabel]
        BU[browser-utils.ts\ndownloadFile]
        FL[filters.ts\nmatchesTextSearch · matchesTrackers\nmatchesTopics · matchesDurationRange]
        UT[utils.ts\ncn()]
    end

    subgraph ExternalAPIs["External Services"]
        GONG[(Gong API\napi.gong.io)]
        GEMINI[(Google Gemini API\nFlash-Lite + 2.5 Pro)]
    end

    A -->|POST password| AR
    AR -->|Set gw-auth cookie| A
    B -->|POST X-Gong-Auth| GC
    GC -->|saveSession| SS
    B -->|redirect| C
    C -->|reads| SS
    C -->|POST X-Gong-Auth| GL
    C --> F
    F -->|persists| LS
    C --> E
    C --> D
    E -->|POST X-Gong-Auth| GT
    E --> TF
    E --> BU
    D -->|POST| AS
    D -->|POST X-Gong-Auth| GT
    D -->|POST| AP
    D -->|POST| ABR
    D -->|POST| ASY
    D -->|POST| AF
    D --> TS
    D --> TA

    MW -->|blocks unauthenticated| A
    MW -->|passes| B
    MW -->|passes| C

    GC --> GA
    GL --> GA
    GT --> GA
    GS --> GA
    GA -->|HTTP Basic auth| GONG

    AS --> AI
    AP --> AI
    ABR --> AI
    ASY --> AI
    AF --> AI
    AI --> GEMINI

    TF --> TA
    TF --> TS
    TF --> TK
    TF --> FU
```

---

## Key Components

### `src/middleware.ts`

**Purpose:** Edge middleware that enforces the site-level password gate. Checks for the `gw-auth` cookie on every request; redirects unauthenticated requests to `/gate`. Bypasses `/gate`, `/api/auth`, `/api/gong/*`, and Next.js internals.
**Key exports:** `middleware` function, `config` matcher
**Dependencies:** None
**Depended on by:** All page and API routes (runs before every handler)

---

### `src/app/gate/page.tsx` — `GatePage`

**Purpose:** Site password prompt. Submits the password to `POST /api/auth`, receives the `gw-auth` cookie, then redirects to the connect page.
**Key exports:** `GatePage` (default export)
**Dependencies:** `Button`, `Card`, `Input`, `Label` from `src/components/ui/`

---

### `src/app/page.tsx` — `ConnectPage`

**Purpose:** Step 1 of the user flow. Collects Gong access key and secret key, Base64-encodes them as `authHeader`, POSTs to `/api/gong/connect`, and saves the returned session data (`users`, `trackers`, `workspaces`, `internalDomains`, `baseUrl`, `authHeader`) to `sessionStorage` via `saveSession`. Redirects to `/calls` on success.
**Key exports:** `ConnectPage` (default export)
**Dependencies:** `src/lib/session.ts`, shadcn/ui components

---

### `src/app/calls/page.tsx`

**Purpose:** The main application view. Loads calls from `/api/gong/calls`, renders the call list with all filters, handles call selection, hosts the export controls (via `useCallExport`), and renders `AnalyzePanel`. All client-side business logic for filtering, speaker classification, and export orchestration runs here.
**Key exports:** default page component
**Dependencies:** `useCallExport`, `useFilterState`, `AnalyzePanel`, `src/lib/filters.ts`, `src/lib/format-utils.ts`, `src/lib/session.ts`, `src/lib/token-utils.ts`, shadcn/ui components

---

### `src/components/analyze-panel.tsx` — `AnalyzePanel`

**Purpose:** The AI research panel. Orchestrates a four-stage pipeline: (1) score selected calls for relevance via `/api/analyze/score`, (2) fetch transcripts and perform surgical extraction using `performSurgery` + `formatExcerptsForAnalysis`, (3) submit evidence to `/api/analyze/batch-run` for finding extraction, (4) synthesize findings via `/api/analyze/synthesize`. Supports follow-up questions via `/api/analyze/followup` and exports results as JSON or CSV.
**Key exports:** `AnalyzePanel` (default export)
**Dependencies:** `src/lib/tracker-alignment.ts`, `src/lib/transcript-surgery.ts`, `src/lib/format-utils.ts`, all `/api/analyze/*` routes, `/api/gong/transcripts`

---

### `src/hooks/useCallExport.ts` — `useCallExport`

**Purpose:** Encapsulates all export logic for the calls page. Fetches transcripts from `/api/gong/transcripts`, assembles `CallForExport` objects with speaker classification and turn grouping, and dispatches to `buildExportContent`. Exposes `handleExport` (single file download), `handleCopy` (clipboard), and `handleZipExport` (per-call ZIP with manifest).
**Key exports:** `useCallExport`
**Dependencies:** `src/lib/transcript-formatter.ts`, `src/lib/format-utils.ts`, `src/lib/browser-utils.ts`, `client-zip`, `date-fns`

---

### `src/hooks/useFilterState.ts` — `useFilterState`

**Purpose:** Manages all filter state for the call list. Persists numeric/boolean filters to `localStorage` under `gongwizard_filters`; keeps session-specific text searches and multi-select sets (trackers, topics) in React state only.
**Key exports:** `useFilterState`
**Dependencies:** React

---

### `src/lib/gong-api.ts`

**Purpose:** Shared Gong API utilities used by all four proxy routes. Provides `makeGongFetch` (a configured fetch wrapper with Basic auth, exponential backoff, and up to 5 retries), `handleGongError` (converts `GongApiError` to `NextResponse`), `sleep`, and the rate limit / batch size constants (`GONG_RATE_LIMIT_MS = 350`, `EXTENSIVE_BATCH_SIZE = 10`, `TRANSCRIPT_BATCH_SIZE = 50`).
**Key exports:** `GongApiError`, `makeGongFetch`, `handleGongError`, `sleep`, `GONG_RATE_LIMIT_MS`, `EXTENSIVE_BATCH_SIZE`, `TRANSCRIPT_BATCH_SIZE`, `MAX_RETRIES`
**Dependencies:** `next/server`
**Depended on by:** All four Gong proxy routes

---

### `src/lib/ai-providers.ts`

**Purpose:** Abstraction over Google Gemini. Provides two tiers: `cheapComplete`/`cheapCompleteJSON` (model `gemini-3.1-flash-lite-preview`, for scoring and smart truncation) and `smartComplete`/`smartCompleteJSON`/`smartStream` (model `gemini-2.5-pro`, for finding extraction, synthesis, follow-up). Lazily initializes a singleton `GoogleGenAI` client from `GEMINI_API_KEY`.
**Key exports:** `cheapComplete`, `cheapCompleteJSON`, `smartComplete`, `smartCompleteJSON`, `smartStream`
**Dependencies:** `@google/genai`
**Depended on by:** All five `/api/analyze/*` routes

---

### `src/lib/transcript-formatter.ts`

**Purpose:** All export rendering. Provides `groupTranscriptTurns` (flattens monologues to speaker turns), `truncateLongInternalTurns` (condenses internal turns ≥150 words to first 2 + last 2 sentences), and the five format builders: `buildMarkdown`, `buildXML`, `buildJSONL`, `buildCSVSummary`, `buildUtteranceCSV`. The `buildExportContent` dispatcher routes to the correct builder by format string.
**Key exports:** `groupTranscriptTurns`, `truncateLongInternalTurns`, `buildMarkdown`, `buildXML`, `buildJSONL`, `buildCSVSummary`, `buildUtteranceCSV`, `buildExportContent`, `Speaker`, `FormattedTurn`, `CallForExport`, `ExportOptions`
**Dependencies:** `src/lib/token-utils.ts`, `src/lib/format-utils.ts`, `src/lib/tracker-alignment.ts`, `src/lib/transcript-surgery.ts`
**Depended on by:** `useCallExport`

---

### `src/lib/transcript-surgery.ts`

**Purpose:** Surgical extraction of relevant transcript segments for AI analysis. `performSurgery` filters an utterance list to only those in relevant call outline sections (from the scoring step) or with tracker hits, strips filler/greetings (first/last 60 seconds, utterances under 8 words), enriches external utterances with reach-back context, and flags long internal monologues (`needsSmartTruncation = true` when >60 words). `formatExcerptsForAnalysis` renders the output as a structured text block grouped by section with Gong AI outline item labels. `buildSmartTruncationPrompt` builds the Gemini Flash-Lite prompt used by `/api/analyze/process`.
**Key exports:** `performSurgery`, `buildChapterWindows`, `findNearestOutlineItem`, `formatExcerptsForAnalysis`, `buildSmartTruncationPrompt`, `SurgicalExcerpt`, `SurgeryResult`, `OutlineSection`
**Dependencies:** `src/lib/tracker-alignment.ts`
**Depended on by:** `AnalyzePanel`, `src/lib/transcript-formatter.ts`

---

### `src/lib/tracker-alignment.ts`

**Purpose:** Aligns Gong tracker occurrences (keyword detections with timestamps) to individual utterances using a four-step algorithm ported from GongWizard v2: exact containment → ±3s fallback window (`WINDOW_MS = 3000`) → speaker preference → closest midpoint. Also provides `buildUtterances` (converts raw Gong monologues with seconds-based sentence timestamps to `Utterance` objects with millisecond timestamps) and `extractTrackerOccurrences`.
**Key exports:** `buildUtterances`, `alignTrackersToUtterances`, `extractTrackerOccurrences`, `Utterance`, `TrackerOccurrence`
**Depended on by:** `src/lib/transcript-formatter.ts`, `src/lib/transcript-surgery.ts`, `AnalyzePanel`

---

### `src/lib/filters.ts`

**Purpose:** Pure filter predicate functions for the call list. Each function takes a `FilterableCall` and one filter parameter and returns a boolean. Includes `matchesTextSearch`, `matchesTrackers`, `matchesTopics`, `matchesDurationRange`, `matchesTalkRatioRange`, `matchesParticipantName`, `matchesMinExternalSpeakers`, `matchesAiContentSearch`, plus `computeTrackerCounts` and `computeTopicCounts` for sidebar counts.
**Key exports:** All filter functions and count utilities
**Depended on by:** `src/app/calls/page.tsx`

---

### `src/lib/session.ts`

**Purpose:** Thin wrapper around `sessionStorage` for the `gongwizard_session` key. Provides `saveSession` and `getSession`.
**Key exports:** `saveSession`, `getSession`
**Depended on by:** `ConnectPage`, `src/app/calls/page.tsx`

---

### `src/lib/format-utils.ts`

**Purpose:** Shared formatting utilities: `formatDuration` (seconds → `Xh Xm`), `formatTimestamp` (milliseconds → `M:SS`), `isInternalParty` (checks `affiliation` field and email domain against `internalDomains`), `truncateToFirstSentence`.
**Key exports:** `formatDuration`, `formatTimestamp`, `isInternalParty`, `truncateToFirstSentence`
**Depended on by:** `transcript-formatter.ts`, `AnalyzePanel`, `useCallExport`, `src/app/calls/page.tsx`, `/api/gong/search/route.ts`

---

### `src/lib/token-utils.ts`

**Purpose:** AI context window guidance for the export preview. `estimateTokens` (length/4 heuristic), `contextLabel` (maps token count to model name thresholds up to 200K), `contextColor` (green/yellow/red CSS class).
**Key exports:** `estimateTokens`, `contextLabel`, `contextColor`
**Depended on by:** `transcript-formatter.ts`, `src/app/calls/page.tsx`

---

### `src/lib/browser-utils.ts`

**Purpose:** Single utility for triggering a file download in the browser via an ephemeral `<a>` element and `URL.createObjectURL`.
**Key exports:** `downloadFile`
**Depended on by:** `useCallExport`

---

### `src/lib/utils.ts`

**Purpose:** Provides the `cn()` utility that combines `clsx` and `tailwind-merge` for conditional and conflict-free Tailwind class composition. Used throughout all UI components.
**Key exports:** `cn`
**Depended on by:** All `src/components/ui/` files

---

### `src/app/api/gong/calls/route.ts`

**Purpose:** Proxy for fetching and normalizing call metadata. Step 1: paginates `/v2/calls` in 30-day chunks (max 365 days total, dedup by ID). Step 2: fetches full metadata from `/v2/calls/extensive` in batches of 10, with `contentSelector` requesting parties, topics, trackers, brief, keyPoints, actionItems, outline, structure, interactionStats, questions, and Extended context. Step 3: normalizes the nested Gong response shape (including converting all timestamps from seconds to milliseconds for outline and tracker occurrences) via `normalizeExtensiveCall`. Falls back to basic call data if `/v2/calls/extensive` returns 403.
**Key exports:** `POST` handler
**Dependencies:** `src/lib/gong-api.ts`

---

### `src/app/api/gong/connect/route.ts`

**Purpose:** Initial connection proxy. Fetches `/v2/users` (paginated), `/v2/settings/trackers` (paginated), and `/v2/workspaces` in parallel via `Promise.allSettled`. Derives `internalDomains` by extracting email domains from all users. Returns all data for `sessionStorage` hydration. Validates credentials via 401 check on the users response.
**Key exports:** `POST` handler
**Dependencies:** `src/lib/gong-api.ts`

---

### `src/app/api/gong/transcripts/route.ts`

**Purpose:** Proxy for fetching transcript monologues. Accepts an array of `callIds`, fetches `/v2/calls/transcript` in batches of 50 with 350ms rate limit delays between batches, and returns a map of `callId → monologue[]`.
**Key exports:** `POST` handler
**Dependencies:** `src/lib/gong-api.ts`

---

### `src/app/api/gong/search/route.ts`

**Purpose:** Streaming keyword search across transcripts. Accepts `callIds` and `keyword`, fetches transcripts in batches of 50, streams NDJSON `{ type: "match" }` and `{ type: "progress" }` events as each batch completes. Returns the stream as `Content-Type: application/x-ndjson`.
**Key exports:** `POST` handler
**Dependencies:** `src/lib/gong-api.ts`, `src/lib/format-utils.ts`

---

### `src/app/api/analyze/score/route.ts`

**Purpose:** Relevance scoring step. Accepts the research question and call summaries (brief, key points, outline, trackers, topics), builds a batch prompt, and calls `cheapCompleteJSON` (Gemini Flash-Lite, temperature 0.2) to score each call 0–10 with a reason and list of relevant section names. Includes a fallback to neutral scores (5) if the AI call fails.
**Key exports:** `POST` handler
**Dependencies:** `src/lib/ai-providers.ts`

---

### `src/app/api/analyze/process/route.ts`

**Purpose:** Smart truncation of long internal rep monologues. Accepts the research question and an array of `{ index, text }` monologues, prompts `cheapCompleteJSON` to keep only sentences that set up customer responses, contain pricing/product claims, or ask answered questions. Returns `{ truncated: Array<{ index, kept }> }`.
**Key exports:** `POST` handler
**Dependencies:** `src/lib/ai-providers.ts`, `src/lib/transcript-surgery.ts`

---

### `src/app/api/analyze/batch-run/route.ts`

**Purpose:** Multi-call finding extraction. Accepts the research question and an array of `CallPayload` objects (each with pre-processed `callData` text and speaker directory), sends all calls in a single prompt to `smartCompleteJSON` (Gemini 2.5 Pro, temperature 0.3, maxTokens 16384), and returns findings keyed by `callId`. Extracts verbatim quotes exclusively from external speakers with full attribution. Has `export const maxDuration = 60` for Vercel serverless timeout.
**Key exports:** `POST` handler
**Dependencies:** `src/lib/ai-providers.ts`

---

### `src/app/api/analyze/synthesize/route.ts`

**Purpose:** Cross-call synthesis. Accepts the research question and `allFindings` (findings from all analyzed calls), filters to external-speaker findings only, builds a summary prompt, and calls `smartCompleteJSON` (Gemini 2.5 Pro) to produce a 2–4 sentence direct answer with supporting verbatim quotes.
**Key exports:** `POST` handler
**Dependencies:** `src/lib/ai-providers.ts`

---

### `src/app/api/analyze/followup/route.ts`

**Purpose:** Follow-up question handler. Accepts a follow-up question, the cached `processedData` text from the analysis run, and `previousFindings` for context. Calls `smartCompleteJSON` (Gemini 2.5 Pro) to answer using only evidence already in the cache — no re-fetching of transcripts.
**Key exports:** `POST` handler
**Dependencies:** `src/lib/ai-providers.ts`

---

### `src/types/gong.ts`

**Purpose:** Shared TypeScript interfaces for the entire application. Covers `GongCall`, `GongParty`, `GongTracker`, `TrackerOccurrence`, `OutlineSection`, `OutlineItem`, `GongQuestion`, `InteractionStats`, `GongSession`, `GongUser`, `SessionTracker`, `GongWorkspace`, `TranscriptMonologue`, `TranscriptSentence`, `ScoredCall`, `AnalysisFinding`, `SynthesisTheme`.
**Key exports:** All interfaces listed above

---

### `src/components/ui/` (10 present in repomix)

**Purpose:** shadcn/ui component wrappers around Radix UI primitives, styled with Tailwind v4 and `class-variance-authority`. Components: `Badge`, `Button`, `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`), `Checkbox`, `Input`, `Label`, `ScrollArea` (+ `ScrollBar`), `Separator`, `Slider`, `Tabs` (+ `TabsList`, `TabsTrigger`, `TabsContent`).
**Dependencies:** `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`

---

## Technology Stack

| Category | Technology | Version | Purpose |
|---|---|---|---|
| Framework | Next.js | 16.1.6 | App Router, Route Handlers, Edge Middleware, Turbopack dev server |
| Language | TypeScript | ^5 | Type safety across all source files |
| UI Runtime | React | 19.2.3 | Client components, hooks |
| Styling | Tailwind CSS | ^4 | Utility-first CSS; CSS variable theming |
| Styling | tw-animate-css | ^1.4.0 | Animation utilities |
| Component Primitives | radix-ui | ^1.4.3 | Accessible headless UI (Checkbox, Tabs, Slider, ScrollArea, Separator, Label) |
| Component Library | shadcn | ^3.8.5 (dev) | Component scaffolding CLI |
| Style Utilities | class-variance-authority | ^0.7.1 | Variant-based className composition (`buttonVariants`, `badgeVariants`, `tabsListVariants`) |
| Style Utilities | clsx | ^2.1.1 | Conditional className joining |
| Style Utilities | tailwind-merge | ^3.5.0 | Tailwind class conflict resolution used in `cn()` |
| Icons | lucide-react | ^0.575.0 | SVG icon library |
| Command Menu | cmdk | ^1.1.1 | Command palette primitive |
| Date Picker | react-day-picker | ^9.14.0 | Calendar/date range picker |
| Date Utilities | date-fns | ^4.1.0 | Date formatting in export filenames |
| AI Provider | @google/genai | ^1.43.0 | Gemini Flash-Lite (scoring, truncation) and Gemini 2.5 Pro (analysis, synthesis, follow-up) |
| OpenAI SDK | openai | ^6.25.0 | Listed in dependencies; not used in current route handlers |
| ZIP Export | client-zip | ^2.5.0 | Browser-side ZIP creation for bulk transcript exports |
| Testing | @playwright/test | ^1.58.2 | End-to-end smoke tests via `python3 .claude/skills/gongwizard-test/test_smoke.py` |
| Linting | ESLint | ^9 | Code quality (`eslint-config-next` 16.1.6) |
| Deployment | Vercel | — | Serverless deployment; `maxDuration = 60` export on batch-run route |
| Build | Turbopack (via Next.js) | built-in | Fast dev bundler, default in Next.js 16 |
