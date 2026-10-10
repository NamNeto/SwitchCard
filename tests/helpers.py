"""Shared paths and the evaluate helper for the browser tests (fixtures live in conftest.py)."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = ROOT / "SwitchCard.html"
GOLDEN = ROOT / "tests" / "golden"


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
