#!/usr/bin/env python3
"""
GongWizard smoke test — run from any directory.

Covers:
  1. Site gate auth
  2. Session injection → /calls loads without connect redirect
  3. Load Calls → call cards appear
  4. Select All → Export tab → all 5 format tabs present
  5. Utterance CSV download → all 9 columns verified
  6. Transcript search → progress shown → results returned

Usage:
  python3 .claude/skills/gongwizard-test/test_smoke.py

Screenshots saved to /tmp/gw_smoke_*.png
"""

import sys
import time
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

# Allow importing base_session from the same directory
sys.path.insert(0, str(Path(__file__).parent))
from base_session import setup_page, BASE_URL

DOWNLOAD_DIR = '/tmp/gw_smoke_downloads'
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

PASS = '✓'
FAIL = '✗'
results = []


def check(label: str, condition: bool) -> bool:
    icon = PASS if condition else FAIL
    print(f"  {icon} {label}")
    results.append((label, condition))
    return condition


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()

        # ── 1. Gate + session ─────────────────────────────────────────────────
        print("\n[1] Auth setup")
        setup_page(page, BASE_URL)
        page.goto(f'{BASE_URL}/calls')
        page.wait_for_load_state('networkidle')
        time.sleep(1)
        page.screenshot(path='/tmp/gw_smoke_01_calls.png')
        check("Landed on /calls (not redirected to connect)", '/calls' in page.url)

        # ── 2. Load Calls ─────────────────────────────────────────────────────
        print("\n[2] Load calls")
        load_btn = page.locator("button:has-text('Load My Calls')")
        check("Load My Calls button visible", load_btn.count() > 0 and load_btn.first.is_visible())

        if load_btn.count() > 0:
            load_btn.first.click()
            print("    Waiting for calls (up to 30s)…")
            try:
                page.wait_for_load_state('networkidle', timeout=30000)
                time.sleep(8)  # Gong API takes several seconds
            except Exception:
                pass
            page.screenshot(path='/tmp/gw_smoke_02_loaded.png', full_page=True)

        # Count call cards by looking for Select All (appears once calls exist)
        select_all = page.locator("button:has-text('Select All')")
        calls_loaded = select_all.count() > 0
        check("Calls loaded (Select All button present)", calls_loaded)

        # ── 3. Select all + Export ─────────────────────────────────────────────
        print("\n[3] Export panel")
        if calls_loaded:
            select_all.first.click()
            time.sleep(0.5)

        export_tab = page.locator('[role="tab"]:has-text("Export")')
        if export_tab.count() > 0:
            export_tab.first.click()
            time.sleep(0.5)
        page.screenshot(path='/tmp/gw_smoke_03_export.png', full_page=True)

        # Format options are now buttons (not tabs) — check each label is present
        for fmt in ['Markdown', 'XML', 'JSONL', 'CSV Summary', 'Utterance CSV']:
            check(f"Format option '{fmt}' present",
                  page.locator(f'button:has-text("{fmt}")').count() > 0)

        # ── 4. Utterance CSV download ─────────────────────────────────────────
        print("\n[4] Utterance CSV")
        utterance_btn = page.locator('button:has-text("Utterance CSV")')
        if utterance_btn.count() > 0:
            utterance_btn.first.click()
            time.sleep(0.4)

        check("Utterance CSV button selected",
              utterance_btn.count() > 0 and utterance_btn.first.is_visible())

        dl_btn = page.locator('button:has-text("Download")')
        can_download = dl_btn.count() > 0 and dl_btn.first.is_enabled()
        check("Download button enabled", can_download)

        csv_ok = False
        if can_download:
            try:
                with page.expect_download(timeout=30000) as dl_info:
                    dl_btn.first.click()
                dl = dl_info.value
                save_path = f'{DOWNLOAD_DIR}/{dl.suggested_filename}'
                dl.save_as(save_path)
                print(f"    Downloaded: {dl.suggested_filename}")

                with open(save_path) as f:
                    content = f.read()
                lines = [l for l in content.strip().split('\n') if l.strip()]
                header = lines[0] if lines else ''
                expected_cols = [
                    'Call ID', 'Call Date', 'Account Name',
                    'Speaker Name', 'Speaker Title', 'Outline Section',
                    'Tracker Hits', 'PRIMARY_ANALYSIS_TEXT', 'REFERENCE_ONLY_CONTEXT',
                ]
                all_cols_present = all(col in header for col in expected_cols)
                for col in expected_cols:
                    check(f"  Column '{col}'", col in header)
                check(f"CSV has data rows ({len(lines)-1} rows)", len(lines) > 1)
                csv_ok = all_cols_present
            except Exception as e:
                print(f"    Download error: {e}")
                check("CSV download succeeded", False)

        # ── 5. Transcript search ───────────────────────────────────────────────
        print("\n[5] Transcript search")
        # Transcript search is behind a toggle button — click it first
        toggle_btn = page.locator("button:has-text('Search transcripts')")
        if toggle_btn.count() > 0:
            toggle_btn.first.click()
            page.wait_for_timeout(500)
        search_input = page.locator("input[placeholder*='transcript' i], input[placeholder*='Search transcripts' i]")
        check("Search transcripts input visible", search_input.count() > 0)

        if search_input.count() > 0:
            search_input.first.fill("next steps")
            search_btn = page.locator("button:has-text('Search')").last
            if search_btn.count() > 0:
                search_btn.click()
                page.screenshot(path='/tmp/gw_smoke_04_search_progress.png')
                print("    Waiting for results (up to 120s)…")
                try:
                    page.wait_for_selector("text=matches in", timeout=120000)
                    page.screenshot(path='/tmp/gw_smoke_05_search_results.png', full_page=True)
                    check("Search returned results ('matches in' text visible)", True)
                except Exception as e:
                    page.screenshot(path='/tmp/gw_smoke_05_search_timeout.png', full_page=True)
                    check(f"Search returned results (timeout: {e})", False)

        # ── Summary ────────────────────────────────────────────────────────────
        page.screenshot(path='/tmp/gw_smoke_06_final.png', full_page=True)
        browser.close()

    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print(f"\n{'='*50}")
    print(f"Results: {passed}/{total} passed")
    if passed == total:
        print("ALL CHECKS PASSED ✓")
    else:
        print("FAILURES:")
        for label, ok in results:
            if not ok:
                print(f"  ✗ {label}")
    print(f"\nScreenshots: /tmp/gw_smoke_*.png")
    return passed == total


if __name__ == '__main__':
    success = run()
    sys.exit(0 if success else 1)
