"""pytest fixtures: one Playwright session for the whole run, one fresh browser context per test.

Defined here (not in a test module) so every module shares a single session fixture; a second
sync_playwright() in the same thread would fail with "Sync API inside the asyncio loop".
"""
import pytest
from playwright.sync_api import sync_playwright

from helpers import HTML


def pytest_addoption(parser):
    parser.addoption("--update-golden", action="store_true", default=False,
                     help="rewrite tests/golden/*.txt from the current build")


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def page(browser):
    ctx = browser.new_context()
    pg = ctx.new_page()
    problems = []
    pg.on("pageerror", lambda e: problems.append("pageerror: %s" % e))
    pg.on("console", lambda m: problems.append("console.%s: %s" % (m.type, m.text)) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(HTML.as_uri())
    pg.wait_for_function("typeof generate === 'function' && typeof recipes !== 'undefined'")
    pg.problems = problems
    yield pg
    ctx.close()
