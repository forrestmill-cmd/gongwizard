# GongWizard — Configuration Reference

## 1. Environment Variables

| Name | Purpose | Required / Optional | Default Value | Where Used |
|------|---------|-------------------|---------------|------------|
| `SITE_PASSWORD` | Password checked by `POST /api/auth` to issue the `gw-auth` session cookie. If unset the route returns HTTP 500. | Required | — | `src/app/api/auth/route.ts` |
| `GEMINI_API_KEY` | API key for Google Gemini. Consumed by the lazy singleton `getGemini()` to construct a `GoogleGenAI` client. Missing key throws `'GEMINI_API_KEY not configured'` at call time. | Required for AI analysis features | — | `src/lib/ai-providers.ts` |

**Notes:**

- No database is used. Gong API credentials are user-supplied at runtime via the Connect page, Base64-encoded as `btoa(accessKey:secretKey)`, stored in browser `sessionStorage` under `gongwizard_session`, and forwarded to all proxy routes via the `X-Gong-Auth` request header. They are never stored server-side and are not environment variables.
- The `openai` package appears in `package.json` but no `process.env.OPENAI_API_KEY` reference exists in any current source file — it is unused at the time of this writing.
- No `.env.example` file exists in the repository. The only `process.env` references found in code are `SITE_PASSWORD` and `GEMINI_API_KEY`.

---

## 2. Build / Runtime Configuration

### `next.config.ts`

Location: `next.config.ts` (project root)

```typescript
const nextConfig: NextConfig = {
  /* config options here */
};
```

The config object is empty — no custom Next.js settings are applied. All behavior is Next.js 16.1.6 defaults, including App Router and Turbopack dev server (enabled by default in Next.js 16 via `next dev`).

One route-level override exists outside `next.config.ts`: `export const maxDuration = 60` is declared at the top of four API route files. This is a Vercel-specific export that raises the serverless function timeout from the default 10 s to 60 s. Affected routes: `src/app/api/analyze/batch-run/route.ts`, `src/app/api/analyze/run/route.ts`, `src/app/api/analyze/synthesize/route.ts`, `src/app/api/analyze/followup/route.ts`.

---

### `tsconfig.json`

Location: `tsconfig.json` (project root)

| Option | Value | Effect |
|--------|-------|--------|
| `target` | `"ES2017"` | Compiles to ES2017 output |
| `lib` | `["dom", "dom.iterable", "esnext"]` | Includes browser DOM and latest ES types |
| `strict` | `true` | Enables all strict type-checks |
| `noEmit` | `true` | Type-check only; Next.js handles compilation |
| `module` | `"esnext"` | ESM module format |
| `moduleResolution` | `"bundler"` | Matches Next.js/Turbopack resolution strategy |
| `resolveJsonModule` | `true` | Allows importing `.json` files as modules |
| `isolatedModules` | `true` | Each file compiled independently (required for SWC/Turbopack) |
| `jsx` | `"react-jsx"` | React 17+ automatic JSX transform |
| `incremental` | `true` | Enables incremental compilation cache |
| `plugins` | `[{ "name": "next" }]` | Activates the Next.js TypeScript plugin for IDE diagnostics |
| `paths` | `{ "@/*": ["./src/*"] }` | `@/` alias resolves to `src/` throughout the codebase |

---

### Tailwind CSS / `src/app/globals.css` `@theme`

Tailwind v4 is used. There is no `tailwind.config.ts` file — all configuration is CSS-only via `@theme inline {}` and `:root {}` in `src/app/globals.css`.

**Imports in `globals.css`:**
- `tailwindcss` — core utility classes
- `tw-animate-css` (`^1.4.0`) — animation utilities
- `shadcn/tailwind.css` — shadcn/ui component token definitions

**Dark mode variant:** `@custom-variant dark (&:is(.dark *))` — activated by adding the `dark` class to a parent element.

**Fonts** (mapped in `@theme inline`):

| CSS Variable | Resolved Value |
|---|---|
| `--font-sans` | `var(--font-geist-sans)` — Geist loaded via `next/font/google` in `src/app/layout.tsx` |
| `--font-mono` | `var(--font-geist-mono)` — Geist Mono loaded via `next/font/google` in `src/app/layout.tsx` |

**Border radius** (base value, with derived variants):

| CSS Variable | Value |
|---|---|
| `--radius` | `0.625rem` |
| `--radius-sm` | `calc(var(--radius) - 4px)` |
| `--radius-md` | `calc(var(--radius) - 2px)` |
| `--radius-lg` | `var(--radius)` |
| `--radius-xl` | `calc(var(--radius) + 4px)` |
| `--radius-2xl` | `calc(var(--radius) + 8px)` |
| `--radius-3xl` | `calc(var(--radius) + 12px)` |
| `--radius-4xl` | `calc(var(--radius) + 16px)` |

**Color tokens** (light mode, all in oklch):

| CSS Variable | Value | Role |
|---|---|---|
| `--background` | `oklch(1 0 0)` | Page background (pure white) |
| `--foreground` | `oklch(0.145 0 0)` | Default text (near black) |
| `--primary` | `oklch(0.205 0 0)` | Primary action color (dark gray) |
| `--primary-foreground` | `oklch(0.985 0 0)` | Text on primary (near white) |
| `--secondary` | `oklch(0.97 0 0)` | Secondary surface |
| `--muted` | `oklch(0.97 0 0)` | Muted surface |
| `--muted-foreground` | `oklch(0.556 0 0)` | Muted/placeholder text |
| `--accent` | `oklch(0.97 0 0)` | Accent hover surface |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Destructive/error red |
| `--border` | `oklch(0.922 0 0)` | Default border |
| `--input` | `oklch(0.922 0 0)` | Input border |
| `--ring` | `oklch(0.708 0 0)` | Focus ring |

---

### ESLint

| Property | Value |
|---|---|
| Version | ESLint `^9` |
| Config | `eslint-config-next` version `16.1.6` (includes React, React Hooks, and Next.js-specific rules) |
| Run command | `npm run lint` (executes `eslint`) |

---

## 3. Feature Flags / Constants

### `src/lib/gong-api.ts`

| Name | Value | Type | What It Controls |
|------|-------|------|-----------------|
| `GONG_RATE_LIMIT_MS` | `350` | `number` | Milliseconds to sleep between consecutive Gong API requests. Keeps rate safely under Gong's ~3 req/s limit. Used in every proxy route that paginates or batches. |
| `EXTENSIVE_BATCH_SIZE` | `10` | `number` | Max call IDs per `/v2/calls/extensive` POST request. Gong API hard limit. Used in `src/app/api/gong/calls/route.ts`. |
| `TRANSCRIPT_BATCH_SIZE` | `50` | `number` | Max call IDs per `/v2/calls/transcript` POST request. Gong API hard limit. Used in `src/app/api/gong/transcripts/route.ts` and `src/app/api/gong/search/route.ts`. |
| `MAX_RETRIES` | `5` | `number` | Maximum retry attempts for failed Gong API requests before throwing. Does not apply to 401/403 errors (those throw immediately). Backoff formula: `min(2^attempt * 2, 30)` seconds. |

### `src/app/api/gong/calls/route.ts`

| Name | Value | Type | What It Controls |
|------|-------|------|-----------------|
| `MAX_DATE_RANGE_DAYS` | `365` | `number` | Maximum allowed date range for a call list query. Requests exceeding this return HTTP 400. |
| `CHUNK_DAYS` | `30` | `number` | Call list is fetched in 30-day windows. Larger ranges are automatically split into multiple sequential paginated fetches. |

### `src/lib/transcript-formatter.ts`

| Name | Value | Type | What It Controls |
|------|-------|------|-----------------|
| `INTERNAL_WORD_THRESHOLD` | `150` | `number` | Internal (rep) turns with ≥150 words are condensed by `truncateIfLong()` to first 2 sentences + `[...]` + last 2 sentences. Applied only when `condenseMonologues` export option is `true`. |

### `src/lib/transcript-surgery.ts`

| Name | Value | Type | What It Controls |
|------|-------|------|-----------------|
| `GREETING_CLOSING_WINDOW_MS` | `60_000` | `number` | First and last 60 seconds of a call are treated as greeting/closing zones. Utterances under 15 words within these zones are excluded from surgical extraction. |
| `FILLER_PATTERNS` | Regex array | `RegExp[]` | Single-regex list matching common filler words/phrases (`hi`, `yes`, `okay`, `mm-hmm`, etc.). Matched utterances are excluded from extraction. Any utterance under 5 characters is also treated as filler. |
| Minimum utterance word count (in `performSurgery`) | `8` | `number` | Utterances shorter than 8 words are dropped during surgical extraction. Ported from V2. |
| Smart truncation threshold (in `performSurgery`) | `60` | `number` | Internal monologues over 60 words are flagged `needsSmartTruncation = true` for AI-assisted condensing via `/api/analyze/process`. |
| `windowMs` default in `findNearestOutlineItem` | `30_000` | `number` | Outline item lookup tolerance: returns the closest item within ±30 seconds of a given timestamp. |

### `src/lib/tracker-alignment.ts`

| Name | Value | Type | What It Controls |
|------|-------|------|-----------------|
| `WINDOW_MS` (in `alignTrackersToUtterances`) | `3000` | `number` | ±3 second fallback window for aligning tracker occurrences to utterances. Applied in Step 2 of the four-step algorithm when exact containment fails. |

### `src/lib/token-utils.ts`

Token estimation formula: `Math.ceil(text.length / 4)` — rough chars-to-tokens approximation.

`contextLabel(tokens)` thresholds:

| Token Range | Label |
|---|---|
| < 8,000 | `'Small (fits most models)'` |
| < 16,000 | `'Medium (GPT-4, Claude Haiku)'` |
| < 128,000 | `'Large (GPT-4 Turbo, Claude Opus)'` |
| < 200,000 | `'Very large (Claude Sonnet, Gemini)'` |
| ≥ 200,000 | `'Exceeds typical context windows'` |

`contextColor(tokens)` thresholds:

| Token Range | CSS Class |
|---|---|
| < 32,000 | `text-green-600 dark:text-green-400` |
| < 128,000 | `text-yellow-600 dark:text-yellow-400` |
| ≥ 128,000 | `text-red-600 dark:text-red-400` |

### `src/hooks/useFilterState.ts`

| Name | Value | Type | What It Controls |
|------|-------|------|-----------------|
| `STORAGE_KEY` | `'gongwizard_filters'` | `string` | `localStorage` key for persisting numeric/boolean filter state across page reloads. Stores `excludeInternal`, `durationMin`, `durationMax`, `talkRatioMin`, `talkRatioMax`, `minExternalSpeakers`. |

Default filter values on first load or after `resetFilters()`:

| Filter | Default |
|---|---|
| `durationMin` | `0` |
| `durationMax` | `7200` (2 hours) |
| `talkRatioMin` | `0` |
| `talkRatioMax` | `100` |
| `minExternalSpeakers` | `0` |
| `excludeInternal` | `false` |

### `src/lib/session.ts`

| Name | Value | Type | What It Controls |
|------|-------|------|-----------------|
| `SESSION_KEY` | `'gongwizard_session'` | `string` | `sessionStorage` key for the `GongSession` object. Stores `authHeader`, `users`, `trackers`, `workspaces`, `internalDomains`, `baseUrl`. Cleared automatically when the tab closes. |

### `src/app/api/auth/route.ts` — Auth Cookie

| Property | Value |
|---|---|
| Cookie name | `gw-auth` |
| Cookie value (on success) | `'1'` |
| `httpOnly` | `true` |
| `maxAge` | `604800` s (60 × 60 × 24 × 7 = 7 days) |
| `path` | `'/'` |
| `sameSite` | `'lax'` |

### `src/middleware.ts` — Middleware Matcher

| Property | Value |
|---|---|
| Matcher pattern | `['/((?!_next/static|_next/image|favicon.ico).*)']` |
| Bypassed paths | `/gate`, `/api/auth`, `/favicon*` |
| Auth check | Cookie `gw-auth` value must equal `'1'`; otherwise redirect to `/gate` |

### Gong API default base URL (all proxy routes)

All Gong proxy routes accept an optional `baseUrl` field in the POST body (trailing slashes stripped). When omitted:

```
https://api.gong.io
```

Supports custom Gong instance URLs used by some enterprise deployments.

### AI model invocation parameters

**Cheap tier** (`cheapComplete` / `cheapCompleteJSON`) — model `gemini-2.0-flash-lite`:

| Route | `temperature` | `maxTokens` | Purpose |
|-------|-------------|-----------|---------|
| `src/app/api/analyze/score/route.ts` | `0.2` | `4096` | Batch call relevance scoring |
| `src/app/api/analyze/process/route.ts` | `0.2` | `2048` | Smart truncation of long internal monologues |
| `cheapComplete` default | `0.3` | `1024` | Fallback when callers omit options |

**Smart tier** (`smartComplete` / `smartCompleteJSON` / `smartStream`) — model `gemini-2.5-pro`:

| Route | `temperature` | `maxTokens` | Purpose |
|-------|-------------|-----------|---------|
| `src/app/api/analyze/batch-run/route.ts` | `0.3` | `16384` | Multi-call finding extraction |
| `src/app/api/analyze/run/route.ts` | `0.3` | `4096` | Single-call finding extraction |
| `src/app/api/analyze/synthesize/route.ts` | `0.3` | `4096` | Cross-call synthesis |
| `src/app/api/analyze/followup/route.ts` | `0.3` | `4096` | Follow-up Q&A |
| `smartComplete` default | `0.3` | `8192` | Fallback when callers omit options |

All JSON-returning routes use `responseMimeType: 'application/json'` (native JSON mode via `jsonMode: true` passed internally).

### Vercel `maxDuration` per route

| File | Value |
|------|-------|
| `src/app/api/analyze/batch-run/route.ts` | `60` s |
| `src/app/api/analyze/run/route.ts` | `60` s |
| `src/app/api/analyze/synthesize/route.ts` | `60` s |
| `src/app/api/analyze/followup/route.ts` | `60` s |

### Keyword search cap

| Location | Value | What It Controls |
|----------|-------|-----------------|
| `src/app/api/gong/search/route.ts` | `500` | Maximum call IDs accepted per search request (`callIds.slice(0, 500)`). |

---

## 4. Third-Party Service Configuration

### Google Gemini

| Property | Detail |
|----------|--------|
| Purpose | Powers all AI analysis: call scoring, smart truncation, per-call finding extraction, batch extraction, cross-call synthesis, follow-up Q&A |
| Required env var | `GEMINI_API_KEY` |
| SDK package | `@google/genai` `^1.43.0` |
| Client initialization | `src/lib/ai-providers.ts` — lazy singleton `getGemini()`, constructs `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })` on first call and caches it in module scope as `_gemini` |
| Cheap tier model ID | `gemini-2.0-flash-lite` — used by `cheapComplete` and `cheapCompleteJSON` |
| Smart tier model ID | `gemini-2.5-pro` — used by `smartComplete`, `smartCompleteJSON`, and `smartStream` |
| Server-side only | Yes — `GEMINI_API_KEY` is a server-only env var, never exposed to the browser |

### Gong API

| Property | Detail |
|----------|--------|
| Purpose | Source of all call data: users, trackers, workspaces, call list, extensive call metadata, transcripts |
| Required env var | None — credentials are user-supplied at runtime |
| Auth mechanism | HTTP Basic Auth (`Authorization: Basic <base64(accessKey:secretKey)>`), forwarded proxy-style via `X-Gong-Auth` request header |
| Client initialization | `src/lib/gong-api.ts` — `makeGongFetch(baseUrl, authHeader)` factory function returns a per-request fetch wrapper with retry/backoff logic; no persistent client instance |
| Credential storage | Browser `sessionStorage` only, under key `gongwizard_session`; cleared on tab close; never stored server-side |
| Default base URL | `https://api.gong.io` |

Proxy routes and the Gong endpoints they call:

| Proxy Route | Gong Endpoints Called |
|---|---|
| `src/app/api/gong/connect/route.ts` | `GET /v2/users`, `GET /v2/settings/trackers`, `GET /v2/workspaces` |
| `src/app/api/gong/calls/route.ts` | `GET /v2/calls`, `POST /v2/calls/extensive` |
| `src/app/api/gong/transcripts/route.ts` | `POST /v2/calls/transcript` |
| `src/app/api/gong/search/route.ts` | `POST /v2/calls/transcript` |

### Vercel

| Property | Detail |
|----------|--------|
| Purpose | Serverless deployment host for the Next.js application and all API routes |
| Env vars to configure | `SITE_PASSWORD`, `GEMINI_API_KEY` — must be set in Vercel project settings |
| Timeout override | `export const maxDuration = 60` in four analyze routes raises the default 10 s serverless limit to 60 s |
| Timezone assumption | `buildDateChunks()` in `src/app/api/gong/calls/route.ts` uses `setHours(23, 59, 59, 999)` with a comment noting this is correct only when the server runs in UTC (Vercel default) |

### `next/font/google` (Geist fonts)

| Property | Detail |
|----------|--------|
| Purpose | Self-hosting Geist Sans and Geist Mono, optimized at build time |
| Initialization | `src/app/layout.tsx` — `Geist({ variable: '--font-geist-sans', subsets: ['latin'] })` and `Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })` |
| CSS variables injected | `--font-geist-sans`, `--font-geist-mono` — consumed by `@theme inline` in `globals.css` |
| API key required | No |

### `client-zip`

| Property | Detail |
|----------|--------|
| Purpose | Browser-side ZIP archive creation for bulk transcript exports (one file per call + `manifest.json`) |
| Package | `client-zip` `^2.5.0` |
| Usage | `src/hooks/useCallExport.ts` — `handleZipExport()` calls `downloadZip(files).blob()` |
| API key required | No — runs entirely in the browser |
