"""Shared paths and the evaluate helper for the browser tests (fixtures live in conftest.py)."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = ROOT / "SwitchCard.html"
GOLDEN = ROOT / "tests" / "golden"

# Wider faces than Segoe UI / Consolas, present on Windows, standing in for the DejaVu Sans /
# DejaVu Sans Mono metrics a Linux browser uses. Set as inline custom properties on <html> as soon
# as the element exists (CSSOM writes are not subject to the page's style-src CSP), so they win
# over the :root declarations in the page's stylesheet before any page script measures anything.
WIDE_FONTS_JS = """(() => {
  const apply = () => {
    const h = document.documentElement;
    if (!h) return false;
    h.style.setProperty('--font', 'Verdana, "DejaVu Sans", sans-serif');
    h.style.setProperty('--mono', '"Lucida Console", "DejaVu Sans Mono", monospace');
    return true;
  };
  if (!apply()) {
    const mo = new MutationObserver(() => { if (apply()) mo.disconnect(); });
    mo.observe(document, { childList: true });
  }
})();"""


def ev(page, expr, *args):
    return page.evaluate(expr, *args)


def click_dialog(page, label):
    """Wait for an open in-page <dialog>, click its action button whose text is exactly `label`,
    and return the dialog's text as it was before the click."""
    page.wait_for_selector("dialog[open]")
    dlg = page.locator("dialog[open]").first
    text = dlg.inner_text()
    for btn in dlg.locator(".dialog-actions button").all():
        if btn.inner_text().strip() == label:
            btn.click()
            return text
    raise AssertionError("no dialog button named %r" % label)


def stub_downloads(page):
    """Replace the page's global download(blob, name) with a recorder. Each call appends to
    window.__dl: {name, text} for text files, {name, size, b64} for .zip files. Blob reads are
    async; downloads() waits for them."""
    page.evaluate("""() => {
      window.__dl = [];
      window.__dlPending = [];
      download = (blob, name) => {
        const rec = { name };
        window.__dl.push(rec);
        window.__dlPending.push(
          name.endsWith(".zip")
            ? blob.arrayBuffer().then((buf) => {
                const bytes = new Uint8Array(buf);
                let bin = "";
                for (let i = 0; i < bytes.length; i += 0x8000)
                  bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
                rec.size = bytes.length;
                rec.b64 = btoa(bin);
              })
            : blob.text().then((t) => { rec.text = t; })
        );
      };
    }""")


def downloads(page):
    """Return the recorded downloads (see stub_downloads), after all pending Blob reads finish."""
    return page.evaluate("async () => { await Promise.all(window.__dlPending || []); return window.__dl || []; }")


# The Switches grid against its scrolling box: how far the table runs past the box, whether the
# last row's "⋯" is inside the box, and whether the sideways-scroll affordance (the hint above
# the box and the right-edge fade) is showing.
GRID_FIT = """() => { const t = $('swTable'); const box = t.closest('.scroll') || t.parentElement;
    const mores = [...t.querySelectorAll('button.sw-more')];
    const more = mores.length ? mores.pop().getBoundingClientRect() : null;
    const hint = box.parentElement.querySelector(':scope > .scroll-hint');
    return { tableOver: t.getBoundingClientRect().width - box.clientWidth,
      moreIn: !!more && more.right <= box.getBoundingClientRect().right - 1,
      hint: !!hint && !hint.hidden && getComputedStyle(hint).visibility === 'visible' && hint.getBoundingClientRect().height > 0,
      fade: box.classList.contains('more-right') }; }"""


def assert_grid_fits_or_says_more(m):
    """The intent behind "the grid fits its card": either the whole row (its "⋯" included) is in
    the box, or the box overflows and says so (the hint and the right-edge fade) so nothing is cut
    off silently. A font, zoom or window may push it either way; it must never be neither."""
    if m["tableOver"] <= 0.5:
        assert m["moreIn"], m
    else:
        assert m["hint"] and m["fade"], m
