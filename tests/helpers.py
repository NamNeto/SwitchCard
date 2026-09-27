"""Shared paths and the evaluate helper for the browser tests (fixtures live in conftest.py)."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = ROOT / "SwitchCard.html"
GOLDEN = ROOT / "tests" / "golden"


def ev(page, expr, *args):
    return page.evaluate(expr, *args)
