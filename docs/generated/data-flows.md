# GongWizard Data Flows

This document describes the major data pipelines in GongWizard. All flows are client-initiated; there are no background jobs or cron processes. The app is stateless — no database is involved. Gong API credentials are stored in `sessionStorage` only and forwarded to Gong via the Next.js proxy routes on each request.

---

## Flow 1: Site Authentication (Password Gate)

**Triggered when:** Any unauthenticated user navigates to any page on the site.

The app uses a shared site password (unrelated to Gong credentials) to restrict access. The Next.js middleware checks for a cookie on every request and redirects unauthenticated users to `/gate`.

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Middleware as src/middleware.ts<br/>middleware()
    participant GatePage as src/app/gate/page.tsx<br/>GatePage
    participant AuthRoute as src/app/api/auth/route.ts<br/>POST /api/auth

    User->>Browser: Navigate to any page (e.g. /)
    Browser->>Middleware: HTTP request
    Middleware->>Middleware: Check cookies.get('gw-auth')
    alt gw-auth cookie missing or not '1'
        Middleware-->>Browser: 302 Redirect to /gate
        Browser->>GatePage: Load /gate
        User->>GatePage: Enter site password, submit
        GatePage->>AuthRoute: POST /api/auth { password }
        AuthRoute->>AuthRoute: Compare password to process.env.SITE_PASSWORD
        alt Password correct
            AuthRoute-->>GatePage: 200 { ok: true }<br/>Set-Cookie: gw-auth=1; httpOnly; maxAge=7d
            GatePage->>Browser: router.push('/') + router.refresh()
        else Password wrong
            AuthRoute-->>GatePage: 401 { error: 'Incorrect password.' }
            GatePage->>User: Display error message
        end
    else gw-auth === '1'
        Middleware-->>Browser: NextResponse.next() — allow through
    end
```

**Step-by-step:**

1. `src/middleware.ts:middleware()` runs on every request matching the `matcher` pattern. It skips `/gate`, `/api/*`, and `/_next/*` paths.
2. For all other paths, it reads `request.cookies.get('gw-auth')`. If the value is not `'1'`, it clones the URL, sets `pathname = '/gate'`, and returns a redirect.
3. The user lands on `src/app/gate/page.tsx:GatePage`, which renders a password form.
4. On submit, `GatePage:handleSubmit()` POSTs `{ password }` to `/api/auth`.
5. `src/app/api/auth/route.ts:POST()` compares the submitted password against `process.env.SITE_PASSWORD`. On success it calls `response.cookies.set('gw-auth', '1', { httpOnly: true, maxAge: 604800, sameSite: 'lax' })` and returns `{ ok: true }`.
6. `GatePage` calls `router.push('/')` and `router.refresh()` to proceed to the connect step.

---

## Flow 2: Gong API Connection (Credential Validation)

**Triggered when:** The user submits their Gong Access Key and Secret Key on the Connect page (`/`).

This flow validates credentials and pre-fetches the org-level data (users, trackers, workspaces) that will be needed throughout the session. All results are saved to `sessionStorage` via `saveSession()`.

```mermaid
sequenceDiagram
    actor User
    participant ConnectPage as src/app/page.tsx<br/>ConnectPage
    participant ConnectRoute as src/app/api/gong/connect/route.ts<br/>POST /api/gong/connect
    participant GongAPI as Gong API<br/>(api.gong.io)
    participant SessionStorage as Browser<br/>sessionStorage

    User->>ConnectPage: Enter Access Key + Secret Key, click Connect
    ConnectPage->>ConnectPage: btoa(accessKey:secretKey) → authHeader
    ConnectPage->>ConnectRoute: POST /api/gong/connect<br/>X-Gong-Auth: <base64><br/>Body: {}

    ConnectRoute->>ConnectRoute: Validate X-Gong-Auth header present

    par Parallel fetch (Promise.allSettled)
        ConnectRoute->>GongAPI: GET /v2/users (paginated via fetchAllPages)
        GongAPI-->>ConnectRoute: { users: [...], records: { cursor } }
        Note over ConnectRoute,GongAPI: Loops until cursor is undefined<br/>350ms delay between pages
    and
        ConnectRoute->>GongAPI: GET /v2/settings/trackers (paginated via fetchAllPages)
        GongAPI-->>ConnectRoute: { trackers: [...] }
    and
        ConnectRoute->>GongAPI: GET /v2/workspaces (single fetch via gongFetch)
        GongAPI-->>ConnectRoute: { workspaces: [...] }
    end

    ConnectRoute->>ConnectRoute: Derive internalDomains from user email addresses
    ConnectRoute-->>ConnectPage: 200 { users, trackers, workspaces, internalDomains, baseUrl }

    ConnectPage->>SessionStorage: saveSession({ ...data, authHeader })<br/>key: 'gongwizard_session'
    ConnectPage->>ConnectPage: router.push('/calls')
```

**Step-by-step:**

1. `src/app/page.tsx:ConnectPage:handleConnect()` Base64-encodes `accessKey:secretKey` using `btoa()` to produce the `authHeader`.
2. It POSTs to `/api/gong/connect` with `X-Gong-Auth: <authHeader>` in the headers.
3. `src/app/api/gong/connect/route.ts:POST()` extracts the auth header and calls three Gong endpoints in parallel using `Promise.allSettled()`:
   - `fetchAllPages('/v2/users', 'users')` — paginates through all users; 350ms sleep between pages to respect rate limits.
   - `fetchAllPages('/v2/settings/trackers', 'trackers')` — paginates through all keyword trackers.
   - `gongFetch('/v2/workspaces')` — single request for workspace list.
4. If the users fetch returns a 401, the route immediately returns `{ error: 'Invalid API credentials' }`. Partial failures for trackers/workspaces generate warnings, not errors.
5. `internalDomains` is derived by extracting the email domain from each user's `emailAddress` field and deduplicating into an array. This is used later for speaker classification.
6. The route returns all results in one response. `ConnectPage:saveSession()` writes the entire payload (including `authHeader`) to `sessionStorage` under the key `'gongwizard_session'`.
7. `router.push('/calls')` navigates to the main calls view.

---

## Flow 3: Call List Fetch (Date-Range Query)

**Triggered when:** The user sets a date range and clicks "Load Calls" on the Calls page (`/calls`).

This is a two-stage pipeline: first fetch basic call IDs, then fetch full metadata in batches of 10 using the extensive endpoint. Falls back to basic data if the extensive endpoint returns 403.

```mermaid
sequenceDiagram
    actor User
    participant CallsPage as src/app/calls/page.tsx<br/>CallsPage
    participant CallsRoute as src/app/api/gong/calls/route.ts<br/>POST /api/gong/calls
    participant GongAPI as Gong API<br/>(api.gong.io)

    User->>CallsPage: Click "Load Calls"
    CallsPage->>CallsPage: loadCalls() — read session from sessionStorage
    CallsPage->>CallsRoute: POST /api/gong/calls<br/>X-Gong-Auth: <base64><br/>Body: { fromDate, toDate, baseUrl, workspaceId? }

    Note over CallsRoute: Stage 1: Collect all call IDs

    loop Paginated GET until no cursor
        CallsRoute->>GongAPI: GET /v2/calls?fromDateTime=...&toDateTime=...
        GongAPI-->>CallsRoute: { calls: [...], records: { cursor? } }
        Note over CallsRoute: 350ms sleep if more pages
    end

    alt No calls found
        CallsRoute-->>CallsPage: 200 { calls: [] }
    end

    Note over CallsRoute: Stage 2: Fetch extensive metadata in batches of 10

    loop For each batch of 10 callIds
        CallsRoute->>GongAPI: POST /v2/calls/extensive<br/>{ filter: { callIds }, contentSelector: { parties, topics, trackers, brief... } }
        GongAPI-->>CallsRoute: { calls: [...], records: { cursor? } }
        Note over CallsRoute: Inner pagination loop + 350ms delay<br/>On 403: set extensiveFailed=true, break
    end

    alt extensiveFailed (403 from extensive)
        CallsRoute->>CallsRoute: Normalize basicCalls to flat shape
    else Extensive succeeded
        CallsRoute->>CallsRoute: Normalize extensiveCalls via extractFieldValues()<br/>Map context.objects.fields for accountName, industry, website
    end

    CallsRoute-->>CallsPage: 200 { calls: NormalizedCall[] }

    CallsPage->>CallsPage: Map parties → internalSpeakerCount / externalSpeakerCount<br/>(using session.internalDomains)
    CallsPage->>CallsPage: Extract trackerNames from call.trackers<br/>(filter count > 0)
    CallsPage->>CallsPage: setCalls(processed) + setHasLoaded(true)
    CallsPage->>User: Render call cards with topics, trackers, brief, talkRatio
```

**Step-by-step:**

1. `src/app/calls/page.tsx:CallsPage:loadCalls()` reads `session` from state (previously loaded from `sessionStorage`). It builds the request body with ISO timestamps.
2. `src/app/api/gong/calls/route.ts:POST()` runs Stage 1: a paginated `GET /v2/calls` loop. Each page appends to `basicCalls`; the loop exits when `data?.records?.cursor` is undefined.
3. Stage 2: for every batch of up to 10 `callIds`, it POSTs to `/v2/calls/extensive` with a `contentSelector` requesting `parties`, `topics`, `trackers`, `brief`, `keyPoints`, `actionItems`, `outline`, `structure`, and `context: 'Extended'`. Each batch may itself paginate.
4. If `/v2/calls/extensive` returns 403 (insufficient scope), `extensiveFailed` is set and the loop breaks. The route falls back to normalizing the basic call data, with empty `parties`, `topics`, `trackers`, etc.
5. For extensive calls, `extractFieldValues()` walks the nested `context[].objects[].fields[]` structure (ported from Python v1) to extract `accountName`, `accountIndustry`, and `accountWebsite`.
6. Back in `CallsPage`, each raw call's `parties` array is walked to classify speakers as internal or external using `p.affiliation === 'Internal'` or matching against `session.internalDomains`. Tracker names are extracted and filtered for `count > 0`.
7. `setCalls(processed)` triggers a re-render showing the call list with badges, brief text, and talk ratio bars.

---

## Flow 4: Transcript Fetch and Export

**Triggered when:** The user selects one or more calls and clicks "Download" or "Copy to Clipboard".

This is the primary value-add pipeline: it fetches raw transcript monologues from Gong, reassembles them into speaker turns, applies formatting transforms, and renders the result in Markdown, XML, or JSONL.

```mermaid
sequenceDiagram
    actor User
    participant CallsPage as src/app/calls/page.tsx<br/>CallsPage
    participant TranscriptsRoute as src/app/api/gong/transcripts/route.ts<br/>POST /api/gong/transcripts
    participant GongAPI as Gong API<br/>(api.gong.io)
    participant Browser as Browser<br/>(Clipboard / Download)

    User->>CallsPage: Click "Download" or "Copy"
    CallsPage->>CallsPage: handleExport() / handleCopy()<br/>→ fetchTranscriptsForSelected()

    CallsPage->>TranscriptsRoute: POST /api/gong/transcripts<br/>X-Gong-Auth: <base64><br/>Body: { callIds: [...], baseUrl }

    Note over TranscriptsRoute: Batch callIds in groups of 50

    loop For each batch of 50
        loop Paginated POST until no cursor
            TranscriptsRoute->>GongAPI: POST /v2/calls/transcript<br/>{ filter: { callIds: batch }, cursor? }
            GongAPI-->>TranscriptsRoute: { callTranscripts: [{ callId, transcript: [monologue] }], records: { cursor? } }
            Note over TranscriptsRoute: Accumulate into transcriptMap[callId]<br/>350ms sleep between pages and batches
        end
    end

    TranscriptsRoute-->>CallsPage: 200 { transcripts: [{ callId, transcript }] }

    Note over CallsPage: fetchTranscriptsForSelected() — assemble speaker turns

    loop For each transcript
        CallsPage->>CallsPage: Look up callMeta from calls state (callMap.get(t.callId))
        CallsPage->>CallsPage: Build speakerMap from callMeta.parties<br/>Classify internal/external via internalDomains
        CallsPage->>CallsPage: Flatten track.sentences → TranscriptSentence[]<br/>Sort by sentence.start
        CallsPage->>CallsPage: groupTranscriptTurns(sentences, speakerMap)<br/>→ Merge consecutive same-speaker sentences into FormattedTurn[]
    end

    Note over CallsPage: handleExport / handleCopy — format and deliver

    alt exportFormat === 'markdown'
        CallsPage->>CallsPage: buildMarkdown(callsForExport, exportOpts)
        Note over CallsPage: buildCallText() per call:<br/>filterFillerTurns() if removeFillerGreetings<br/>condenseInternalMonologues() if condenseMonologues<br/>External speaker text → toUpperCase()
    else exportFormat === 'xml'
        CallsPage->>CallsPage: buildXML(callsForExport, exportOpts)<br/>escapeXml() on all string values
    else exportFormat === 'jsonl'
        CallsPage->>CallsPage: buildJSONL(callsForExport, exportOpts)<br/>One JSON object per call, JSON.stringify()
    end

    alt handleExport
        CallsPage->>Browser: downloadFile(content, filename, mime)<br/>Blob → object URL → <a>.click()
    else handleCopy
        CallsPage->>Browser: navigator.clipboard.writeText(content)
        CallsPage->>User: setCopied(true) → show "Copied!" for 2s
    end
```

**Step-by-step:**

1. `src/app/calls/page.tsx:CallsPage:handleExport()` (or `handleCopy()`) calls `fetchTranscriptsForSelected()` with the current `selectedIds` set.
2. `fetchTranscriptsForSelected()` POSTs the array of call IDs and the `baseUrl` from session to `/api/gong/transcripts`.
3. `src/app/api/gong/transcripts/route.ts:POST()` processes call IDs in batches of 50 (`BATCH_SIZE = 50`). For each batch it POSTs to `/v2/calls/transcript` with `filter: { callIds: batch }`. Results are accumulated into a `transcriptMap` keyed by `callId`. The inner loop handles pagination; `sleep(350)` is called between pages and between batches to stay within Gong's rate limits.
4. The route returns `{ transcripts: [{ callId, transcript }] }` where `transcript` is the raw array of monologue tracks from Gong.
5. Back in `fetchTranscriptsForSelected()`, for each transcript:
   - The matching call metadata is retrieved from the `calls` state map.
   - A `speakerMap: Map<string, Speaker>` is built from `callMeta.parties`. Each party's `isInternal` flag is determined by `p.affiliation === 'Internal'` or by matching the email domain against `session.internalDomains`.
   - Each monologue track (`track.speakerId` + `track.sentences[]`) is flattened into a sorted array of `TranscriptSentence` objects (with `speakerId`, `text`, `start`).
   - `groupTranscriptTurns(sentences, speakerMap)` merges consecutive sentences from the same speaker into `FormattedTurn` objects, each carrying `speakerId`, `firstName`, `isInternal`, `timestamp` (formatted as `m:ss`), and concatenated `text`.
6. The array of `CallForExport` objects is passed to `buildMarkdown()`, `buildXML()`, or `buildJSONL()` depending on `exportFormat`.
7. Each formatter calls `filterFillerTurns()` (removes short/greeting-only utterances) and `condenseInternalMonologues()` (merges 3+ consecutive internal turns from the same speaker) if the corresponding `ExportOptions` flags are set. External speaker text is converted to uppercase to visually distinguish voices.
8. `downloadFile()` creates a `Blob`, generates an object URL, programmatically clicks an `<a>` element, then revokes the URL. For copy, `navigator.clipboard.writeText()` is used and a 2-second "Copied!" state is shown.
