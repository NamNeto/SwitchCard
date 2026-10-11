"""pytest fixtures: one Playwright session for the whole run, one fresh browser context per test.

Defined here (not in a test module) so every module shares a single session fixture; a second
sync_playwright() in the same thread would fail with "Sync API inside the asyncio loop".
"""
import os

import pytest
from playwright.sync_api import sync_playwright

from helpers import HTML, WIDE_FONTS_JS


def pytest_addoption(parser):
    parser.addoption("--update-golden", action="store_true", default=False,
                     help="rewrite tests/golden/*.txt from the current build")


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(channel=os.environ.get("SWITCHCARD_PW_CHANNEL") or None)
        yield b
        b.close()


def open_page(browser, wide_fonts=False):
    """A fresh context and page on SwitchCard.html, booted. wide_fonts (or the environment variable
    SWITCHCARD_FONT_SIM=wide for a whole run) swaps the UI and mono font stacks for wider faces
    before any page script runs, standing in for the Linux fonts (DejaVu/Liberation) that CI uses."""
    ctx = browser.new_context()
    if wide_fonts or os.environ.get("SWITCHCARD_FONT_SIM") == "wide":
        ctx.add_init_script(WIDE_FONTS_JS)
    pg = ctx.new_page()
    problems = []
    pg.on("pageerror", lambda e: problems.append("pageerror: %s" % e))
    pg.on("console", lambda m: problems.append("console.%s: %s" % (m.type, m.text)) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(HTML.as_uri())
    pg.wait_for_function(
        "typeof generate === 'function' && typeof recipes !== 'undefined' && (typeof bootDone === 'undefined' || bootDone === true)"
    )
    pg.problems = problems
    return ctx, pg


@pytest.fixture
def page(browser):
    ctx, pg = open_page(browser)
    yield pg
    ctx.close()


@pytest.fixture
def wide_page(browser):
    """The page with wider UI and mono fonts (see open_page): layout must hold with any font."""
    ctx, pg = open_page(browser, wide_fonts=True)
    yield pg
    ctx.close()
