#!/usr/bin/env python3
"""
GongWizard date picker E2E test — tests the full Connect page flow.

Goes through the actual user flow:
  1. Pass site gate
  2. Land on Connect page — screenshot the default date range
  3. Open the date picker popover — screenshot the calendar
  4. Fill in API credentials
  5. Submit the form
  6. Verify /calls loads with call cards
  7. Screenshot every step

Screenshots saved to /tmp/gw_datepicker_*.png
"""

import sys
import time
import base64
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from base_session import get_session_data, BASE_URL

SITE_PASSWORD = 'RingMyBell'
PASS = '✓'
FAIL = '✗'
results = []


def check(label: str, condition: bool) -> bool:
    icon = PASS if condition else FAIL
    print(f"  {icon} {label}")
    results.append((label, condition))
    return condition


def run():
    session_data = get_session_data()
    decoded = base64.b64decode(session_data['authHeader']).decode()
    access_key, secret_key = decoded.split(':', 1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
        page = ctx.new_page()

        # ── 1. Pass the site gate ────────────────────────────────────────────
        print("\n[1] Site gate")
        page.goto(f'{BASE_URL}/gate')
        page.wait_for_load_state('networkidle')

        pw_input = page.locator('#password')
        pw_input.fill(SITE_PASSWORD)
        page.locator('button[type="submit"]').click()

        # Wait for redirect to connect page (root /)
        try:
            page.wait_for_selector('#accessKey', timeout=15000)
            check("Passed gate → landed on Connect page", True)
        except Exception:
            # Maybe we need to navigate manually after cookie is set
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            time.sleep(1)
            has_access_key = page.locator('#accessKey').count() > 0
            check("Passed gate → landed on Connect page", has_access_key)

        time.sleep(0.5)
        page.screenshot(path='/tmp/gw_datepicker_01_connect_page.png')
        print(f"    URL: {page.url}")

        # ── 2. Verify date range picker on Connect page ──────────────────────
        print("\n[2] Date range picker")

        # The date button contains an en-dash between the two dates
        date_btn = page.locator('button').filter(has_text='–')
        has_date_btn = date_btn.count() > 0 and date_btn.first.is_visible()
        check("Date range picker button visible", has_date_btn)

        if has_date_btn:
            date_text = date_btn.first.inner_text()
            print(f"    Default range: {date_text}")
            check("Default range pre-populated (contains '–')", '–' in date_text)
        else:
            check("Default range pre-populated", False)

        # ── 3. Open the calendar popover ─────────────────────────────────────
        print("\n[3] Calendar popover")
        if has_date_btn:
            date_btn.first.click()
            time.sleep(0.8)

        page.screenshot(path='/tmp/gw_datepicker_02_calendar_open.png')

        calendar = page.locator('[data-slot="calendar"]')
        cal_visible = calendar.count() > 0 and calendar.first.is_visible()
        check("Calendar popover opened", cal_visible)

        hint = page.locator('text=Max range: 1 year')
        check("Max range hint text visible", hint.count() > 0)

        # Check two months are shown (numberOfMonths={2})
        month_captions = page.locator('[data-slot="calendar"] .rdp-month_caption')
        if month_captions.count() >= 2:
            check(f"Two calendar months shown ({month_captions.count()} months)", True)
        else:
            # Alternative: look for multiple month grids
            month_grids = page.locator('[data-slot="calendar"] .rdp-month')
            check(f"Two calendar months shown ({month_grids.count()} months)", month_grids.count() >= 2)

        # Close popover by pressing Escape
        page.keyboard.press('Escape')
        time.sleep(0.3)

        # ── 4. Fill in credentials ───────────────────────────────────────────
        print("\n[4] Fill credentials")
        access_input = page.locator('#accessKey')
        secret_input = page.locator('#secretKey')

        check("Access Key input visible", access_input.is_visible())
        check("Secret Key input visible", secret_input.is_visible())

        access_input.fill(access_key)
        secret_input.fill(secret_key)
        time.sleep(0.3)
        page.screenshot(path='/tmp/gw_datepicker_03_credentials_filled.png')

        # ── 5. Submit → navigate to /calls ───────────────────────────────────
        print("\n[5] Submit & navigate")
        submit_btn = page.locator('button[type="submit"]')
        check("Submit button visible", submit_btn.is_visible())
        submit_btn.click()

        try:
            page.wait_for_url('**/calls**', timeout=30000)
            check("Navigated to /calls after submit", True)
        except Exception as e:
            page.screenshot(path='/tmp/gw_datepicker_04_submit_error.png')
            check(f"Navigated to /calls (failed: {e})", False)

        page.screenshot(path='/tmp/gw_datepicker_04_calls_loading.png')
        print(f"    URL: {page.url}")

        # ── 6. Verify session storage has date range ─────────────────────────
        print("\n[6] Session storage")
        session_json = page.evaluate("() => sessionStorage.getItem('gongwizard_session')")
        if session_json:
            session = json.loads(session_json)
            from_date = session.get('fromDate')
            to_date = session.get('toDate')
            check(f"Session fromDate present: {from_date[:10] if from_date else 'MISSING'}", from_date is not None)
            check(f"Session toDate present: {to_date[:10] if to_date else 'MISSING'}", to_date is not None)
        else:
            check("Session storage has data", False)

        # ── 7. Wait for calls to load ────────────────────────────────────────
        print("\n[7] Calls loading")
        print("    Waiting for calls to load (up to 90s)…")
        try:
            page.wait_for_selector("button:has-text('Select All')", timeout=90000)
            time.sleep(2)
            check("Calls loaded (Select All visible)", True)
        except Exception:
            check("Calls loaded (Select All visible)", False)

        page.screenshot(path='/tmp/gw_datepicker_05_calls_loaded.png', full_page=True)

        # Check visible call count
        page_text = page.inner_text('body')
        import re
        call_match = re.search(r'(\d+)\s+calls?', page_text, re.IGNORECASE)
        if call_match:
            print(f"    Call count: {call_match.group(0)}")
            check(f"Call count displayed: {call_match.group(0)}", True)

        # Final full-page screenshot
        page.screenshot(path='/tmp/gw_datepicker_06_final.png', full_page=True)
        browser.close()

    # ── Summary ──────────────────────────────────────────────────────────────
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
    print(f"\nScreenshots saved to /tmp/gw_datepicker_*.png")
    return passed == total


if __name__ == '__main__':
    success = run()
    sys.exit(0 if success else 1)
