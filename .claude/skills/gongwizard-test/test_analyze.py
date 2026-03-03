#!/usr/bin/env python3
"""
GongWizard analyze pipeline test — run from any directory.

Covers:
  1. Load calls, select all, switch to Analyze tab
  2. Submit question for relevance scoring (Gemini Flash-Lite)
  3. Wait for scored calls to appear
  4. Click Analyze — batch request to /api/analyze/batch-run (Gemini 2.5 Pro)
  5. Verify answer text present
  6. Verify quote/attribution visible

Usage:
  python3 .claude/skills/gongwizard-test/test_analyze.py

Screenshots saved to /tmp/gw_analyze_*.png
"""

import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from base_session import setup_page, BASE_URL

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
        ctx = browser.new_context()
        page = ctx.new_page()

        # ── 1. Gate + session ─────────────────────────────────────────────────
        print("\n[1] Auth setup")
        setup_page(page, BASE_URL)
        page.goto(f'{BASE_URL}/calls')
        page.wait_for_load_state('networkidle')
        time.sleep(1)
        check("Landed on /calls (not redirected to connect)", '/calls' in page.url)

        # ── 2. Load calls ─────────────────────────────────────────────────────
        print("\n[2] Load calls")
        load_btn = page.locator("button:has-text('Load My Calls')")
        if load_btn.count() > 0:
            load_btn.first.click()
            print("    Waiting for calls (up to 30s)…")
            try:
                page.wait_for_load_state('networkidle', timeout=30000)
                time.sleep(8)
            except Exception:
                pass

        select_all = page.locator("button:has-text('Select All')")
        calls_loaded = select_all.count() > 0
        check("Calls loaded (Select All button present)", calls_loaded)

        # ── 3. Select all ─────────────────────────────────────────────────────
        print("\n[3] Select all calls")
        if calls_loaded:
            select_all.first.click()
            time.sleep(0.5)

        # ── 4. Switch to Analyze tab ──────────────────────────────────────────
        print("\n[4] Analyze tab")
        analyze_tab = page.locator('[role="tab"]:has-text("Analyze")')
        analyze_tab_visible = analyze_tab.count() > 0 and analyze_tab.first.is_visible()
        check("Analyze tab visible", analyze_tab_visible)

        if analyze_tab_visible:
            analyze_tab.first.click()
            time.sleep(0.5)

        # ── 5. Type question and submit for scoring ───────────────────────────
        print("\n[5] Submit question for scoring")
        # The question input is the only input with a research-question placeholder
        question_input = page.locator(
            "input[placeholder*='objection' i], "
            "input[placeholder*='pricing' i], "
            "input[placeholder*='customer' i], "
            "input[placeholder*='question' i], "
            "textarea[placeholder*='question' i]"
        ).first

        question_typed = False
        if question_input.count() > 0 and question_input.is_visible():
            question_input.fill("What are customers saying about pricing?")
            time.sleep(0.3)
            question_typed = True
        check("Question submitted for scoring", question_typed)

        # Find and click the scoring button (Find Relevant Calls) — now enabled after filling input
        score_btn = page.locator(
            "button:has-text('Find Relevant Calls'), "
            "button:has-text('Score'), "
            "button:has-text('Find Calls')"
        ).first
        score_btn_visible = score_btn.count() > 0 and score_btn.is_visible()

        if score_btn_visible and question_typed:
            score_btn.click()
            print("    Waiting for scored calls (up to 60s)…")
            try:
                # Score badges look like "7/10" or "4/10"
                page.wait_for_selector(
                    "text=/\\d+\\/10/, [class*='score'], [class*='badge'], [data-score]",
                    timeout=60000
                )
            except Exception:
                # Fallback: just wait a bit for any results area
                time.sleep(10)

        page.screenshot(path='/tmp/gw_analyze_01_scored.png', full_page=True)

        # Check for score badges in the UI
        score_visible = (
            page.locator("text=/\\d+\\/10/").count() > 0
            or page.locator("[class*='score']").count() > 0
            or page.locator("[class*='relevant']").count() > 0
            or page.locator("[class*='badge']").count() > 0
        )
        check("Scored calls visible", score_visible)

        # ── 6. Click Analyze ──────────────────────────────────────────────────
        print("\n[6] Run analysis")
        analyze_btn = page.locator(
            "button:has-text('Analyze'), "
            "button:has-text('Run Analysis'), "
            "button:has-text('Analyze Calls')"
        ).first
        analyze_btn_visible = analyze_btn.count() > 0 and analyze_btn.is_visible()
        check("Analyze button visible after scoring", analyze_btn_visible)

        if analyze_btn_visible:
            analyze_btn.click()
            print("    Waiting for analysis results (up to 120s)…")
            page.screenshot(path='/tmp/gw_analyze_02_analyzing.png', full_page=True)

            # Wait for results — a non-empty paragraph in the results area
            results_appeared = False
            try:
                # Look for a paragraph or div that appears in the results section
                page.wait_for_selector(
                    "[class*='result'] p, [class*='answer'] p, "
                    "[class*='analysis'] p, [class*='synthesis'] p, "
                    "article p, .prose p, [class*='output'] p",
                    timeout=120000
                )
                results_appeared = True
            except Exception:
                # Fallback: wait and check for any substantial text block
                time.sleep(5)
                paragraphs = page.locator("p")
                for i in range(paragraphs.count()):
                    try:
                        text = paragraphs.nth(i).inner_text()
                        if len(text.strip()) > 50:
                            results_appeared = True
                            break
                    except Exception:
                        continue

        page.screenshot(path='/tmp/gw_analyze_03_results.png', full_page=True)

        # ── 7. Verify answer present ──────────────────────────────────────────
        print("\n[7] Verify results")
        answer_present = False
        if analyze_btn_visible:
            paragraphs = page.locator("p")
            for i in range(paragraphs.count()):
                try:
                    text = paragraphs.nth(i).inner_text().strip()
                    if len(text) > 50:
                        answer_present = True
                        break
                except Exception:
                    continue

        check("Analysis completed - answer present", answer_present)

        # ── 8. Verify quotes/attribution visible ──────────────────────────────
        # Look for italic text (often used for quotes), blockquotes, or patterns
        # like quoted text with a speaker name nearby
        quote_visible = (
            page.locator("blockquote").count() > 0
            or page.locator("em, i").count() > 0
            or page.locator("[class*='quote']").count() > 0
            or page.locator("[class*='attribution']").count() > 0
            or page.locator("[class*='speaker']").count() > 0
            # text matching "— Name" or "(Name)" attribution patterns
            or page.locator("text=/[—–-]\\s*\\w+/").count() > 0
        )
        check("Quotes/attribution visible", quote_visible)

        # ── Final screenshot ──────────────────────────────────────────────────
        page.screenshot(path='/tmp/gw_analyze_04_final.png', full_page=True)
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
    print(f"\nScreenshots: /tmp/gw_analyze_*.png")
    return passed == total


if __name__ == '__main__':
    success = run()
    sys.exit(0 if success else 1)
