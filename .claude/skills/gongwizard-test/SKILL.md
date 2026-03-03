---
name: gongwizard-test
description: Test the GongWizard app with Playwright. Handles site gate, Gong credential injection, and common test patterns. Use when asked to test GongWizard, verify a feature, run a browser test, or debug the UI.
---

# GongWizard Playwright Testing Skill

## Quick Start

```bash
# 1. Make sure the dev server is running
cd /Users/forrestmiller/Claude/projects/GongWizard/gongwizard
npm run dev   # starts on http://localhost:3000

# 2. Run the built-in smoke test
python3 .claude/skills/gongwizard-test/test_smoke.py
```

Screenshots land in `/tmp/gw_smoke_*.png`.

---

## Auth & Credentials

All credentials are in `.env.local` at the project root. **Never hardcode values in test scripts.**

| What | Source |
|---|---|
| Gong Access Key | `GONG_DEV_ACCESS_KEY` in `.env.local` |
| Gong Secret Key | `GONG_DEV_SECRET_KEY` in `.env.local` |
| Site gate password | `RingMyBell` (static, not in .env.local) |
| Gong API base URL | `https://us-11211.api.gong.io` |

### Session injection pattern

The app stores auth in `sessionStorage` under key `gongwizard_session`. To bypass the connect screen:

```python
import base64, json
from base_session import setup_page   # helper in this directory

# setup_page handles:
#   1. GET /gate → fill password → Enter
#   2. GET / → inject sessionStorage → navigate to /calls
setup_page(page, base_url='http://localhost:3000')
```

Manual version (if you can't import the helper):

```python
auth_header = base64.b64encode(f"{access_key}:{secret_key}".encode()).decode()
session = {
    "authHeader": auth_header,          # base64(accessKey:secretKey) — no "Basic " prefix
    "baseUrl": "https://us-11211.api.gong.io",
    "internalDomains": [],
}
page.goto('http://localhost:3000')
page.wait_for_load_state('networkidle')
page.evaluate(f"() => sessionStorage.setItem('gongwizard_session', JSON.stringify({json.dumps(session)}))")
page.goto('http://localhost:3000/calls')
page.wait_for_load_state('networkidle')
```

---

## Loading Calls

After navigating to `/calls`, calls are NOT loaded automatically — the user must click "Load Calls":

```python
page.locator("button:has-text('Load Calls')").first.click()
# Wait for actual call cards (networkidle + sleep handles the Gong API round-trip)
page.wait_for_load_state('networkidle')
time.sleep(8)   # Gong API takes several seconds for extensive call metadata
```

## Selecting Calls

```python
# Select all at once
select_all = page.locator("button:has-text('Select All')")
if select_all.count() > 0:
    select_all.first.click()
```

Do NOT use `[role="checkbox"]` — this matches the sidebar "Exclude internal-only calls" filter checkbox too.

---

## Export Panel

The right panel has two top-level tabs: **Analyze** and **Export**.

Export format tabs (only visible after ≥1 call is selected):
- `Markdown` — full transcript markdown
- `XML` — structured XML
- `JSONL` — one JSON object per line
- `Summary` — CSV with AI summary fields
- `Utterance` — CSV for LLM workflows (9 columns: Call ID, Call Date, Account Name, Speaker Name, Speaker Title, Outline Section, Tracker Hits, PRIMARY_ANALYSIS_TEXT, REFERENCE_ONLY_CONTEXT)

```python
page.locator('[role="tab"]:has-text("Export")').first.click()
page.locator('[role="tab"]:has-text("Utterance")').first.click()
```

---

## Transcript Search

The search bar lives in the center column above the call list (visible after calls are loaded):

```python
page.locator("input[placeholder*='transcript' i]").fill("next steps")
page.locator("button:has-text('Search')").last.click()
# Wait for streaming results
page.wait_for_selector("text=matches in", timeout=120000)
```

---

## Writing New Tests

1. Import `setup_page` from `base_session.py` (same directory)
2. Always: launch headless Chromium, `accept_downloads=True` context
3. Always: take screenshots for debugging (`/tmp/gw_<name>_<step>.png`)
4. For downloads: use `page.expect_download()` context manager

See `test_smoke.py` for a complete working example.
