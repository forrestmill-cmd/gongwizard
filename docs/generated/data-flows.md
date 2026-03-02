# GongWizard — Data Flows

Five major data pipelines in the application, from site authentication through AI-powered call analysis.

---

## Flow 1: Site Authentication (Gate)

**What it does:** Enforces a site-wide password before any Gong credentials are entered. Every request is checked by edge middleware; unauthenticated users are redirected to `/gate`.

**Triggered by:** First visit to any page on the site, or when the `gw-auth` cookie is absent or expired.

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Middleware as src/middleware.ts
    participant AuthRoute as src/app/api/auth/route.ts (POST)
    participant GatePage as src/app/gate/page.tsx

    User->>Browser: Navigate to any URL
    Browser->>Middleware: HTTP request (no gw-auth cookie)
    Middleware-->>Browser: 302 redirect → /gate
    Browser->>GatePage: Render GatePage
    User->>GatePage: Enter site password → handleSubmit()
    GatePage->>AuthRoute: POST /api/auth { password }
    AuthRoute->>AuthRoute: Compare password vs process.env.SITE_PASSWORD
    alt Wrong password
        AuthRoute-->>GatePage: 401 { error: "Incorrect password." }
        GatePage-->>User: Show error message
    else Correct password
        AuthRoute-->>Browser: 200 { ok: true } + Set-Cookie: gw-auth=1 (httpOnly, 7-day)
        GatePage->>Browser: router.push('/') + router.refresh()
        Browser->>Middleware: Re-request with gw-auth cookie
        Middleware-->>Browser: Pass through to destination
    end
```

### Step-by-step

1. **`src/middleware.ts`** — Edge middleware runs on every request. If `gw-auth` cookie is absent, it redirects to `/gate`. Requests to `/gate` and `/api/auth` are excluded from the check.
2. **`src/app/gate/page.tsx` — `GatePage` / `handleSubmit()`** — User types the site password. On submit, it POSTs to `/api/auth` with `{ password }`.
3. **`src/app/api/auth/route.ts` — `POST()`** — Compares the submitted password against `process.env.SITE_PASSWORD`. On match, sets an `httpOnly` cookie named `gw-auth` with a 7-day `maxAge`. Returns `{ ok: true }`.
4. **`GatePage` — `router.push('/')`** — On success, redirects to the home/connect page. Subsequent requests carry the cookie and pass middleware.

---

## Flow 2: Gong API Connection & Session Initialization

**What it does:** Validates Gong API credentials, fetches users/trackers/workspaces in parallel, derives `internalDomains` from user email addresses, and stores the complete session object in `sessionStorage`.

**Triggered by:** User submitting their Gong API key and secret on `src/app/page.tsx` (the Connect step).

```mermaid
sequenceDiagram
    actor User
    participant ConnectPage as src/app/page.tsx (HomePage)
    participant ConnectRoute as src/app/api/gong/connect/route.ts (POST)
    participant GongAPI as api.gong.io

    User->>ConnectPage: Enter Access Key + Secret → handleConnect()
    ConnectPage->>ConnectPage: btoa(key:secret) → authHeader
    ConnectPage->>ConnectRoute: POST /api/gong/connect<br/>Header: X-Gong-Auth: Basic base64<br/>Body: { baseUrl }

    ConnectRoute->>ConnectRoute: makeGongFetch(baseUrl, authHeader)

    par Fetch users (paginated)
        ConnectRoute->>GongAPI: GET /v2/users
        GongAPI-->>ConnectRoute: { users[], records.cursor }
        loop More pages
            ConnectRoute->>GongAPI: GET /v2/users?cursor=cursor
            Note over ConnectRoute,GongAPI: sleep(GONG_RATE_LIMIT_MS = 350ms) between pages
        end
    and Fetch trackers (paginated)
        ConnectRoute->>GongAPI: GET /v2/settings/trackers
        GongAPI-->>ConnectRoute: { trackers[] }
    and Fetch workspaces
        ConnectRoute->>GongAPI: GET /v2/workspaces
        GongAPI-->>ConnectRoute: { workspaces[] }
    end

    ConnectRoute->>ConnectRoute: Extract email @domains → internalDomains[]
    ConnectRoute-->>ConnectPage: { users, trackers, workspaces, internalDomains, baseUrl }

    ConnectPage->>ConnectPage: sessionStorage.setItem('gongwizard_session',<br/>JSON.stringify({ authHeader, users, trackers,<br/>workspaces, internalDomains, baseUrl }))
    ConnectPage->>ConnectPage: router.push('/calls')
```

### Step-by-step

1. **`src/app/page.tsx` — `handleConnect()`** — Constructs a Basic Auth header via `btoa(key + ':' + secret)`. POSTs to `/api/gong/connect` with the header in `X-Gong-Auth` and an optional custom `baseUrl` in the body.
2. **`src/app/api/gong/connect/route.ts` — `POST()`** — Calls `makeGongFetch()` from `src/lib/gong-api.ts` to create a bound fetcher. Fires three Gong API calls concurrently via `Promise.allSettled()`:
   - `fetchAllPages('/v2/users', 'users')` — paginates with cursor; sleeps `GONG_RATE_LIMIT_MS` (350 ms) between pages.
   - `fetchAllPages('/v2/settings/trackers', 'trackers')` — same pagination pattern.
   - `gongFetch('/v2/workspaces')` — single non-paginated request.
3. **Domain extraction** — Iterates over all user `emailAddress` values, splits on `@`, builds a `Set<string>` of lowercase domains → `internalDomains[]`. Later consumed by `isInternalParty()` in `src/lib/format-utils.ts` to classify call participants as internal or external.
4. **`src/app/page.tsx`** — Merges the response into a `GongSession` object (typed in `src/types/gong.ts`) and persists it to `sessionStorage` under key `gongwizard_session`. Navigates to `/calls`.

---

## Flow 3: Call List Fetch & Filtering

**What it does:** Loads call metadata from Gong (paginated call list + batched extensive metadata), normalizes timestamps into milliseconds, and runs the resulting `GongCall[]` through client-side filter predicates in real time as the user adjusts filters.

**Triggered by:** Page load of `src/app/calls/page.tsx`, after session is read from `sessionStorage`.

```mermaid
sequenceDiagram
    participant CallsPage as src/app/calls/page.tsx
    participant CallsRoute as src/app/api/gong/calls/route.ts (POST)
    participant GongAPI as api.gong.io

    CallsPage->>CallsPage: Read sessionStorage('gongwizard_session')<br/>→ { authHeader, internalDomains, baseUrl, ... }
    CallsPage->>CallsRoute: POST /api/gong/calls<br/>Header: X-Gong-Auth<br/>Body: { fromDate, toDate, workspaceId, baseUrl }

    loop Paginate /v2/calls
        CallsRoute->>GongAPI: GET /v2/calls?fromDateTime=...&toDateTime=...
        GongAPI-->>CallsRoute: { calls[{ id }], records.cursor }
        Note over CallsRoute,GongAPI: sleep(350ms) between pages
    end

    CallsRoute->>CallsRoute: Collect all call IDs

    loop Batch extensive metadata (EXTENSIVE_BATCH_SIZE = 10 IDs per batch)
        CallsRoute->>GongAPI: POST /v2/calls/extensive { filter: { callIds: [...10] } }
        GongAPI-->>CallsRoute: { calls[{ parties, topics, trackers, brief, outline, interactionStats, ... }] }
        Note over CallsRoute,GongAPI: sleep(350ms) between batches
    end

    CallsRoute->>CallsRoute: Normalize:<br/>- tracker startTime × 1000 → startTimeMs<br/>- outline startTime/duration × 1000 → ms<br/>- derive talkRatio from interactionStats<br/>- derive externalSpeakerCount from parties
    CallsRoute-->>CallsPage: { calls: GongCall[] }

    CallsPage->>CallsPage: setCalls(data.calls)

    loop User adjusts filters (real-time, client-side — src/lib/filters.ts)
        CallsPage->>CallsPage: matchesTextSearch(call, searchText)
        CallsPage->>CallsPage: matchesTrackers(call, activeTrackers)
        CallsPage->>CallsPage: matchesTopics(call, activeTopics)
        CallsPage->>CallsPage: matchesDurationRange(call, min, max)
        CallsPage->>CallsPage: matchesTalkRatioRange(call, min, max)
        CallsPage->>CallsPage: matchesParticipantName(call, participantSearch)
        CallsPage->>CallsPage: matchesAiContentSearch(call, aiContentSearch)
        CallsPage->>CallsPage: matchesMinExternalSpeakers(call, min)
        CallsPage->>CallsPage: → filteredCalls[]
    end

    Note over CallsPage: useFilterState() persists range/toggle filters<br/>to localStorage('gongwizard_filters')
```

### Step-by-step

1. **`src/app/calls/page.tsx`** — On mount, reads `gongwizard_session` from `sessionStorage`. POSTs to `/api/gong/calls` with date range, optional workspace filter, and `baseUrl`.
2. **`src/app/api/gong/calls/route.ts` — `POST()`** — Paginates `GET /v2/calls` with a cursor loop, collecting all call IDs. Then batches IDs at `EXTENSIVE_BATCH_SIZE` (10) per batch into `POST /v2/calls/extensive` requests, sleeping 350 ms between each batch. If `/v2/calls/extensive` returns 403 (scope issue), falls back to basic call data.
3. **Normalization** — Tracker `startTime` and outline `startTime`/`duration` values from Gong (in seconds) are multiplied by 1000 to produce millisecond values stored on `GongCall` (`src/types/gong.ts`). `externalSpeakerCount` is derived by counting parties where `isInternalParty()` returns false.
4. **Client-side filtering** — `src/hooks/useFilterState.ts` manages all filter state, persisting range/toggle values to `localStorage('gongwizard_filters')`. The calls page derives `filteredCalls` by running the loaded call list through the pure predicates in `src/lib/filters.ts`: `matchesTextSearch`, `matchesTrackers`, `matchesTopics`, `matchesDurationRange`, `matchesTalkRatioRange`, `matchesParticipantName`, `matchesMinExternalSpeakers`, `matchesAiContentSearch`.

---

## Flow 4: Transcript Export Pipeline

**What it does:** Fetches raw transcript monologues for selected calls, builds speaker-labelled turn groups, applies optional filler removal and monologue condensing, then renders the output in the user's chosen format (Markdown, XML, JSONL, or CSV) and delivers it as a file download, clipboard copy, or ZIP archive.

**Triggered by:** User clicking Export, Copy, or ZIP in `src/app/calls/page.tsx` after selecting calls.

```mermaid
sequenceDiagram
    actor User
    participant CallsPage as src/app/calls/page.tsx
    participant ExportHook as src/hooks/useCallExport.ts
    participant TranscriptRoute as src/app/api/gong/transcripts/route.ts (POST)
    participant GongAPI as api.gong.io
    participant Formatter as src/lib/transcript-formatter.ts
    participant Browser

    User->>CallsPage: Click Export / Copy / ZIP
    CallsPage->>ExportHook: handleExport() / handleCopy() / handleZipExport()
    ExportHook->>ExportHook: fetchTranscriptsForSelected()

    ExportHook->>TranscriptRoute: POST /api/gong/transcripts<br/>Header: X-Gong-Auth<br/>Body: { callIds[], baseUrl }

    loop Batches of 50 call IDs (TRANSCRIPT_BATCH_SIZE)
        TranscriptRoute->>GongAPI: POST /v2/calls/transcript { filter: { callIds: [...50] } }
        GongAPI-->>TranscriptRoute: { callTranscripts[{ callId, transcript[monologues] }] }
        Note over TranscriptRoute,GongAPI: sleep(350ms) between batches
    end

    TranscriptRoute-->>ExportHook: { transcripts[{ callId, transcript }] }

    ExportHook->>ExportHook: For each call:<br/>1. Build speakerMap from parties + isInternalParty() (format-utils.ts)<br/>2. Flatten monologue sentences → TranscriptSentence[]<br/>3. Sort by sentence.start timestamp<br/>4. groupTranscriptTurns() → FormattedTurn[] (transcript-formatter.ts)

    ExportHook->>Formatter: buildExportContent(callsForExport, format, exportOpts, calls)

    alt exportOpts.removeFillerGreetings
        Formatter->>Formatter: filterFillerTurns(turns)
    end
    alt exportOpts.condenseMonologues
        Formatter->>Formatter: condenseInternalMonologues(turns)
    end

    alt format = 'markdown'
        Formatter-->>ExportHook: Markdown string
    else format = 'xml'
        Formatter-->>ExportHook: XML string
    else format = 'jsonl'
        Formatter-->>ExportHook: JSONL string
    else format = 'csv'
        Formatter-->>ExportHook: CSV string
    end

    alt handleExport
        ExportHook->>Browser: downloadFile() — Blob + anchor click (format-utils.ts)
    else handleCopy
        ExportHook->>Browser: navigator.clipboard.writeText(content)
    else handleZipExport
        ExportHook->>ExportHook: Per-call buildExportContent() + manifest.json
        ExportHook->>Browser: downloadZip() → Blob → anchor click (client-zip)
    end
```

### Step-by-step

1. **`src/app/calls/page.tsx`** — User selects calls and clicks an export action. Delegates to `useCallExport` in `src/hooks/useCallExport.ts`, which receives `selectedIds`, `session`, `calls`, `exportFormat`, and `exportOpts`.
2. **`fetchTranscriptsForSelected()` in `src/hooks/useCallExport.ts`** — POSTs selected call IDs to `/api/gong/transcripts` with `X-Gong-Auth` forwarded from `session.authHeader`.
3. **`src/app/api/gong/transcripts/route.ts` — `POST()`** — Chunks call IDs into batches of `TRANSCRIPT_BATCH_SIZE` (50). For each batch, POSTs to `POST /v2/calls/transcript`. Handles cursor pagination within each batch. Accumulates `transcriptMap: Record<callId, monologue[]>`. Returns `{ transcripts: [{ callId, transcript }] }`.
4. **Turn building in `src/hooks/useCallExport.ts`** — For each call, constructs a `speakerMap` using `isInternalParty()` from `src/lib/format-utils.ts` and `session.internalDomains`. Flattens monologue sentences to `TranscriptSentence[]`, sorts by `start` time, then calls `groupTranscriptTurns()` from `src/lib/transcript-formatter.ts` to produce speaker-labelled `FormattedTurn[]`.
5. **`buildExportContent()` in `src/lib/transcript-formatter.ts`** — Applies optional `filterFillerTurns()` (removes short/filler turns) and `condenseInternalMonologues()` (merges consecutive same-speaker internal turns). Renders the chosen format. Token count is estimated via `estimateTokens()` from `src/lib/token-utils.ts` and shown in the UI.
6. **Delivery** — `downloadFile()` from `src/lib/format-utils.ts` for single-file export; `navigator.clipboard.writeText()` for copy; `downloadZip()` (client-zip library) for ZIP with per-call files and a `manifest.json`.

---

## Flow 5: AI Research Analysis Pipeline

**What it does:** A five-stage pipeline that scores call relevance with a cheap model, surgically extracts relevant transcript segments, truncates long internal monologues, runs per-call finding extraction with a smart model, then synthesizes cross-call themes. Supports iterative follow-up questions against the cached processed data.

**Triggered by:** User entering a research question and clicking "Score Calls" then "Analyze" in `src/components/analyze-panel.tsx`.

```mermaid
sequenceDiagram
    actor User
    participant Panel as src/components/analyze-panel.tsx (AnalyzePanel)
    participant ScoreRoute as src/app/api/analyze/score/route.ts
    participant TranscriptRoute as src/app/api/gong/transcripts/route.ts
    participant ProcessRoute as src/app/api/analyze/process/route.ts
    participant RunRoute as src/app/api/analyze/run/route.ts
    participant SynthRoute as src/app/api/analyze/synthesize/route.ts
    participant FollowupRoute as src/app/api/analyze/followup/route.ts
    participant GeminiFlashLite as Gemini 2.0 Flash-Lite (cheapCompleteJSON)
    participant GPT4o as GPT-4o (smartCompleteJSON)

    User->>Panel: Enter research question → handleScore()

    Panel->>ScoreRoute: POST /api/analyze/score<br/>{ question, calls[{ id, title, brief, keyPoints,<br/>outline, trackers, topics, talkRatio }] }
    ScoreRoute->>GeminiFlashLite: cheapCompleteJSON() — one prompt per call (all parallel)
    GeminiFlashLite-->>ScoreRoute: { score: 0-10, reason, relevant_sections[] }
    ScoreRoute-->>Panel: { scores[{ callId, score, reason, relevantSections }] }

    Panel->>Panel: setScoredCalls() sorted by score desc<br/>Auto-select calls with score >= 3

    User->>Panel: Review scores, adjust selection → handleAnalyze()

    Panel->>TranscriptRoute: POST /api/gong/transcripts { callIds, baseUrl }
    TranscriptRoute-->>Panel: { transcripts[{ callId, transcript[] }] }

    loop For each selected call (sequential)
        Panel->>Panel: buildUtterances(monologues, speakerClassifier)<br/>— src/lib/tracker-alignment.ts
        Panel->>Panel: extractTrackerOccurrences(call.trackers)<br/>— src/lib/tracker-alignment.ts
        Panel->>Panel: alignTrackersToUtterances(utterances, trackerOccs)<br/>— src/lib/tracker-alignment.ts
        Panel->>Panel: performSurgery(callId, utterances, outline,<br/>relevantSections, durationMs)<br/>— src/lib/transcript-surgery.ts

        alt surgery.longInternalMonologues.length > 0
            Panel->>ProcessRoute: POST /api/analyze/process<br/>{ question, monologues[{ index, text }] }
            ProcessRoute->>GeminiFlashLite: cheapCompleteJSON(buildSmartTruncationPrompt())
            GeminiFlashLite-->>ProcessRoute: [{ index, kept }]
            ProcessRoute-->>Panel: { truncated[{ index, kept }] }
            Panel->>Panel: Patch surgery.excerpts[index].text = kept
        end

        Panel->>Panel: formatExcerptsForAnalysis(excerpts, callTitle,<br/>date, account, talkRatioPct, trackerNames,<br/>sectionsUsed, keyPoints)<br/>— src/lib/transcript-surgery.ts
        Panel->>Panel: estimateInputTokens(callDataStr)<br/>Check vs TOKEN_BUDGET (250,000)

        Panel->>RunRoute: POST /api/analyze/run { question, callData: callDataStr }
        RunRoute->>GPT4o: smartCompleteJSON() — finding extraction prompt
        GPT4o-->>RunRoute: { findings[{ exact_quote, timestamp,<br/>context, significance, finding_type }] }
        RunRoute-->>Panel: { findings[] }
        Panel->>Panel: allCallFindings.push({ callId, callTitle, account, findings })
    end

    Panel->>Panel: setProcessedDataCache(allProcessedData.join('---'))

    Panel->>SynthRoute: POST /api/analyze/synthesize<br/>{ question, allFindings[] }
    SynthRoute->>GPT4o: smartCompleteJSON() — cross-call theme synthesis
    GPT4o-->>SynthRoute: { themes[{ theme, frequency,<br/>representative_quotes, call_ids }], overall_summary }
    SynthRoute-->>Panel: { themes, overall_summary }
    Panel->>Panel: setStage('results')

    opt User submits follow-up question (up to 10)
        User->>Panel: Type follow-up → handleFollowUp()
        Panel->>FollowupRoute: POST /api/analyze/followup<br/>{ question, followUpQuestion,<br/>processedData (cached), previousFindings }
        FollowupRoute->>GPT4o: smartCompleteJSON() — follow-up answer prompt
        GPT4o-->>FollowupRoute: { answer, supporting_quotes[], calls_referenced[] }
        FollowupRoute-->>Panel: { answer, supporting_quotes }
        Panel->>Panel: setFollowUps([...prev, { question, answer, supporting_quotes }])
    end
```

### Step-by-step

**Stage 1 — Scoring (`handleScore`)**

1. **`src/components/analyze-panel.tsx` — `handleScore()`** — Sends all selected calls' metadata (title, brief, keyPoints, outline, trackers, topics, talkRatio) to `POST /api/analyze/score`.
2. **`src/app/api/analyze/score/route.ts` — `POST()`** — Scores all calls in parallel using `cheapCompleteJSON()` from `src/lib/ai-providers.ts`, which calls Gemini 2.0 Flash-Lite (`gemini-2.0-flash-lite`). Returns a 0–10 relevance score, one-sentence reason, and the outline section names most likely to contain signal.
3. Back in the panel: calls are sorted by score descending. Any call scoring ≥ 3 is pre-selected. User can deselect before proceeding to analysis.

**Stage 2 — Transcript Fetch**

4. **`handleAnalyze()`** — Fetches transcripts for the selected calls via `POST /api/gong/transcripts` (same route as the export pipeline, batched at 50 IDs with 350 ms rate limiting).

**Stage 3 — Transcript Surgery (per call, sequential)**

5. **`buildUtterances()`** in `src/lib/tracker-alignment.ts` — Converts raw Gong monologue objects into `Utterance[]` with `startTimeMs`/`endTimeMs`/`midTimeMs`, speaker classification via the `speakerClassifier` closure, and empty `trackers[]`.
6. **`extractTrackerOccurrences()` + `alignTrackersToUtterances()`** in `src/lib/tracker-alignment.ts` — Aligns tracker firing timestamps to utterances using four-step logic: exact containment → ±3s (`WINDOW_MS`) fallback → speaker preference → closest by midpoint distance. Mutates `utterance.trackers[]` in place.
7. **`performSurgery()`** in `src/lib/transcript-surgery.ts` — Filters out filler turns (via `isFiller()`), greeting/closing turns (first/last 60 s, under 15 words), and sub-8-word turns. Retains only utterances falling within relevant outline time windows (from `buildChapterWindows()`) or carrying tracker matches. Adds `contextBefore` for external-speaker utterances via `enrichContext()`. Flags internal monologues over 60 words as `needsSmartTruncation`.

**Stage 4 — Smart Truncation (conditional)**

8. If `surgery.longInternalMonologues` is non-empty, the panel POSTs them to `POST /api/analyze/process`. **`src/app/api/analyze/process/route.ts`** calls `buildSmartTruncationPrompt()` from `src/lib/transcript-surgery.ts` and passes it to `cheapCompleteJSON()` (Gemini Flash-Lite). The returned `kept` strings are patched back into `surgery.excerpts[index].text`, replacing the long originals.

**Stage 5 — Per-call Finding Extraction**

9. **`formatExcerptsForAnalysis()`** in `src/lib/transcript-surgery.ts` — Renders excerpts as a structured text block with call metadata header, `[REP CONTEXT]`/`[CUSTOMER]` labels, tracker annotations, and section names.
10. **`POST /api/analyze/run`** — `src/app/api/analyze/run/route.ts` calls `smartCompleteJSON()` (GPT-4o, `gpt-4o`) with the formatted excerpt block. Returns structured findings: `exact_quote`, `timestamp`, `context`, `significance` (high/medium/low), `finding_type` (objection/need/competitive/question/feedback).
11. Token usage is accumulated via `estimateInputTokens()` (chars / 4) and checked against `TOKEN_BUDGET` (250,000). If exceeded, analysis halts and an error is displayed.

**Stage 6 — Synthesis**

12. **`POST /api/analyze/synthesize`** — `src/app/api/analyze/synthesize/route.ts` calls `smartCompleteJSON()` (GPT-4o) with all per-call findings combined. Returns cross-call `themes[]` with frequency counts and representative verbatim quotes, plus an `overall_summary`. The panel stores these and transitions to `stage = 'results'`.

**Follow-up Questions**

13. The full `processedDataCache` string (all `callDataStr` blocks joined with `---`) and `callFindings` are cached in component state after analysis completes. On each follow-up, **`POST /api/analyze/followup`** sends the cache plus the new question to `smartCompleteJSON()` (GPT-4o). Returns `{ answer, supporting_quotes[], calls_referenced[] }`. Up to 10 follow-ups are allowed per analysis session.
