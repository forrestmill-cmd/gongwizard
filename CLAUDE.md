# GongWizard

Web app that helps Gong customers export call transcripts optimized for AI analysis in ChatGPT, Claude, and other LLMs.

## Tech Stack
- Next.js 15 (App Router, TypeScript)
- Tailwind v4 + shadcn/ui
- Stateless — no database, credentials in sessionStorage only
- Deployed to Vercel

## Key Paths
- `src/lib/gong/` — Gong API client, types, speaker classification, transcript formatting, output formatters
- `src/app/api/gong/` — 3 proxy routes (connect, calls, transcripts)
- `src/app/page.tsx` — Step 1: Connect (API key entry)
- `src/app/calls/page.tsx` — Step 2: Browse, filter, export calls
- `src/hooks/` — useGong (connection state), useCalls (call fetch/filter/select)

## Gong API Endpoints Used
- `GET /v2/users` — internal speaker detection
- `GET /v2/settings/trackers` — company keyword trackers
- `GET /v2/workspaces` — workspace list
- `POST /v2/calls/extensive` — full call data with metadata (batch 10)
- `GET /v2/calls` — basic call list fallback
- `POST /v2/calls/transcript` — transcript monologues (batch 50)

## Run Commands
```bash
npm run dev     # Dev server (Turbopack)
npm run build   # Production build
npm run lint    # ESLint
```

## Architecture Decisions
- **Stateless proxy**: Client sends credentials via X-Gong-Auth header → API routes forward to Gong → return results. No server state.
- **Speaker classification**: Derived from /v2/users email domains (replaces Google Sheets config from v1).
- **Extensive-first**: Try /v2/calls/extensive for full metadata. Fall back to basic /v2/calls if scope issue.
- **Output formats**: Markdown (ChatGPT upload), XML (Claude structure), JSONL (structured).

## Reference Code
- Python v1: `../gong-wizard-uri/gong-wizard-web-main/app.py`
- API docs: `../gong_api_full_reference_COMPLETE.docx.md`
