# GongWizard — Component Tree

## 1. Page Structure

```mermaid
graph TD
    MW[middleware.ts\nEdge: gw-auth cookie check]
    MW --> GATE[/gate — GatePage\nsrc/app/gate/page.tsx]
    MW --> ROOT[/ — ConnectPage\nsrc/app/page.tsx]
    MW --> CALLS[/calls — CallsPage\nsrc/app/calls/page.tsx]

    GATE -->|POST /api/auth| AUTH[/api/auth/route.ts\nSets gw-auth cookie]
    ROOT -->|POST /api/gong/connect| CONNECT[/api/gong/connect/route.ts]
    CALLS -->|POST /api/gong/calls| CALLSAPI[/api/gong/calls/route.ts]
    CALLS -->|POST /api/gong/transcripts| TRANS[/api/gong/transcripts/route.ts]
    CALLS -->|POST /api/gong/search\nndjson stream| SEARCH[/api/gong/search/route.ts]
    CALLS -->|POST /api/analyze/score| SCORE[/api/analyze/score/route.ts]
    CALLS -->|POST /api/analyze/process| PROCESS[/api/analyze/process/route.ts]
    CALLS -->|POST /api/analyze/run| RUN[/api/analyze/run/route.ts]
    CALLS -->|POST /api/analyze/batch-run| BATCH[/api/analyze/batch-run/route.ts]
    CALLS -->|POST /api/analyze/synthesize| SYNTH[/api/analyze/synthesize/route.ts]
    CALLS -->|POST /api/analyze/followup| FOLLOWUP[/api/analyze/followup/route.ts]
```

| Route | File | Layout | Data Fetching |
|---|---|---|---|
| `/gate` | `src/app/gate/page.tsx` | `RootLayout` | Client: POST `/api/auth` on form submit |
| `/` | `src/app/page.tsx` | `RootLayout` | Client: POST `/api/gong/connect` on form submit |
| `/calls` | `src/app/calls/page.tsx` | `RootLayout` | Client: POST `/api/gong/calls` on mount (reads from sessionStorage); transcripts fetched on export/analyze |

All pages are `'use client'` components. There is one shared layout (`src/app/layout.tsx`) that wraps all pages — it loads Geist and Geist Mono fonts and sets the HTML metadata.

---

## 2. Component Hierarchy

### RootLayout (`src/app/layout.tsx`)

```
RootLayout
└── {children}  (one of: GatePage | ConnectPage | CallsPage)
```

### GatePage (`src/app/gate/page.tsx`)

```
GatePage
└── Card
    ├── CardHeader
    │   └── CardTitle ("Team access")
    └── CardContent
        └── <form>
            ├── Label ("Access code")
            ├── Input (type=password/text)
            ├── <button> (Eye/EyeOff toggle)
            ├── <p> (error message, conditional)
            └── Button (submit, shows Loader2 when loading)
```

### ConnectPage (`src/app/page.tsx`)

```
ConnectPage
├── <h1> GongWizard
├── feature bullet list (3 items)
├── Card
│   ├── CardHeader → CardTitle ("Connect your Gong account")
│   └── CardContent
│       └── <form>
│           ├── Label + Input (accessKey)
│           ├── Label + Input (secretKey) + Eye/EyeOff toggle
│           ├── collapsible help section (ChevronDown/ChevronUp)
│           ├── <p> (error, conditional)
│           └── Button (submit, shows Loader2 when loading)
└── trust badges row (Lock, X, Shield icons)
```

### CallsPage (`src/app/calls/page.tsx`)

```
CallsPage
├── header bar
│   ├── title + session info
│   └── Button (disconnect / clear session)
├── date range + workspace selector
│   ├── Input (fromDate)
│   ├── Input (toDate)
│   ├── <select> (workspaceId)
│   └── Button (load calls)
├── [when calls loaded] filter sidebar
│   ├── Input (searchText)
│   ├── Input (participantSearch)
│   ├── Input (aiContentSearch)
│   ├── Checkbox (excludeInternal)
│   ├── Slider (durationRange)
│   ├── Slider (talkRatioRange)
│   ├── Input (minExternalSpeakers)
│   ├── tracker checkboxes (Badge per tracker)
│   ├── topic checkboxes (Badge per topic)
│   └── Button (reset filters)
├── [when calls loaded] calls list
│   ├── select-all Checkbox
│   ├── per-call row (Checkbox + metadata + Badge list)
│   └── pagination controls
├── [when calls loaded] export/analyze panel (Tabs)
│   ├── TabsList
│   │   ├── TabsTrigger ("Export")
│   │   └── TabsTrigger ("Analyze")
│   ├── TabsContent "Export"
│   │   ├── format selector buttons (md / xml / jsonl / csv / utterance-csv)
│   │   ├── export option checkboxes
│   │   ├── token estimate (contextColor / contextLabel)
│   │   ├── transcript keyword search section
│   │   │   ├── Input (keyword)
│   │   │   └── Button (search, streams from /api/gong/search)
│   │   └── action buttons (Export File, Copy, Export ZIP)
│   └── TabsContent "Analyze"
│       └── AnalyzePanel
```

### AnalyzePanel (`src/components/analyze-panel.tsx`)

```
AnalyzePanel
├── question Input + QUESTION_TEMPLATES shortcut buttons
├── Button ("Score Calls" → /api/analyze/score)
├── [stage=scored] scored calls list
│   ├── per-call row: Checkbox + score Badge + reason text
│   └── Button ("Analyze Selected")
├── [stage=analyzing] progress text + Loader2
└── [stage=results]
    ├── ScrollArea
    │   ├── synthesis answer block
    │   ├── QuoteCard list (supporting quotes)
    │   ├── per-call findings section
    │   │   └── per-finding: Badge (significance) + exact_quote + attribution
    │   ├── follow-up Input + Send Button
    │   ├── QAEntry conversation history
    │   │   └── per-entry: question + answer + QuoteCard list
    │   └── Download Button (CSV export of findings)
    └── [error state] error message
```

---

## 3. Component Reference

### GatePage

**File:** `src/app/gate/page.tsx`

**Props:** none (default export page)

**State managed:**

- `password: string`
- `showPassword: boolean`
- `loading: boolean`
- `error: string`

**Hooks used:** `useState`, `useRouter` (next/navigation)

**API calls:**

- `POST /api/auth` — body: `{ password }` — on success sets `gw-auth` cookie, redirects to `/`

**Children rendered:** `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Input`, `Label`, `Button`, `Eye`/`EyeOff`/`Loader2` (lucide-react)

---

### ConnectPage

**File:** `src/app/page.tsx`

**Props:** none (default export page)

**State managed:**

- `accessKey: string`
- `secretKey: string`
- `showSecret: boolean`
- `showHelp: boolean`
- `loading: boolean`
- `error: string`

**Hooks used:** `useState`, `useRouter`

**API calls:**

- `POST /api/gong/connect` with `X-Gong-Auth: btoa(accessKey:secretKey)` — receives `{ users, trackers, workspaces, internalDomains, baseUrl }`, persists via `saveSession()` to `sessionStorage`, redirects to `/calls`

**Children rendered:** `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Input`, `Label`, `Button`, `Eye`/`EyeOff`/`Lock`/`X`/`Shield`/`ChevronDown`/`ChevronUp`/`Loader2`

---

### CallsPage

**File:** `src/app/calls/page.tsx`

**Props:** none (default export page)

**State managed:**

- `session: GongSession | null` — loaded from `sessionStorage` via `getSession()`
- `calls: GongCall[]` — full call list
- `filteredCalls: GongCall[]` — derived from `calls` + filter state (via `useMemo`)
- `selectedIds: Set<string>`
- `loading: boolean`
- `loadError: string`
- `fromDate: string`, `toDate: string`, `workspaceId: string`
- `exportFormat: 'markdown' | 'xml' | 'jsonl' | 'csv' | 'utterance-csv'`
- `exportOpts: ExportOptions` — `{ condenseMonologues, includeMetadata, includeAIBrief, includeInteractionStats }`
- `activeTab: 'export' | 'analyze'`
- `searchKeyword: string`, `searchResults`, `searchProgress`, `searchLoading`
- `page: number`

**Hooks used:**

- `useState`, `useEffect`, `useCallback`, `useMemo`
- `useFilterState` (`src/hooks/useFilterState.ts`)
- `useCallExport` (`src/hooks/useCallExport.ts`)

**API calls:**

- `POST /api/gong/calls` — body: `{ fromDate, toDate, baseUrl, workspaceId }` — fetches full call list with metadata
- `POST /api/gong/search` — streaming ndjson — body: `{ callIds, keyword, baseUrl }` — emits `progress` / `match` / `done` events

**Children rendered:** `Card`, `CardContent`, `Badge`, `Button`, `Checkbox`, `Input`, `Label`, `Slider`, `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `ScrollArea`, `Separator`, `AnalyzePanel`, lucide-react icons

---

### AnalyzePanel

**File:** `src/components/analyze-panel.tsx`

**Props:**

```typescript
interface AnalyzePanelProps {
  selectedCalls: any[];   // GongCall objects for currently selected calls
  session: any;           // GongSession from sessionStorage
  allCalls: any[];        // full call list (for callMap lookups)
}
```

**State managed:**

- `question: string`
- `stage: 'idle' | 'scoring' | 'scored' | 'analyzing' | 'results'`
- `error: string`
- `scoredCalls: ScoredCall[]` — `{ callId, score, reason, relevantSections, selected }`
- `callFindings: CallFindings[]` — per-call extracted findings
- `conversation: QAEntry[]` — follow-up Q&A history
- `analysisProgress: string` — status message during analysis
- `followUpInput: string`
- `followUpLoading: boolean`
- `processedDataCache: string` — serialized evidence text for follow-up calls
- `tokensUsed: number`

**Hooks used:** `useState`, `useCallback`

**API calls (in pipeline order):**

1. `POST /api/analyze/score` — scores calls for relevance using Gemini Flash-Lite
2. `POST /api/gong/transcripts` — fetches transcript monologues for selected calls
3. `POST /api/analyze/process` — smart truncation of long internal monologues (Gemini Flash-Lite)
4. `POST /api/analyze/batch-run` — batch finding extraction across all calls when within token budget
5. `POST /api/analyze/run` — single-call finding extraction fallback
6. `POST /api/analyze/synthesize` — synthesizes findings into a direct answer (Gemini 2.5 Pro)
7. `POST /api/analyze/followup` — answers follow-up questions from cached evidence (Gemini 2.5 Pro)

**Lib used:**

- `isInternalParty` from `src/lib/format-utils`
- `buildUtterances`, `alignTrackersToUtterances`, `extractTrackerOccurrences` from `src/lib/tracker-alignment`
- `performSurgery`, `formatExcerptsForAnalysis` from `src/lib/transcript-surgery`

**Constants:** `TOKEN_BUDGET = 800_000`, `MAX_QUESTIONS = 5`

**Children rendered:** `Button`, `Input`, `Label`, `Badge`, `Card`, `CardContent`, `Checkbox`, `Separator`, `ScrollArea`, `QuoteCard` (inline), lucide-react icons

---

### QuoteCard (inline sub-component of AnalyzePanel)

**File:** `src/components/analyze-panel.tsx` (not exported)

**Props:**

```typescript
{ q: QuoteAttribution }
// QuoteAttribution = {
//   quote: string;
//   speaker_name: string;
//   job_title: string;
//   company: string;
//   call_title: string;
//   call_date: string;
// }
```

Renders a left-bordered quote block with italic quote text, attribution (speaker name + title + company), and source (call title + date).

---

## 4. Custom Hooks

### useFilterState

**File:** `src/hooks/useFilterState.ts`

**Purpose:** Centralizes all call-list filter state. Numeric and boolean filters are persisted to `localStorage` under `gongwizard_filters`. Text searches and set-based filters (trackers, topics) are session-only.

**Parameters:** none

**Return value:**

```typescript
{
  // Text searches (not persisted)
  searchText: string;         setSearchText: (v: string) => void;
  participantSearch: string;  setParticipantSearch: (v: string) => void;
  aiContentSearch: string;    setAiContentSearch: (v: string) => void;

  // Boolean (persisted)
  excludeInternal: boolean;   setExcludeInternal: (v: boolean) => void;

  // Ranges (persisted)
  durationRange: [number, number];   setDurationRange: (v: [number, number]) => void;
  talkRatioRange: [number, number];  setTalkRatioRange: (v: [number, number]) => void;
  minExternalSpeakers: number;       setMinExternalSpeakers: (v: number) => void;

  // Multi-select (not persisted)
  activeTrackers: Set<string>;  toggleTracker: (name: string) => void;
  activeTopics: Set<string>;    toggleTopic: (name: string) => void;

  resetFilters: () => void;
}
```

**Side effects:**

- Reads `localStorage` once on first render (`loadPersistedFilters`)
- Writes `localStorage` on each persisted filter change (`persistFilters`)
- Uses `useRef` (`currentFilters`) to read latest values in the persist callback without adding them as dependencies

**Used by:** `CallsPage`

---

### useCallExport

**File:** `src/hooks/useCallExport.ts`

**Purpose:** Handles transcript fetch + format + download/copy/zip for the export panel. Builds speaker maps from call parties, sorts sentences by timestamp, groups into `FormattedTurn[]` via `groupTranscriptTurns`, then calls `buildExportContent` for the selected format.

**Parameters:**

```typescript
interface UseCallExportParams {
  selectedIds: Set<string>;
  session: any;                  // GongSession
  calls: any[];                  // full call list for metadata lookup
  exportFormat: 'markdown' | 'xml' | 'jsonl' | 'csv' | 'utterance-csv';
  exportOpts: ExportOptions;     // { condenseMonologues, includeMetadata, includeAIBrief, includeInteractionStats }
}
```

**Return value:**

```typescript
{
  exporting: boolean;
  copied: boolean;
  handleExport: () => Promise<void>;      // downloads single file
  handleCopy: () => Promise<void>;        // writes to clipboard
  handleZipExport: () => Promise<void>;   // downloads ZIP: manifest.json + calls/<name>.<ext>
}
```

**API calls:**

- `POST /api/gong/transcripts` with `X-Gong-Auth` header — body: `{ callIds, baseUrl }`

**Side effects:**

- `downloadFile()` (`src/lib/browser-utils`) — blob URL + `<a>` click trigger
- `downloadZip()` (`client-zip` package) — assembles ZIP blob
- `navigator.clipboard.writeText()`

**Lib used:** `isInternalParty` (format-utils), `groupTranscriptTurns`, `buildExportContent`, `Speaker`, `TranscriptSentence`, `CallForExport`, `ExportOptions` (transcript-formatter)

**Used by:** `CallsPage`

---

## 5. UI Library Notes

**Library:** shadcn/ui — components are code-generated into `src/components/ui/` as plain TypeScript source files (not installed as a runtime package dependency)

**Primitive layer:** `radix-ui` v1.4.3 — unified package (`import { Checkbox, Slider, Tabs, ... } from 'radix-ui'`)

**Styling:** Tailwind CSS v4. Variant management via `class-variance-authority` (CVA). Class merging via `cn()` utility in `src/lib/utils.ts` (`clsx` + `tailwind-merge`).

**Icons:** `lucide-react` v0.575.0

**Components in `src/components/ui/`:**

| Component(s) | File | Radix Primitive Used |
|---|---|---|
| `Badge` | `badge.tsx` | `Slot.Root` |
| `Button` | `button.tsx` | `Slot.Root` |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | `card.tsx` | plain `<div>` |
| `Checkbox` | `checkbox.tsx` | `Checkbox`, `Checkbox.Indicator` |
| `Input` | `input.tsx` | plain `<input>` |
| `Label` | `label.tsx` | `Label.Root` |
| `ScrollArea`, `ScrollBar` | `scroll-area.tsx` | `ScrollArea.Root`, `ScrollArea.Viewport`, `ScrollArea.Scrollbar`, `ScrollArea.Thumb`, `ScrollArea.Corner` |
| `Separator` | `separator.tsx` | `Separator.Root` |
| `Slider` | `slider.tsx` | `Slider.Root`, `Slider.Track`, `Slider.Range`, `Slider.Thumb` |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | `tabs.tsx` | `Tabs.Root`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Content` |

**Badge variants:** `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`

**Button variants:** `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`

**Button sizes:** `default` (h-9), `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

**Tabs list variants:** `default` (pill with background), `line` (underline indicator)

**Fonts:** Geist Sans (`--font-geist-sans`) and Geist Mono (`--font-geist-mono`) loaded via `next/font/google` in `RootLayout` and applied as CSS variables on `<body>`.

**Theme:** No `tailwind.config.js` with custom tokens. Theming is done entirely via Tailwind v4 CSS variables (e.g. `bg-primary`, `text-muted-foreground`) defined in `globals.css`.
