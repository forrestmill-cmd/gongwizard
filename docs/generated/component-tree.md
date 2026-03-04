# GongWizard — Component Tree

Generated: 2026-03-04

---

## 1. Page Structure

Routing hierarchy using Next.js 15 App Router. All routes are protected by Edge Middleware that checks the `gw-auth` cookie and redirects to `/gate` on failure.

```
src/app/
├── layout.tsx                    RootLayout          (root layout — Geist fonts, <html> wrapper)
├── page.tsx                      ConnectPage         (layout: RootLayout)  client component
├── gate/
│   └── page.tsx                  GatePage            (layout: RootLayout)  client component
└── calls/
    └── page.tsx                  CallsPage           (layout: RootLayout)  client component
```

| Page | File | Layout | Data Fetching |
|------|------|--------|---------------|
| `/gate` | `src/app/gate/page.tsx` | RootLayout | `POST /api/auth` on form submit |
| `/` | `src/app/page.tsx` | RootLayout | `POST /api/gong/connect` on form submit |
| `/calls` | `src/app/calls/page.tsx` | RootLayout | NDJSON streaming from `POST /api/gong/calls` on mount; transcript data on demand |

### Middleware

`src/middleware.ts` — runs on every request except `/gate`, `/api/auth`, and `/favicon`. Reads the `gw-auth` cookie; redirects to `/gate` if missing.

```mermaid
flowchart LR
    Request --> MW[middleware.ts]
    MW -->|has gw-auth cookie| Next[Next.js App]
    MW -->|missing gw-auth| Gate[/gate]
    Gate -->|POST /api/auth correct password| Root[/]
    Root -->|credentials saved to sessionStorage| Calls[/calls]
```

---

## 2. Component Hierarchy

### RootLayout (`src/app/layout.tsx`)

```
RootLayout
└── <html lang="en">
    └── <body> (Geist Sans + Geist Mono font variables, antialiased)
        └── {children}
```

### GatePage (`src/app/gate/page.tsx`)

```
GatePage
└── <div> (centering wrapper, min-h-screen bg-muted/40)
    ├── <div> (title block)
    │   └── <h1> GongWizard
    └── Card
        ├── CardHeader
        │   └── CardTitle "Team access"
        └── CardContent
            └── <form onSubmit=handleSubmit>
                ├── Label "Access code"
                ├── <div> (relative, password wrapper)
                │   ├── Input (type password/text, id="password")
                │   └── <button> (Eye / EyeOff toggle, tabIndex=-1)
                ├── <p> (error message, conditional)
                └── Button type="submit" (Loader2 while loading, "Enter →" otherwise)
```

### ConnectPage (`src/app/page.tsx`)

```
ConnectPage
└── <div> (centering wrapper, min-h-screen bg-muted/40)
    ├── <div> (title + 3 feature bullets)
    └── Card
        ├── CardHeader
        │   └── CardTitle "Connect your Gong account"
        └── CardContent
            └── <form onSubmit=handleConnect>
                ├── Label + Input (id="accessKey", text)
                ├── Label + <div>
                │   ├── Input (id="secretKey", type password/text)
                │   └── <button> (Eye / EyeOff toggle)
                ├── Label "Date Range"
                │   └── Popover
                │       ├── PopoverTrigger → Button (CalendarIcon + date range display)
                │       └── PopoverContent
                │           ├── Calendar (mode="range", selected=dateRange, numberOfMonths=2)
                │           └── <div> "Max range: 1 year" hint
                ├── <div> (collapsible "Where do I find these?" accordion)
                │   ├── <button> toggle (ChevronDown / ChevronUp)
                │   └── <div> instructions (conditional)
                ├── <p> (error message, conditional)
                └── Button type="submit" (Loader2 while loading, "Access My Calls →" otherwise)
```

### CallsPage (`src/app/calls/page.tsx`)

```
CallsPage
├── <header> (top bar, bg-background border-b)
│   ├── "GongWizard" wordmark
│   ├── date range label
│   └── Button "Disconnect" (LogOut icon)
│
└── <div> (2-column body, flex overflow-hidden)
    │
    ├── LEFT COLUMN (flex-1, filter panel + scrollable call list)
    │   │
    │   ├── Filter bar
    │   │   ├── Input (searchText — title/brief/AI content search)
    │   │   ├── MultiSelect (trackers, options=trackersWithCalls)
    │   │   ├── MultiSelect (topics, options from allTopics)
    │   │   ├── Checkbox + Label "External only" (excludeInternal)
    │   │   ├── <button> "Advanced Filters" toggle (ChevronDown / ChevronUp)
    │   │   └── <button> "Keyword Search" toggle
    │   │
    │   ├── Advanced filters panel (showAdvancedFilters, conditional)
    │   │   ├── Label + Slider (durationRange, 0–7200 s)
    │   │   ├── Label + Slider (talkRatioRange, 0–100 %)
    │   │   ├── Label + Input (participantSearch)
    │   │   ├── Label + Input (minExternalSpeakers)
    │   │   └── Button "Reset Filters"
    │   │
    │   ├── Transcript search panel (showTranscriptSearch, conditional)
    │   │   ├── Input (transcriptKeyword)
    │   │   ├── Button "Search Transcripts"
    │   │   ├── progress status text
    │   │   └── Tabs (speaker filter: all / external / internal)
    │   │
    │   ├── Results summary bar
    │   │   ├── Badge (filteredCalls.length)
    │   │   ├── Badge (selectedIds.size)
    │   │   ├── Button "Select All" (CheckSquare)
    │   │   └── Button "Deselect All" (Square)
    │   │
    │   └── ScrollArea → call list
    │       └── CallCard[] (one per filteredCalls entry)
    │           ├── Checkbox (isSelected)
    │           ├── call title + date
    │           ├── duration / speaker counts / accountName
    │           ├── Badge[] (top trackers, up to 5, sorted by occurrence count)
    │           ├── brief excerpt (truncateToFirstSentence)
    │           └── transcript match snippets (transcriptSearchActive, conditional)
    │               └── highlightKeyword() output per match
    │
    └── RIGHT PANEL (~360px, tabbed side panel)
        ├── Tabs (rightPanelTab: analyze | export)
        │
        ├── TabsContent "analyze"
        │   └── AnalyzePanel
        │       ├── selectedCalls={selectedCalls}
        │       ├── session={session}
        │       └── allCalls={calls}
        │
        └── TabsContent "export"
            ├── FORMAT_OPTIONS radio list
            │   └── 5 format options (markdown / xml / jsonl / csv / utterance-csv)
            ├── ExportOptions checkboxes
            │   ├── Checkbox "Condense long monologues"
            │   ├── Checkbox "Include metadata"
            │   ├── Checkbox "Include AI brief"
            │   └── Checkbox "Include interaction stats"
            ├── Button "Export" (Download icon)
            ├── Button "Copy" (Copy icon, shows "Copied!" 2s)
            └── Button "Export as ZIP" (Archive icon)
```

### AnalyzePanel (`src/components/analyze-panel.tsx`)

Inline sub-component: `QuoteCard`.

```
AnalyzePanel
│
├── [selectedCalls.length === 0] — empty state
│   └── "How it works" numbered list (3 steps)
│
├── [stage === 'idle' | 'scoring'] — Question input UI
│   ├── <div> (header: call count + "Start Over" button if not idle)
│   ├── <div> (error display, conditional)
│   ├── Label "Your Question"
│   ├── Input (question, onKeyDown Enter → handleScore)
│   ├── Button[] (QUESTION_TEMPLATES: Objections / Needs / Competitive / Feedback / Questions)
│   └── Button "Find Relevant Calls" / "Scoring calls…" (Search icon / Loader2)
│
├── [stage === 'scored'] — Ranked call list
│   ├── Label "Relevance Scores"
│   ├── ScrollArea (max-h-300px)
│   │   └── scored call rows[]
│   │       ├── Checkbox (toggle selected)
│   │       ├── Badge (score/10, variant by score tier)
│   │       └── call title + reason text
│   ├── selection count display
│   └── Button "Analyze N Calls" (Sparkles icon)
│
├── [stage === 'analyzing'] — Progress spinner
│   ├── Loader2 (size-6 animate-spin)
│   └── analysisProgress text
│
└── [stage === 'results'] — Conversation UI
    ├── toolbar
    │   ├── "N of 5 questions used"
    │   ├── Button "JSON" (Download icon)
    │   └── Button "CSV" (Download icon)
    ├── conversation[]  (QAEntry[])
    │   ├── "Q{n}" label + question text
    │   ├── answer paragraph
    │   ├── QuoteCard[] (per quote in entry.quotes)
    │   │   ├── blockquote (italic, border-l-2)
    │   │   ├── speaker attribution (name, title at company)
    │   │   └── call source (title · date)
    │   └── Separator (between entries)
    ├── follow-up area (if < 5 questions)
    │   ├── "N questions remaining" hint
    │   ├── Input (followUpInput, onKeyDown Enter → handleFollowUp)
    │   └── Button (Send icon / Loader2)
    └── token usage indicator (tokensUsed / TOKEN_BUDGET)
```

---

## 3. Component Reference

### `CallCard` (inline in `src/app/calls/page.tsx`)

**File:** `src/app/calls/page.tsx`

| Prop | Type |
|------|------|
| `call` | `GongCall` |
| `isSelected` | `boolean` |
| `onToggle` | `(id: string) => void` |
| `transcriptSearchActive` | `boolean` |
| `matchSnippets` | `TranscriptMatch[]` |
| `speakerFilter` | `'all' \| 'external' \| 'internal'` |
| `transcriptKeyword` | `string` |
| `getMatchAffiliation` | `(speakerId: string, call: GongCall) => 'internal' \| 'external'` |
| `activeTrackers` | `Set<string>` |
| `activeTopics` | `Set<string>` |

**Hooks used:** none (pure render)

**API calls:** none

**State managed:** none

**Children rendered:** `Card`, `CardContent`, `Checkbox`, `Badge` (tracker chips), inline match snippet blocks with `highlightKeyword()` output

---

### `AnalyzePanel` (`src/components/analyze-panel.tsx`)

**File:** `src/components/analyze-panel.tsx`

| Prop | Type |
|------|------|
| `selectedCalls` | `any[]` |
| `session` | `any` |
| `allCalls` | `any[]` |

**Hooks used:** `useState`, `useCallback`

**State managed:**

| State variable | Type | Purpose |
|----------------|------|---------|
| `question` | `string` | Research question input value |
| `stage` | `Stage` | Pipeline stage: `'idle' \| 'scoring' \| 'scored' \| 'analyzing' \| 'results'` |
| `error` | `string` | Error message string |
| `scoredCalls` | `ScoredCall[]` | Scored + ranked call results from `/api/analyze/score` |
| `callFindings` | `CallFindings[]` | Per-call extracted findings from batch-run |
| `conversation` | `QAEntry[]` | Q&A history (max 5 entries) |
| `analysisProgress` | `string` | Progress message displayed during analysis stage |
| `followUpInput` | `string` | Follow-up question input value |
| `followUpLoading` | `boolean` | Follow-up fetch in-flight flag |
| `processedDataCache` | `string` | Full transcript evidence string cached for follow-up Q&A |
| `tokensUsed` | `number` | Running token budget estimate |

**API calls made:**

| Handler | Endpoint | Purpose |
|---------|----------|---------|
| `handleScore` | `POST /api/analyze/score` | Score all selectedCalls for relevance |
| `handleAnalyze` | `POST /api/gong/transcripts` | Fetch raw transcript monologues |
| `handleAnalyze` | `POST /api/analyze/process` | Smart-truncate long internal monologues (per call, conditional) |
| `handleAnalyze` | `POST /api/analyze/batch-run` | Extract findings across all selected calls in one request |
| `handleAnalyze` | `POST /api/analyze/synthesize` | Synthesize direct answer + sourced quotes |
| `handleFollowUp` | `POST /api/analyze/followup` | Answer follow-up question against cached evidence |

**Children rendered:** `Button`, `Input`, `Label`, `Badge`, `Card`, `CardContent`, `Checkbox`, `Separator`, `ScrollArea`, `QuoteCard` (inline), `Loader2`, `Search`, `Sparkles`, `Send`, `Download`

---

### `QuoteCard` (inline in `src/components/analyze-panel.tsx`)

| Prop | Type |
|------|------|
| `q` | `QuoteAttribution` |

`QuoteAttribution`: `{ quote: string; speaker_name: string; job_title: string; company: string; call_title: string; call_date: string }`

Renders a left-border quote block with speaker attribution and call source. No hooks, no state.

---

### `MultiSelect` (`src/components/ui/multi-select.tsx`)

| Prop | Type | Default |
|------|------|---------|
| `options` | `MultiSelectOption[]` | required |
| `selected` | `Set<string>` | required |
| `onToggle` | `(value: string) => void` | required |
| `placeholder` | `string` | `'Select...'` |
| `searchPlaceholder` | `string` | `'Search...'` |
| `className` | `string` | — |

`MultiSelectOption`: `{ value: string; label: string; count?: number }`

**Hooks used:** `React.useState` (`open: boolean`)

**State managed:** `open` — popover open/close

**Children rendered:** `Popover`, `PopoverTrigger`, `PopoverContent`, `Button`, `Badge`, `Command`, `CommandInput` (conditional, only if `options.length > 5`), `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `Check` icon, `ChevronDown` icon

---

### `Calendar` (`src/components/ui/calendar.tsx`)

Wraps `DayPicker` from `react-day-picker` with shadcn-compatible Tailwind class mapping.

Additional prop beyond `DayPicker`: `buttonVariant?: React.ComponentProps<typeof Button>["variant"]` (default `"ghost"`)

Inline sub-component `CalendarDayButton` uses shadcn `Button` with `variant="ghost" size="icon"` for each day cell and handles focus management via `useRef` + `useEffect`.

**Used by:** `ConnectPage` (date range picker)

---

## 4. Custom Hooks

### `useFilterState` (`src/hooks/useFilterState.ts`)

**Purpose:** Centralizes all call-list filter state. Numeric and boolean filters are persisted to `localStorage` under key `gongwizard_filters`. Text searches and multi-select sets are session-only React state.

**Parameters:** none

**Return value:**

| Key | Type | Persisted to localStorage |
|-----|------|--------------------------|
| `searchText` | `string` | No |
| `setSearchText` | `(v: string) => void` | — |
| `participantSearch` | `string` | No |
| `setParticipantSearch` | `(v: string) => void` | — |
| `aiContentSearch` | `string` | No |
| `setAiContentSearch` | `(v: string) => void` | — |
| `excludeInternal` | `boolean` | Yes |
| `setExcludeInternal` | `(v: boolean) => void` | — |
| `durationRange` | `[number, number]` | Yes |
| `setDurationRange` | `(v: [number, number]) => void` | — |
| `talkRatioRange` | `[number, number]` | Yes |
| `setTalkRatioRange` | `(v: [number, number]) => void` | — |
| `minExternalSpeakers` | `number` | Yes |
| `setMinExternalSpeakers` | `(v: number) => void` | — |
| `activeTrackers` | `Set<string>` | No |
| `toggleTracker` | `(name: string) => void` | — |
| `activeTopics` | `Set<string>` | No |
| `toggleTopic` | `(name: string) => void` | — |
| `resetFilters` | `() => void` | Clears all + removes localStorage key |

**Internal hooks used:** `useState`, `useCallback`, `useRef`, `useEffect`

**Side effects:** Reads `localStorage` synchronously on first render via `loadPersistedFilters()`. Writes to `localStorage` on every change to a persisted field via `updatePersisted()` (stable callback — reads current values through a `useRef` mirror to avoid stale closure).

**Used by:** `CallsPage`

---

### `useCallExport` (`src/hooks/useCallExport.ts`)

**Purpose:** Encapsulates all export logic — fetching transcripts for selected calls, assembling `CallForExport` objects (speaker map, sorted sentences, turn grouping), dispatching to the formatter, and triggering browser downloads (single file, clipboard, or ZIP).

**Parameters:**

| Param | Type |
|-------|------|
| `selectedIds` | `Set<string>` |
| `session` | `GongSession` |
| `calls` | `GongCall[]` |
| `exportFormat` | `'markdown' \| 'xml' \| 'jsonl' \| 'csv' \| 'utterance-csv'` |
| `exportOpts` | `ExportOptions` |

`ExportOptions`: `{ condenseMonologues: boolean; includeMetadata: boolean; includeAIBrief: boolean; includeInteractionStats: boolean }`

**Return value:**

| Key | Type | Description |
|-----|------|-------------|
| `exporting` | `boolean` | Any export operation in-flight |
| `copied` | `boolean` | True for 2 s after successful clipboard copy |
| `handleExport` | `() => Promise<void>` | Downloads single merged file |
| `handleCopy` | `() => Promise<void>` | Copies to clipboard |
| `handleZipExport` | `() => Promise<void>` | Downloads ZIP (one file per call + `manifest.json`) |

**Internal hooks used:** `useState`, `useCallback`

**API calls made:**
- `POST /api/gong/transcripts` (`fetchTranscriptsForSelected`) — sends selected call IDs + `baseUrl` with `X-Gong-Auth` header

**Side effects:**
- `downloadFile` (`src/lib/browser-utils.ts`) — ephemeral `<a>` element + `URL.createObjectURL`
- `downloadZip` (`client-zip`) for ZIP blob
- `navigator.clipboard.writeText` for copy

**Used by:** `CallsPage`

---

## 5. UI Library Notes

### Component Library: shadcn/ui

- CLI version: `shadcn ^3.8.5` (dev dependency — used for component scaffolding only)
- All components in `src/components/ui/`
- Uses the **unified `radix-ui ^1.4.3` package** for all primitives (single import: `import { Checkbox, Slider, ... } from "radix-ui"`)
- Style composition pattern:
  - `class-variance-authority` (CVA) — variant-based className composition (`buttonVariants`, `badgeVariants`, `tabsListVariants`)
  - `clsx` — conditional className joining
  - `tailwind-merge` — Tailwind class conflict resolution
  - `cn()` in `src/lib/utils.ts` combines `clsx` + `twMerge`

### Styling: Tailwind CSS v4

- Tailwind v4 configured via `@tailwindcss/postcss` (PostCSS plugin — no `tailwind.config.js` file)
- CSS variable theming: `--primary`, `--secondary`, `--muted`, `--destructive`, `--border`, `--ring`, `--popover`, `--accent`, `--card`, `--foreground`, etc.
- Animation utilities via `tw-animate-css ^1.4.0`
- Dark mode supported via Tailwind CSS variable switching

### Fonts

Loaded via `next/font/google` in `RootLayout`:
- `Geist` — CSS variable `--font-geist-sans` (sans-serif body)
- `Geist_Mono` — CSS variable `--font-geist-mono` (monospace)

Applied as `antialiased` on `<body>`.

### Icons

`lucide-react ^0.575.0` — tree-shakeable SVG icon components. Icons used in production code:

| Icon | Used in |
|------|---------|
| `Eye`, `EyeOff` | GatePage, ConnectPage (password toggle) |
| `Loader2` | GatePage, ConnectPage, CallsPage, AnalyzePanel |
| `Lock`, `X`, `Shield` | ConnectPage (security reassurance) |
| `CalendarIcon` | ConnectPage (date range trigger) |
| `ChevronDown`, `ChevronUp` | ConnectPage, CallsPage (collapsible panels) |
| `LogOut` | CallsPage (disconnect button) |
| `Download` | CallsPage, AnalyzePanel (export) |
| `Copy` | CallsPage (clipboard export) |
| `Archive` | CallsPage (ZIP export) |
| `Search` | CallsPage, AnalyzePanel |
| `CheckSquare`, `Square` | CallsPage (select all / deselect all) |
| `AlertCircle` | CallsPage (error states) |
| `Sparkles` | AnalyzePanel (analyze button) |
| `Send` | AnalyzePanel (follow-up submit) |
| `Check` | MultiSelect (checked item indicator) |
| `ChevronLeftIcon`, `ChevronRightIcon`, `ChevronDownIcon` | Calendar (nav chevrons) |
| `SearchIcon` | Command (CommandInput) |
| `XIcon` | Dialog (close button) |
| `CheckIcon` | Checkbox (checked state) |
