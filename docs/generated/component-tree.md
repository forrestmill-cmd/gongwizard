# GongWizard — Component Tree

## 1. Page Structure

Routing hierarchy using Next.js 15 App Router. All routes are protected by edge middleware except `/gate` and `/api/auth`.

```mermaid
graph TD
    MW[src/middleware.ts<br/>Edge auth guard — gw-auth cookie] --> GATE[/gate<br/>GatePage]
    MW --> ROOT[/<br/>ConnectPage]
    MW --> CALLS[/calls<br/>CallsPage]
    MW --> APIAUTH[/api/auth<br/>POST — issues gw-auth cookie]
    MW --> APIGONG[/api/gong/*<br/>Gong proxy routes]
    MW --> APIAI[/api/analyze/*<br/>AI analysis routes]
```

| Page | File | Layout | Data Fetching |
| --- | --- | --- | --- |
| Gate | `src/app/gate/page.tsx` | `RootLayout` | Client — POSTs to `/api/auth` on submit |
| Connect (Step 1) | `src/app/page.tsx` | `RootLayout` | Client — POSTs to `/api/gong/connect` on submit |
| Calls (Step 2) | `src/app/calls/page.tsx` | `RootLayout` | Client — POSTs to `/api/gong/calls` on date range submit |
| Root Layout | `src/app/layout.tsx` | — | Static — loads Geist/Geist Mono fonts |

---

## 2. Component Hierarchy

### `RootLayout` (`src/app/layout.tsx`)

```
RootLayout
└── <html lang="en">
    └── <body> (Geist + Geist Mono font vars, antialiased)
        └── {children}
```

### `/gate` — `GatePage` (`src/app/gate/page.tsx`)

```
GatePage
└── <div> (min-h-screen centered layout)
    ├── <h1> "GongWizard"
    ├── <p> subtitle
    └── Card
        ├── CardHeader
        │   └── CardTitle "Team access"
        └── CardContent
            └── <form>
                ├── Label "Access code"
                ├── Input (password)
                ├── <button> Eye/EyeOff toggle (lucide-react)
                ├── <p> error message (conditional)
                └── Button type="submit"
                    └── Loader2 (during loading) | "Enter →"
```

### `/` — `ConnectPage` (`src/app/page.tsx`)

```
ConnectPage
└── <div> (min-h-screen centered layout)
    ├── <h1> "GongWizard"
    ├── <p> subtitle
    ├── Feature bullet list (Lock, X, Shield icons)
    └── Card
        ├── CardHeader
        │   └── CardTitle "Connect your Gong account"
        └── CardContent
            └── <form>
                ├── Label + Input "Access Key"
                ├── Label + Input "Secret Key" (password toggle)
                ├── <div> collapsible "Where do I find these?" help
                │   ├── ChevronUp/ChevronDown toggle
                │   └── <ol> instructions (hidden until expanded)
                ├── <p> error message (conditional)
                └── Button type="submit"
                    └── Loader2 (during loading) | "Access My Calls →"
```

### `/calls` — `CallsPage` (`src/app/calls/page.tsx`)

The main application page. Uses `useFilterState` and `useCallExport`. Hosts `AnalyzePanel` in the right sidebar.

```
CallsPage (uses useFilterState, useCallExport)
├── <header> — title, disconnect button
└── <main> two-column layout
    ├── LEFT COLUMN — Filters sidebar
    │   ├── Date range inputs (fromDate, toDate)
    │   ├── "Load Calls" Button
    │   ├── Separator
    │   ├── Input — text search (title/brief)
    │   ├── Input — participant search
    │   ├── Input — AI content search (keyPoints/outline)
    │   ├── Slider — duration range [0, 7200]
    │   ├── Slider — talk ratio range [0, 100]
    │   ├── Checkbox — excludeInternal
    │   ├── Slider — minExternalSpeakers
    │   ├── Tracker filter list (Checkbox per tracker name)
    │   └── Topic filter list (Checkbox per topic name)
    │
    └── RIGHT COLUMN — Call list + export panel
        ├── <div> stats bar (N calls visible, N selected)
        ├── "Select All" / "Clear" Buttons
        ├── Tabs (export format selector)
        │   ├── TabsList
        │   │   ├── TabsTrigger "Markdown"
        │   │   ├── TabsTrigger "XML"
        │   │   ├── TabsTrigger "JSONL"
        │   │   ├── TabsTrigger "CSV Summary"
        │   │   └── TabsTrigger "Utterance CSV"
        │   └── TabsContent
        │       └── ExportOptions checkboxes
        │           ├── Checkbox — condenseMonologues
        │           ├── Checkbox — includeMetadata
        │           ├── Checkbox — includeAIBrief
        │           └── Checkbox — includeInteractionStats
        ├── Export action Buttons (Download, Copy, ZIP)
        ├── ScrollArea — call list
        │   └── (per call) Card
        │       ├── Checkbox (select/deselect call)
        │       ├── call title, date, duration (formatDuration)
        │       ├── Badge list (topics)
        │       ├── Badge list (trackers)
        │       └── participant name list
        └── AnalyzePanel (sidebar component)
```

---

## 3. Component Reference

### `AnalyzePanel` (`src/components/analyze-panel.tsx`)

The AI research orchestration panel. Manages a four-stage pipeline state machine: `idle → scoring → scored → analyzing → results`.

**Props:**

```typescript
interface AnalyzePanelProps {
  selectedCalls: any[];   // calls currently checked in the call list
  session: any;           // GongSession from sessionStorage
  allCalls: any[];        // full loaded call list for lookup
}
```

**State managed:**

| State | Type | Purpose |
| --- | --- | --- |
| `question` | `string` | Research question input |
| `stage` | `Stage` | Pipeline phase (`idle \| scoring \| scored \| analyzing \| results`) |
| `error` | `string` | Error message |
| `scoredCalls` | `ScoredCall[]` | Relevance-scored call list with user-toggleable selection |
| `callFindings` | `CallFindings[]` | Structured findings per call from batch-run |
| `conversation` | `QAEntry[]` | Chat-style Q&A history (initial answer + follow-ups) |
| `analysisProgress` | `string` | Status text shown during analysis |
| `followUpInput` | `string` | Current follow-up question text |
| `followUpLoading` | `boolean` | Follow-up request in-flight flag |
| `processedDataCache` | `string` | Surgical transcript text cached for follow-up context |
| `tokensUsed` | `number` | Running token estimate against `TOKEN_BUDGET` |

**Hooks used:** `useState`, `useCallback`

**API calls made (in pipeline order):**

1. `POST /api/analyze/score` — scores calls for relevance (Gemini Flash-Lite), returns `{ scores: ScoredCall[] }`
2. `POST /api/gong/transcripts` — fetches raw monologues for selected call IDs
3. `POST /api/analyze/process` — smart truncation of long internal monologues (Gemini Flash-Lite), optional/non-fatal
4. `POST /api/analyze/batch-run` — finding extraction from all calls in one request (Gemini 2.5 Pro)
5. `POST /api/analyze/synthesize` — cross-call synthesis into direct answer with sourced quotes (Gemini 2.5 Pro)
6. `POST /api/analyze/followup` — follow-up Q&A against `processedDataCache` (Gemini 2.5 Pro), called once per follow-up

**Lib functions called:**

- `isInternalParty` — classifies parties as internal/external
- `buildUtterances`, `alignTrackersToUtterances`, `extractTrackerOccurrences` — builds utterance objects with aligned tracker hits
- `performSurgery` — surgical transcript extraction to ~2-3K tokens per call
- `formatExcerptsForAnalysis` — formats excerpts as structured text block for LLM analysis

**Children rendered:**

- `QuoteCard` (inline sub-component)
- `Button`, `Input`, `Label`, `Badge`, `Card`, `CardContent`, `Checkbox`, `Separator`, `ScrollArea` (shadcn/ui)
- `Loader2`, `Search`, `Sparkles`, `Send`, `Download` (lucide-react)

**Constants:**

- `TOKEN_BUDGET = 800_000` — token ceiling; analysis stops if exceeded
- `MAX_QUESTIONS = 5` — max total Q&A entries per session
- `QUESTION_TEMPLATES` — five preset shortcuts (Objections, Needs, Competitive, Feedback, Questions)

---

### `QuoteCard` (inline in `src/components/analyze-panel.tsx`)

Renders a single sourced quote with full attribution in the results panel.

**Props:**

```typescript
{ q: QuoteAttribution }

interface QuoteAttribution {
  quote: string;
  speaker_name: string;
  job_title: string;
  company: string;
  call_title: string;
  call_date: string;
}
```

No hooks, no API calls. Pure display component — blockquote with speaker name, title/company, and call source.

---

### shadcn/ui Primitives (`src/components/ui/`)

All are thin wrappers around Radix UI primitives using `class-variance-authority` and the `cn()` utility.

| Component | File | Underlying Primitive | Key Variants / Notes |
| --- | --- | --- | --- |
| `Badge` | `badge.tsx` | `Slot.Root` / `<span>` | `default`, `secondary`, `destructive`, `outline`, `ghost`, `link` |
| `Button` | `button.tsx` | `Slot.Root` / `<button>` | variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg` |
| `Card` | `card.tsx` | `<div>` | Sub-components: `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` |
| `Checkbox` | `checkbox.tsx` | `radix-ui/Checkbox.Root` | Renders `CheckIcon` (lucide) inside indicator |
| `Input` | `input.tsx` | `<input>` | — |
| `Label` | `label.tsx` | `radix-ui/Label.Root` | — |
| `ScrollArea` | `scroll-area.tsx` | `radix-ui/ScrollArea.Root` | Includes `ScrollBar` sub-component; supports `vertical`/`horizontal` orientation |
| `Separator` | `separator.tsx` | `radix-ui/Separator.Root` | `horizontal` (default) / `vertical` |
| `Slider` | `slider.tsx` | `radix-ui/Slider.Root` | Range slider; `_values` array drives thumb count (dual-thumb for range filters) |
| `Tabs` | `tabs.tsx` | `radix-ui/Tabs.Root` | Sub-components: `TabsList`, `TabsTrigger`, `TabsContent`; `TabsList` variants: `default`, `line` |

---

## 4. Custom Hooks

### `useFilterState` (`src/hooks/useFilterState.ts`)

**Purpose:** Centralized filter state management for the call list. Persists numeric and boolean filters to `localStorage` (`gongwizard_filters`). Text searches and multi-select filters are React state only (session-local).

**Parameters:** none

**Return value:**

```typescript
{
  // Text filters (not persisted)
  searchText: string;
  setSearchText: (v: string) => void;
  participantSearch: string;
  setParticipantSearch: (v: string) => void;
  aiContentSearch: string;
  setAiContentSearch: (v: string) => void;

  // Boolean (persisted)
  excludeInternal: boolean;
  setExcludeInternal: (v: boolean) => void;

  // Range filters (persisted)
  durationRange: [number, number];       // seconds, default [0, 7200]
  setDurationRange: (v: [number, number]) => void;
  talkRatioRange: [number, number];      // percent, default [0, 100]
  setTalkRatioRange: (v: [number, number]) => void;

  // Numeric (persisted)
  minExternalSpeakers: number;           // default 0
  setMinExternalSpeakers: (v: number) => void;

  // Multi-select (not persisted — depends on loaded data)
  activeTrackers: Set<string>;
  toggleTracker: (name: string) => void;
  activeTopics: Set<string>;
  toggleTopic: (name: string) => void;

  resetFilters: () => void;
}
```

**Side effects:** Reads from `localStorage` on mount. Writes to `localStorage` on every persisted filter change via `updatePersisted`. Clears `localStorage` on `resetFilters`.

**Implementation detail:** A `currentFilters` ref mirrors current state so `updatePersisted` has a stable `useCallback` reference without re-creating on each filter change.

**Hooks used:** `useState`, `useCallback`, `useRef`, `useEffect`

**API calls:** none

**Used by:** `CallsPage` (`src/app/calls/page.tsx`)

---

### `useCallExport` (`src/hooks/useCallExport.ts`)

**Purpose:** All export operations — fetches transcripts on demand, assembles `CallForExport` objects (resolves speakers, sorts sentences, groups into turns), then dispatches to the appropriate formatter.

**Parameters:**

```typescript
interface UseCallExportParams {
  selectedIds: Set<string>;
  session: GongSession;
  calls: GongCall[];
  exportFormat: 'markdown' | 'xml' | 'jsonl' | 'csv' | 'utterance-csv';
  exportOpts: ExportOptions;
}

interface ExportOptions {
  condenseMonologues: boolean;
  includeMetadata: boolean;
  includeAIBrief: boolean;
  includeInteractionStats: boolean;
}
```

**Return value:**

```typescript
{
  exporting: boolean;
  copied: boolean;
  handleExport: () => Promise<void>;      // single-file download
  handleCopy: () => Promise<void>;        // clipboard copy
  handleZipExport: () => Promise<void>;   // one file per call + manifest.json in ZIP
}
```

**Hooks used:** `useState`, `useCallback`

**API calls:**

- `POST /api/gong/transcripts` — fetches raw transcript monologues for `selectedIds`

**Lib functions called:**

- `isInternalParty` (format-utils) — classifies each party
- `groupTranscriptTurns` (transcript-formatter) — groups sentences into speaker turns
- `buildExportContent` (transcript-formatter) — dispatches to `buildMarkdown`, `buildXML`, `buildJSONL`, `buildCSVSummary`, or `buildUtteranceCSV`
- `downloadFile` (browser-utils) — creates ephemeral `<a>` + `URL.createObjectURL` for download
- `downloadZip` (client-zip) — browser-side ZIP creation for bulk export

**Used by:** `CallsPage` (`src/app/calls/page.tsx`)

---

## 5. UI Library Notes

**Component library:** shadcn/ui (CLI dev dependency `shadcn ^3.8.5`)

shadcn/ui is a code-generation tool — components are scaffolded into `src/components/ui/` and fully owned by the project. Underlying headless primitives come from `radix-ui ^1.4.3` (the unified package).

**Styling system:** Tailwind CSS v4 with CSS-native theming. No `tailwind.config.js` — Tailwind 4 configuration lives in CSS. Animation utilities from `tw-animate-css ^1.4.0`.

**Class composition:**

- `cn()` in `src/lib/utils.ts` — combines `clsx` (conditional classes) and `tailwind-merge` (conflict resolution)
- `cva` (class-variance-authority `^0.7.1`) — used in `Badge`, `Button`, and `Tabs` for variant/size prop systems

**Icons:** `lucide-react ^0.575.0` — SVG React components used in pages, `AnalyzePanel`, and `Checkbox`.

**Font loading:** `next/font/google` in `RootLayout` — Geist Sans and Geist Mono, exposed as CSS variables `--font-geist-sans` and `--font-geist-mono`, applied on `<body>`.

**Theme tokens:** Standard shadcn CSS variable set (`--primary`, `--secondary`, `--muted`, `--destructive`, `--card`, `--border`, `--ring`, `--foreground`, etc.) defined in `src/app/globals.css`. Dark mode via `dark:` Tailwind prefix on all components.
