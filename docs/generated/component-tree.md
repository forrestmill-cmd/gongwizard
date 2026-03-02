# Component Tree

## 1. Page Structure

```mermaid
graph TD
    MW[middleware.ts<br/>Edge: gw-auth cookie check] --> GATE[/gate — GatePage]
    MW --> ROOT[/ — ConnectPage]
    MW --> CALLS[/calls — CallsPage]
    MW -->|pass-through| API[/api/* — API Routes]

    ROOT -.->|on success, router.push| CALLS
    GATE -.->|on success, router.push| ROOT
```

**Routing hierarchy:**

| Route | File | Layout | Data Fetching |
|---|---|---|---|
| `/gate` | `src/app/gate/page.tsx` | `RootLayout` | Client — POST `/api/auth` |
| `/` | `src/app/page.tsx` | `RootLayout` | Client — POST `/api/gong/connect` |
| `/calls` | `src/app/calls/page.tsx` | `RootLayout` | Client — POST `/api/gong/calls`, POST `/api/gong/transcripts` |

**Layout:** `src/app/layout.tsx` (`RootLayout`) — applied to all pages. Loads Geist and Geist Mono fonts, sets `<html lang="en">`, renders `{children}`.

**Middleware:** `src/middleware.ts` — runs at the Edge on every request matching `/((?!_next/static|_next/image|favicon.ico).*)`. Reads the `gw-auth` httpOnly cookie; redirects to `/gate` if absent. `/gate`, `/api/*`, `/_next/*`, and `/favicon` are exempted.

---

## 2. Component Hierarchy

### RootLayout (`src/app/layout.tsx`)
```
RootLayout
└── <html lang="en">
    └── <body> (Geist + Geist Mono font variables, antialiased)
        └── {children}
```

### GatePage (`src/app/gate/page.tsx`)
```
GatePage
└── <div> (min-h-screen centered)
    └── <div> (max-w-md)
        ├── <h1> "GongWizard"
        ├── <p> tagline
        └── Card
            ├── CardHeader
            │   └── CardTitle "Enter Password"
            └── CardContent
                └── <form onSubmit={handleSubmit}>
                    ├── <div> (password field group)
                    │   ├── Label[htmlFor="password"]
                    │   └── <div> (relative wrapper)
                    │       ├── Input[id="password", type=password|text]
                    │       └── <button> (toggle show/hide)
                    │           └── Eye | EyeOff (lucide)
                    ├── <p> error message (conditional)
                    └── Button[type="submit", size="lg"]
                        └── Loader2 (lucide, conditional) | "Continue"
```

### ConnectPage (`src/app/page.tsx`)
```
ConnectPage
└── <div> (min-h-screen centered)
    └── <div> (max-w-md)
        ├── <h1> "GongWizard"
        ├── <p> tagline
        ├── Card
        │   ├── CardHeader
        │   │   └── CardTitle "Connect to Gong"
        │   └── CardContent
        │       └── <form onSubmit={handleConnect}>
        │           ├── <div> Access Key field
        │           │   ├── Label[htmlFor="accessKey"]
        │           │   └── Input[id="accessKey", type="text"]
        │           ├── <div> Secret Key field
        │           │   ├── Label[htmlFor="secretKey"]
        │           │   └── <div> (relative wrapper)
        │           │       ├── Input[id="secretKey", type=password|text]
        │           │       └── <button> (toggle show/hide)
        │           │           └── Eye | EyeOff (lucide)
        │           ├── <div> (collapsible help accordion)
        │           │   ├── <button> "How to get these" + ChevronDown|ChevronUp
        │           │   └── <div> (instructions, conditional on showHelp)
        │           │       └── <ol> (4 steps)
        │           ├── <p> error message (conditional)
        │           └── Button[type="submit", size="lg"]
        │               └── Loader2 | "Connect"
        └── <div> (security trust badges)
            ├── <span> Lock + "Credentials stored in session only"
            ├── <span> X + "Cleared when you close this tab"
            └── <span> Shield + "No server-side storage"
```

### CallsPage (`src/app/calls/page.tsx`)
```
CallsPage
└── <div> (min-h-screen flex flex-col)
    ├── <header> (sticky top bar)
    │   ├── <span> "GongWizard" brand
    │   ├── <div> (controls row)
    │   │   ├── Label + Input[type="date", id="fromDate"]
    │   │   ├── Label + Input[type="date", id="toDate"]
    │   │   ├── Label + <select> workspace (conditional: >1 workspace)
    │   │   └── Button "Load Calls" (Loader2 when loading)
    │   └── Button[variant="ghost"] "Disconnect" + LogOut icon
    ├── <div> (3-column flex body)
    │   ├── <aside> (left sidebar, hidden on mobile, w-[240px])
    │   │   ├── <h3> "Filters"
    │   │   ├── <div> (search field)
    │   │   │   ├── Search icon (lucide)
    │   │   │   └── Input placeholder="Search calls..."
    │   │   ├── <div> (internal-only toggle)
    │   │   │   ├── Checkbox[id="excludeInternal"]
    │   │   │   └── Label "Exclude internal-only calls"
    │   │   ├── <div> (tracker filters, conditional: allTrackers.length > 0)
    │   │   │   ├── <h3> "Trackers"
    │   │   │   └── {allTrackers.map}
    │   │   │       ├── Checkbox[id="tracker-{name}"]
    │   │   │       ├── Label {tracker name}
    │   │   │       └── <span> {count}
    │   │   └── <div> (load stats, conditional: hasLoaded)
    │   │       ├── <p> "{n} calls loaded"
    │   │       └── <p> "{n} shown"
    │   ├── <main> (center call list, flex-1, overflow-y-auto)
    │   │   ├── <div> (mobile search, md:hidden)
    │   │   │   ├── Search icon
    │   │   │   └── Input placeholder="Search calls..."
    │   │   ├── <div> (select-all bar, conditional: filteredCalls.length > 0)
    │   │   │   ├── Button[variant="ghost", size="xs"] "Select All"
    │   │   │   ├── Button[variant="ghost", size="xs"] "Deselect All"
    │   │   │   └── <span> "{n} selected"
    │   │   ├── <div> error banner (conditional: loadError) + AlertCircle icon
    │   │   ├── <div> loading spinner (conditional: loading)
    │   │   ├── <div> "No calls found" empty state (conditional)
    │   │   ├── <div> "No calls loaded yet" empty state (conditional)
    │   │   └── {filteredCalls.map} — one Card per call
    │   │       └── Card (clickable, ring-2 when selected)
    │   │           └── CardContent
    │   │               └── <div> (flex row)
    │   │                   ├── Checkbox (selection)
    │   │                   └── <div> (call info)
    │   │                       ├── <p> call.title + date
    │   │                       ├── <div> duration / speaker counts / account
    │   │                       ├── <div> topic/tracker badges (conditional)
    │   │                       │   ├── Badge[variant="secondary"] per topic
    │   │                       │   └── Badge[variant="outline"] per tracker
    │   │                       ├── <p> call.brief (conditional, line-clamp-2)
    │   │                       └── <div> talk ratio bar (conditional)
    │   └── <aside> (right sidebar, hidden below lg, w-[280px])
    │       ├── empty state "No calls selected" (conditional: selectedIds.size === 0)
    │       └── export panel (conditional: selectedIds.size > 0)
    │           ├── <p> "{n} calls selected"
    │           ├── <p> "~{n} tokens estimated"
    │           ├── <p> contextLabel (color-coded)
    │           ├── Separator
    │           ├── Label "Format" + Tabs (markdown / xml / jsonl)
    │           │   └── TabsList
    │           │       ├── TabsTrigger "Markdown"
    │           │       ├── TabsTrigger "XML"
    │           │       └── TabsTrigger "JSONL"
    │           ├── Label "Options"
    │           │   └── {exportOpts keys.map}
    │           │       ├── Checkbox[id="opt-{key}"]
    │           │       └── Label {label}
    │           ├── Separator
    │           ├── Button "Download" (Loader2 when exporting)
    │           ├── Button[variant="outline"] "Copy to Clipboard" (conditional: <= 10 selected)
    │           └── <div> (select/deselect all mini-buttons)
    └── <div> mobile export bar (lg:hidden, conditional: selectedIds.size > 0)
        ├── <span> "{n} selected . ~{n} tokens"
        └── Button "Export" (Loader2 | Download icon)
```

---

## 3. Component Reference

### GatePage
**File:** `src/app/gate/page.tsx`

**Props:** none (Next.js page)

**Hooks:**
- `useState` — `password: string`, `showPassword: boolean`, `loading: boolean`, `error: string`
- `useRouter` (next/navigation)

**API calls:**
- `POST /api/auth` — body `{ password }` — on success sets `gw-auth` cookie server-side; client calls `router.push('/')`

**State managed:**
- Password field value and visibility toggle
- Submission loading and error message

---

### ConnectPage
**File:** `src/app/page.tsx`

**Props:** none (Next.js page)

**Hooks:**
- `useState` — `accessKey: string`, `secretKey: string`, `showSecret: boolean`, `showHelp: boolean`, `loading: boolean`, `error: string`
- `useRouter` (next/navigation)

**API calls:**
- `POST /api/gong/connect` — headers `{ X-Gong-Auth: btoa(accessKey:secretKey) }` — returns `{ users, trackers, workspaces, internalDomains, baseUrl }`

**State managed:**
- API credential field values and visibility
- Help accordion open/closed
- Submission loading and error message

**Side effects:**
- On successful connect: calls `saveSession({ ...data, authHeader })` writing to `sessionStorage['gongwizard_session']`, then `router.push('/calls')`

**Helper (module-level):** `saveSession(data)` — writes to `sessionStorage['gongwizard_session']`

---

### CallsPage
**File:** `src/app/calls/page.tsx`

**Props:** none (Next.js page)

**Hooks:**
- `useState` — 16 state variables (see table below)
- `useEffect` — reads session from `sessionStorage` on mount; redirects to `/` if absent
- `useMemo` — `allTrackers`, `filteredCalls`, `trackerCounts`, `selectedCalls`, `tokenEstimate`
- `useRouter` (next/navigation)

**State managed:**

| State variable | Type | Purpose |
|---|---|---|
| `session` | `any \| null` | Deserialized `gongwizard_session` from sessionStorage |
| `fromDate` | `string` | Date range start (default: 30 days ago, `yyyy-MM-dd`) |
| `toDate` | `string` | Date range end (default: today) |
| `calls` | `GongCall[]` | Raw call list from API |
| `loading` | `boolean` | Calls fetch in progress |
| `loadError` | `string` | Error message from calls fetch |
| `hasLoaded` | `boolean` | Whether calls have been fetched at least once |
| `selectedIds` | `Set<string>` | IDs of checked calls |
| `searchText` | `string` | Filter search query |
| `excludeInternal` | `boolean` | Filter: hide calls with zero external speakers |
| `activeTrackers` | `Set<string>` | Filter: required tracker names |
| `workspaceId` | `string` | Gong workspace filter (blank = all) |
| `exportFormat` | `'markdown' \| 'xml' \| 'jsonl'` | Selected export format |
| `exportOpts` | `ExportOptions` | Export processing toggles |
| `exporting` | `boolean` | Export/copy in progress |
| `copied` | `boolean` | Clipboard copy success flash (2s) |

**API calls:**
- `POST /api/gong/calls` — headers `{ X-Gong-Auth }` — body `{ fromDate, toDate, baseUrl, workspaceId? }` — returns `{ calls }`
- `POST /api/gong/transcripts` — headers `{ X-Gong-Auth }` — body `{ callIds, baseUrl }` — returns `{ transcripts }`

**Computed values (useMemo):**

| Name | Depends on | Purpose |
|---|---|---|
| `allTrackers` | `session.trackers` | Flat list of tracker names |
| `filteredCalls` | `calls, excludeInternal, searchText, activeTrackers` | Visible subset after all filters |
| `trackerCounts` | `calls, allTrackers` | Count of calls per tracker name |
| `selectedCalls` | `calls, selectedIds` | `GongCall[]` objects for selected IDs |
| `tokenEstimate` | `selectedCalls` | Rough token count (duration * 130 words/min * 1.3 tokens/word) |

**Key functions:**

| Function | Purpose |
|---|---|
| `loadCalls()` | Fetches call list; classifies speakers via `isInternalParty`; builds `GongCall[]` |
| `fetchTranscriptsForSelected()` | Fetches monologues; builds speaker maps; calls `groupTranscriptTurns`; returns `CallForExport[]` |
| `handleExport()` | Calls `fetchTranscriptsForSelected`, builds content via `buildExportContent`, triggers `downloadFile` |
| `handleCopy()` | Calls `fetchTranscriptsForSelected`, builds content, writes to `navigator.clipboard` |
| `toggleSelect(id)` | Adds/removes ID from `selectedIds` |
| `selectAll()` | Sets `selectedIds` to all `filteredCalls` IDs |
| `deselectAll()` | Clears `selectedIds` |
| `toggleTracker(name)` | Adds/removes tracker name from `activeTrackers` |
| `disconnect()` | Removes `gongwizard_session` from sessionStorage, redirects to `/` |

---

## 4. Custom Hooks

There are no files in a dedicated `hooks/` directory. All stateful logic lives inline in the page components. The session helpers are module-level utility functions shared across pages:

### `saveSession(data)` / `getSession()`
**Files:** `src/app/page.tsx` (saveSession only), `src/app/calls/page.tsx` (both)

**Purpose:** Read and write the `gongwizard_session` key in `sessionStorage`. The session object shape: `{ authHeader: string, users: any[], trackers: any[], workspaces: any[], internalDomains: string[], baseUrl: string }`.

**Parameters:**
- `saveSession(data: any)` — no return value
- `getSession()` — returns `any | null`

**Side effects:** `sessionStorage` access — only safe in client components (`'use client'`)

**Used by:** `ConnectPage` (write on connect success), `CallsPage` (read on mount, re-save not currently done)

---

## 5. Pure Utility Functions (module-level in `src/app/calls/page.tsx`)

These are not hooks but contain all the business logic for transcript processing and export formatting:

| Function | Signature | Purpose |
|---|---|---|
| `estimateTokens(text)` | `(string) => number` | `Math.ceil(text.length / 4)` — GPT tokenizer heuristic |
| `contextLabel(tokens)` | `(number) => string` | Maps token count to context window label (GPT-3.5 to Claude 200K) |
| `contextColor(tokens)` | `(number) => string` | Tailwind color class: green < 32K, yellow < 128K, red >= 128K |
| `formatDuration(seconds)` | `(number) => string` | Formats as `Xh Ym`, `Xm Ys`, or `Xs` |
| `isInternalParty(party, domains)` | `(any, string[]) => boolean` | `party.affiliation === 'Internal'` with email domain fallback |
| `formatTimestamp(ms)` | `(number) => string` | Milliseconds to `m:ss` display string |
| `groupTranscriptTurns(sentences, speakerMap)` | `(TranscriptSentence[], Map<string, Speaker>) => FormattedTurn[]` | Groups consecutive same-speaker sentences into single turn objects |
| `filterFillerTurns(turns)` | `(FormattedTurn[]) => FormattedTurn[]` | Drops turns < 5 chars or matching `FILLER_PATTERNS` regex list |
| `condenseInternalMonologues(turns)` | `(FormattedTurn[]) => FormattedTurn[]` | Merges runs of 3+ consecutive same-speaker internal turns into one |
| `buildMarkdown(calls, opts)` | `(CallForExport[], ExportOptions) => string` | Full Markdown export with header, token count, and per-call sections |
| `buildCallText(call, opts)` | `(CallForExport, ExportOptions) => string` | Single call as Markdown (calls `filterFillerTurns`, `condenseInternalMonologues`) |
| `buildXML(calls, opts)` | `(CallForExport[], ExportOptions) => string` | Full XML export; external speaker text uppercased |
| `buildJSONL(calls, opts)` | `(CallForExport[], ExportOptions) => string` | One JSON object per call, newline-separated |
| `buildExportContent(calls, format, opts)` | `(CallForExport[], 'markdown'\|'xml'\|'jsonl', ExportOptions) => { content, extension, mimeType }` | Dispatcher routing to markdown/xml/jsonl builder |
| `escapeXml(str)` | `(string) => string` | Escapes `& < > " '` for safe XML embedding |
| `downloadFile(content, filename, mimeType)` | `(string, string, string) => void` | Creates Blob URL, attaches to `<a>`, clicks it, revokes URL |

**Constants:**
- `FILLER_PATTERNS` — array of regex patterns matching social filler utterances (hi, hello, thanks, yes, ok, etc.)

---

## 6. TypeScript Interfaces (declared in `src/app/calls/page.tsx`)

| Interface | Fields |
|---|---|
| `Speaker` | `speakerId: string, name: string, firstName: string, isInternal: boolean, title?: string` |
| `TranscriptSentence` | `speakerId: string, text: string, start: number` |
| `FormattedTurn` | `speakerId: string, firstName: string, isInternal: boolean, timestamp: string, text: string` |
| `CallForExport` | `id: string, title: string, date: string, duration: number, accountName: string, speakers: Speaker[], brief: string, turns: FormattedTurn[], interactionStats?: any` |
| `GongCall` | `id: string, title: string, started: string, duration: number, accountName?: string, topics?: string[], trackers?: string[], brief?: string, parties?: any[], interactionStats?: any, internalSpeakerCount: number, externalSpeakerCount: number, talkRatio?: number` |
| `ExportOptions` | `removeFillerGreetings: boolean, condenseMonologues: boolean, includeMetadata: boolean, includeAIBrief: boolean, includeInteractionStats: boolean` |

---

## 7. UI Library Notes

**Library:** shadcn/ui (v3.x, installed as `shadcn` devDependency)

**Primitive layer:** `radix-ui` v1.4.3 (consolidated package — Checkbox, Dialog, Label, Popover, ScrollArea, Separator, Tabs, Toggle, ToggleGroup, Tooltip all imported from `"radix-ui"`)

**Styling:** Tailwind CSS v4 + `tw-animate-css` for enter/exit animations. Class composition uses `class-variance-authority` (cva) for variant logic and `clsx` + `tailwind-merge` via `cn()` from `src/lib/utils.ts`.

**Components installed** (`src/components/ui/`):

| Component | Primitives used | Variants / notes |
|---|---|---|
| `Badge` | `radix-ui` Slot | `default, secondary, destructive, outline, ghost, link` |
| `Button` | `radix-ui` Slot | variants: `default, destructive, outline, secondary, ghost, link`; sizes: `default, xs, sm, lg, icon, icon-xs, icon-sm, icon-lg` |
| `Calendar` | `react-day-picker` DayPicker | Custom `CalendarDayButton` sub-component; supports range selection, dropdown caption |
| `Card` | none (plain divs) | Sub-components: `Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter` |
| `Checkbox` | `radix-ui` Checkbox | CheckIcon from lucide |
| `Command` | `cmdk` CommandPrimitive | Sub-components: `Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator, CommandShortcut` |
| `Dialog` | `radix-ui` Dialog | `showCloseButton?: boolean` prop on `DialogContent` and `DialogFooter`; sub-components: `Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose` |
| `Input` | none (native `<input>`) | Single variant; passes all native input props |
| `Label` | `radix-ui` Label | |
| `Popover` | `radix-ui` Popover | Sub-components: `Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverHeader, PopoverTitle, PopoverDescription` |
| `ScrollArea` | `radix-ui` ScrollArea | Includes `ScrollBar` sub-component (vertical/horizontal) |
| `Separator` | `radix-ui` Separator | horizontal / vertical orientation |
| `Tabs` | `radix-ui` Tabs | `tabsListVariants`: `default, line`; sub-components: `Tabs, TabsList, TabsTrigger, TabsContent` |
| `Toggle` | `radix-ui` Toggle | variants: `default, outline`; sizes: `default, sm, lg`; exports `toggleVariants` for reuse |
| `ToggleGroup` | `radix-ui` ToggleGroup | Uses `ToggleGroupContext` to propagate variant/size to `ToggleGroupItem`; `spacing` prop controls gap |
| `Tooltip` | `radix-ui` Tooltip | `delayDuration` defaults to 0; sub-components: `TooltipProvider, Tooltip, TooltipTrigger, TooltipContent` |

**Icons:** `lucide-react` v0.575.0 — used throughout pages and primitives. No custom icon components.

**Fonts:** Geist Sans (`--font-geist-sans`) and Geist Mono (`--font-geist-mono`) loaded via `next/font/google` in `RootLayout`.

**Theme tokens:** Defined via CSS custom properties (Tailwind v4 config-less approach). Tokens follow shadcn conventions: `--background`, `--foreground`, `--primary`, `--muted`, `--destructive`, `--border`, `--ring`, `--accent`, `--popover`, `--card`, etc. Dark mode supported via `dark:` variants throughout all primitive components.
