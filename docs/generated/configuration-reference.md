# GongWizard — Configuration Reference

---

## 1. Environment Variables

| Name | Purpose | Required / Optional | Default Value | Where Used |
|---|---|---|---|---|
| `SITE_PASSWORD` | Password checked at `/api/auth` to issue the `gw-auth` session cookie | **Required** | — | `src/app/api/auth/route.ts` |
| `GEMINI_API_KEY` | API key for Google Gemini (both Flash-Lite cheap tier and 2.5 Pro smart tier) | **Required** (for AI analysis features) | — | `src/lib/ai-providers.ts` |

**Notes:**

- No database is used. Gong API credentials are user-supplied at runtime via the Connect page, Base64-encoded into `authHeader`, and stored in browser `sessionStorage` under the key `gongwizard_session`. They are never persisted server-side and are not environment variables.
- The `openai` package appears in `package.json` but no `OPENAI_API_KEY` reference exists in the current source files — it is unused at the time of this writing.

**No `.env.example` file exists in the repository.** The only env vars scanned from code are `SITE_PASSWORD` (in `src/app/api/auth/route.ts`) and `GEMINI_API_KEY` (in `src/lib/ai-providers.ts`).

---

## 2. Build / Runtime Configuration

### `next.config.ts`

Location: `next.config.ts` (project root)

```typescript
const nextConfig: NextConfig = {
  /* config options here */
};
```

The config object is empty — no custom Next.js settings are applied. Turbopack is enabled by default in Next.js 16 (used when running `next dev`).

---

### `tsconfig.json`

Location: `tsconfig.json` (project root)

| Option | Value | Effect |
|---|---|---|
| `target` | `"ES2017"` | Compiles down to ES2017 syntax |
| `lib` | `["dom", "dom.iterable", "esnext"]` | Includes browser and latest ES APIs |
| `strict` | `true` | Enables all strict type checks |
| `noEmit` | `true` | Type-checks only — no output files (Next.js handles compilation) |
| `module` | `"esnext"` | ESM module format |
| `moduleResolution` | `"bundler"` | Resolves modules using bundler-style logic (required for Next.js 13+) |
| `resolveJsonModule` | `true` | Allows importing `.json` files as modules |
| `isolatedModules` | `true` | Each file must be a module (required for SWC/esbuild) |
| `jsx` | `"react-jsx"` | Uses the React 17+ automatic JSX transform |
| `incremental` | `true` | Enables incremental compilation cache |
| `plugins` | `[{ "name": "next" }]` | Activates Next.js TypeScript plugin |
| `paths` | `{ "@/*": ["./src/*"] }` | Maps `@/` imports to `src/` directory |

---

### Tailwind CSS

Tailwind v4 is used. There is no `tailwind.config.ts` file — Tailwind v4 uses CSS-based configuration only. Custom theme tokens (CSS custom properties) are defined in `src/app/globals.css` (not included in the repomix output but referenced by `src/app/layout.tsx`).

The PostCSS integration is provided via the `@tailwindcss/postcss` dev dependency.

---

### ESLint

ESLint v9 is configured with `eslint-config-next` (version 16.1.6). No custom rules file was included in the repomix output. Lint is run via:

```bash
npm run lint  # runs: eslint
```

---

## 3. Feature Flags / Constants

### `src/lib/gong-api.ts`

| Name | Value | Type | What It Controls |
|---|---|---|---|
| `GONG_RATE_LIMIT_MS` | `350` | `number` (ms) | Delay between consecutive Gong API requests; keeps request rate safely under Gong's ~3 req/s limit |
| `EXTENSIVE_BATCH_SIZE` | `10` | `number` | Max call IDs per `/v2/calls/extensive` POST request (Gong API limit) |
| `TRANSCRIPT_BATCH_SIZE` | `50` | `number` | Max call IDs per `/v2/calls/transcript` POST request (Gong API limit); also used in `src/app/api/gong/search/route.ts` |
| `MAX_RETRIES` | `5` | `number` | Max retry attempts for any Gong API request before throwing; uses exponential backoff (2s, 4s, 8s, 16s, 30s capped) |

---

### `src/app/api/gong/calls/route.ts`

| Name | Value | Type | What It Controls |
|---|---|---|---|
| `MAX_DATE_RANGE_DAYS` | `365` | `number` (days) | Maximum allowed date range for a call list fetch; prevents accidental multi-year queries |
| `CHUNK_DAYS` | `30` | `number` (days) | Gong call list queries are split into 30-day windows; Gong performs best with ≤30-day windows |

---

### `src/lib/transcript-formatter.ts`

| Name | Value | Type | What It Controls |
|---|---|---|---|
| `INTERNAL_WORD_THRESHOLD` | `150` | `number` (words) | Internal rep turns with ≥150 words are truncated to first 2 sentences + `[...]` + last 2 sentences when `condenseMonologues` export option is enabled |

---

### `src/lib/transcript-surgery.ts`

| Name | Value | Type | What It Controls |
|---|---|---|---|
| `GREETING_CLOSING_WINDOW_MS` | `60_000` | `number` (ms) | Utterances in the first or last 60 seconds of a call with fewer than 15 words are treated as greeting/closing noise and excluded from analysis excerpts |
| `WINDOW_MS` (in `alignTrackersToUtterances`) | `3000` | `number` (ms) | ±3 second fallback window for aligning tracker occurrences to utterances when exact containment fails |
| `windowMs` default (in `findNearestOutlineItem`) | `30_000` | `number` (ms) | Search window for matching an outline item description to a given timestamp; uses the closest item within ±30 seconds |
| Minimum utterance word length (in `performSurgery`) | `8` | `number` (words) | Utterances shorter than 8 words are dropped during surgical extraction (ported from V2) |
| Smart truncation threshold (in `performSurgery`) | `60` | `number` (words) | Internal monologues with more than 60 words are flagged as `needsSmartTruncation` for AI-assisted condensing via `/api/analyze/process` |

---

### `src/components/analyze-panel.tsx`

| Name | Value | Type | What It Controls |
|---|---|---|---|
| `TOKEN_BUDGET` | `800_000` | `number` (tokens) | Maximum input token budget for surgical transcript extraction before calls are excluded from a batch analysis run |
| `MAX_QUESTIONS` | `5` | `number` | Maximum number of follow-up questions allowed in a single analysis session |
| `QUESTION_TEMPLATES` | Array of 5 entries | `{ label: string; q: string }[]` | Preset question shortcuts shown in the Analyze panel: "Objections", "Needs", "Competitive", "Feedback", "Questions" |

---

### `src/lib/session.ts`

| Name | Value | Type | What It Controls |
|---|---|---|---|
| `SESSION_KEY` | `'gongwizard_session'` | `string` | `sessionStorage` key under which `GongSession` data (`authHeader`, `users`, `trackers`, `workspaces`, `internalDomains`, `baseUrl`) is stored |

---

### `src/hooks/useFilterState.ts`

| Name | Value | Type | What It Controls |
|---|---|---|---|
| `STORAGE_KEY` | `'gongwizard_filters'` | `string` | `localStorage` key for persisting filter state (`excludeInternal`, duration range, talk ratio range, `minExternalSpeakers`) across page reloads |

Default filter values applied on first load (or after `resetFilters()`):

| Filter | Default |
|---|---|
| `durationMin` | `0` |
| `durationMax` | `7200` (2 hours) |
| `talkRatioMin` | `0` |
| `talkRatioMax` | `100` |
| `minExternalSpeakers` | `0` |
| `excludeInternal` | `false` |

---

### `src/lib/token-utils.ts` — Context Window Labels

| Token Range | Label |
|---|---|
| < 8,000 | `'Fits GPT-3.5 (8K)'` |
| < 16,000 | `'Fits Claude Haiku (16K)'` |
| < 32,000 | `'Fits ChatGPT Plus (32K)'` |
| < 128,000 | `'Fits GPT-4o / Claude (128K)'` |
| < 200,000 | `'Fits Claude (200K)'` |
| ≥ 200,000 | `'Exceeds most context windows'` |

Token estimation formula: `Math.ceil(text.length / 4)` (characters ÷ 4).

---

### Auth Cookie — `src/app/api/auth/route.ts`

| Property | Value |
|---|---|
| Cookie name | `gw-auth` |
| Cookie value (on success) | `'1'` |
| `httpOnly` | `true` |
| `maxAge` | `604800` (60 × 60 × 24 × 7 = 7 days) |
| `path` | `'/'` |
| `sameSite` | `'lax'` |

---

### Gong API Default Base URL

All Gong proxy routes (`connect`, `calls`, `transcripts`, `search`) accept an optional `baseUrl` field in the POST body. The default when not supplied:

```text
https://api.gong.io
```

This allows custom Gong instance URLs (used by some enterprise Gong deployments).

---

### `src/app/api/analyze/batch-run/route.ts`

| Property | Value | What It Controls |
|---|---|---|
| `export const maxDuration` | `60` | Vercel serverless function max execution time (seconds) for the batch analysis route |

---

## 4. Third-Party Service Configuration

### Google Gemini (AI Analysis)

| Property | Detail |
|---|---|
| **Purpose** | Powers all AI analysis routes: call scoring, per-call finding extraction, batch analysis, synthesis, follow-up Q&A, and internal monologue smart truncation |
| **Required env var** | `GEMINI_API_KEY` |
| **SDK package** | `@google/genai` v1.43.0 |
| **Client initialization** | `src/lib/ai-providers.ts` — lazy-initialized singleton via `getGemini()` |
| **Cheap tier model** | `gemini-3.1-flash-lite-preview` — used by `cheapComplete` / `cheapCompleteJSON` |
| **Smart tier model** | `gemini-2.5-pro` — used by `smartComplete` / `smartCompleteJSON` / `smartStream` |

**Cheap tier usage (scoring + smart truncation):**

- `src/app/api/analyze/score/route.ts` — relevance scoring, temperature `0.2`, maxTokens `4096`
- `src/app/api/analyze/process/route.ts` — internal monologue truncation, temperature `0.2`, maxTokens `2048`

**Smart tier usage (finding extraction + synthesis):**

- `src/app/api/analyze/run/route.ts` — per-call finding extraction, temperature `0.3`, maxTokens `4096`
- `src/app/api/analyze/batch-run/route.ts` — multi-call batch finding extraction, temperature `0.3`, maxTokens `16384`
- `src/app/api/analyze/synthesize/route.ts` — synthesis across all findings, temperature `0.3`, maxTokens `4096`
- `src/app/api/analyze/followup/route.ts` — follow-up Q&A, temperature `0.3`, maxTokens `4096`

All JSON-returning routes pass `responseMimeType: 'application/json'` (native JSON mode — no regex extraction needed).

---

### Gong API (Call Data)

| Property | Detail |
|---|---|
| **Purpose** | Source of all call data: users, trackers, workspaces, call list, extensive call metadata, transcripts |
| **Required credentials** | User-supplied Gong Access Key + Secret Key, Base64-encoded at runtime into HTTP Basic auth header; transmitted as `X-Gong-Auth` request header |
| **Auth mechanism** | HTTP Basic Auth (`Authorization: Basic <base64(accessKey:secretKey)>`) |
| **Client initialization** | `src/lib/gong-api.ts` — `makeGongFetch(baseUrl, authHeader)` factory; no persistent client, credentials are per-request |
| **Credential storage** | Browser `sessionStorage` only, under key `gongwizard_session`; never stored server-side |

Endpoints proxied (all via server-side Next.js API routes):

| Gong Endpoint | Proxy Route |
|---|---|
| `GET /v2/users` | `src/app/api/gong/connect/route.ts` |
| `GET /v2/settings/trackers` | `src/app/api/gong/connect/route.ts` |
| `GET /v2/workspaces` | `src/app/api/gong/connect/route.ts` |
| `GET /v2/calls` | `src/app/api/gong/calls/route.ts` |
| `POST /v2/calls/extensive` | `src/app/api/gong/calls/route.ts` |
| `POST /v2/calls/transcript` | `src/app/api/gong/transcripts/route.ts`, `src/app/api/gong/search/route.ts` |

---

### Next.js Fonts (Google Fonts)

| Property | Detail |
|---|---|
| **Purpose** | Load Geist Sans and Geist Mono typefaces |
| **Fonts loaded** | `Geist` (CSS variable `--font-geist-sans`), `Geist_Mono` (CSS variable `--font-geist-mono`) |
| **Subset** | `["latin"]` |
| **Initialization** | `src/app/layout.tsx` via `next/font/google` |

No API key required — served via Next.js font optimization.

---

### client-zip (In-Browser ZIP)

| Property | Detail |
|---|---|
| **Purpose** | Client-side ZIP creation for the "Export as ZIP" feature (one file per call + `manifest.json`) |
| **Package** | `client-zip` v2.5.0 |
| **Usage** | `src/hooks/useCallExport.ts` — `downloadZip(files).blob()` |

No configuration or API keys required.

---

## 5. Middleware Configuration

File: `src/middleware.ts`

The Next.js Edge Middleware enforces site-level authentication on every request.

**Matcher pattern:**

```typescript
matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
```

**Bypass paths (no auth check):**

- `/gate` and all subpaths — the password entry page itself
- `/api/auth` — sets the `gw-auth` cookie
- `/api/gong/*` — Gong proxy routes (use `X-Gong-Auth` header instead)
- `/_next/*` — Next.js internals
- `/favicon*` — favicon assets

**Auth check:** Reads `gw-auth` cookie; if value is `'1'`, allows through. Otherwise redirects to `/gate`.

---

## 6. Configuration Dependency Diagram

```mermaid
graph TD
    subgraph "Server Environment"
        ENV_SITE[SITE_PASSWORD]
        ENV_GEMINI[GEMINI_API_KEY]
    end

    subgraph "Browser Session"
        SS[sessionStorage<br/>gongwizard_session]
        LS[localStorage<br/>gongwizard_filters]
        CK[Cookie: gw-auth]
    end

    subgraph "API Routes"
        AUTH[/api/auth]
        CONNECT[/api/gong/connect]
        CALLS[/api/gong/calls]
        TRANSCRIPTS[/api/gong/transcripts]
        SEARCH[/api/gong/search]
        ANALYZE[/api/analyze/*]
    end

    subgraph "External Services"
        GONG[Gong API<br/>api.gong.io]
        GEMINI[Google Gemini<br/>Flash-Lite + 2.5 Pro]
    end

    ENV_SITE --> AUTH
    AUTH --> CK
    CK --> MW[Middleware<br/>src/middleware.ts]

    ENV_GEMINI --> ANALYZE
    ANALYZE --> GEMINI

    SS -->|X-Gong-Auth header| CONNECT
    SS -->|X-Gong-Auth header| CALLS
    SS -->|X-Gong-Auth header| TRANSCRIPTS
    SS -->|X-Gong-Auth header| SEARCH
    CONNECT --> GONG
    CALLS --> GONG
    TRANSCRIPTS --> GONG
    SEARCH --> GONG

    GONG -->|users, trackers, workspaces| SS
    LS -->|filter persistence| BROWSER[Browser UI<br/>src/app/calls/page.tsx]
```
