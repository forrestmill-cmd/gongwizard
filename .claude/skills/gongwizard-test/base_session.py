"""
GongWizard Playwright test helper.

Handles site gate + Gong session injection so any test script
can reach /calls without going through the connect flow.

Usage:
    from base_session import setup_page, SKILL_DIR

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()
        setup_page(page)   # handles gate + session injection
        page.goto('http://localhost:3000/calls')
        page.wait_for_load_state('networkidle')
        # ... your test logic ...
        browser.close()
"""

import os
import base64
import json
from pathlib import Path

# Absolute paths — works regardless of cwd
SKILL_DIR = Path(__file__).parent
PROJECT_DIR = SKILL_DIR.parent.parent.parent  # .../gongwizard/
ENV_FILE = PROJECT_DIR / '.env.local'

BASE_URL = os.environ.get('BASE_URL', 'http://localhost:3000')
GONG_BASE_URL = 'https://us-11211.api.gong.io'
SITE_PASSWORD = 'RingMyBell'


def read_env(path: Path) -> dict:
    """Parse a .env.local file into a dict."""
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, _, v = line.partition('=')
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def get_session_data(env_path: Path = ENV_FILE) -> dict:
    """
    Read Gong dev credentials from .env.local and return a
    gongwizard_session dict ready for sessionStorage injection.

    Returns:
        {
            "authHeader": "<base64(accessKey:secretKey)>",
            "baseUrl": "https://us-11211.api.gong.io",
            "internalDomains": [],
        }
    """
    env = read_env(env_path)
    access_key = env.get('GONG_DEV_ACCESS_KEY', '')
    secret_key = env.get('GONG_DEV_SECRET_KEY', '')

    if not access_key or not secret_key:
        raise RuntimeError(
            f"Missing GONG_DEV_ACCESS_KEY or GONG_DEV_SECRET_KEY in {env_path}\n"
            "These are the dev Gong API credentials. Check .env.local."
        )

    auth_header = base64.b64encode(f"{access_key}:{secret_key}".encode()).decode()
    return {
        "authHeader": auth_header,
        "baseUrl": GONG_BASE_URL,
        "internalDomains": [],
    }


def pass_gate(page, base_url: str = BASE_URL) -> None:
    """
    Navigate to /gate and enter the site password if the password
    input is present. Safe to call even if already past the gate.
    """
    page.goto(f'{base_url}/gate')
    page.wait_for_load_state('networkidle')
    pw_input = page.locator('input[type="password"]')
    if pw_input.count() > 0 and pw_input.first.is_visible():
        pw_input.first.fill(SITE_PASSWORD)
        page.keyboard.press('Enter')
        page.wait_for_load_state('networkidle')


def inject_session(page, base_url: str = BASE_URL, env_path: Path = ENV_FILE) -> None:
    """
    Inject the Gong session into sessionStorage on the app origin.
    Must be called after the page is on the app origin (not /gate redirect).
    """
    session_data = get_session_data(env_path)
    page.goto(base_url)
    page.wait_for_load_state('networkidle')
    page.evaluate(
        f"() => sessionStorage.setItem('gongwizard_session', JSON.stringify({json.dumps(session_data)}))"
    )


def setup_page(page, base_url: str = BASE_URL, env_path: Path = ENV_FILE) -> None:
    """
    Full setup: pass site gate + inject Gong session.
    After this call, navigate to any /calls page without being
    redirected to the connect screen.

    Example:
        setup_page(page)
        page.goto('http://localhost:3000/calls')
        page.wait_for_load_state('networkidle')
    """
    pass_gate(page, base_url)
    inject_session(page, base_url, env_path)
