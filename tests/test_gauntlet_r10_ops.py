"""Gauntlet round 10 (operator report ops-r5): Save text only goes through the write dialog (review
tick, fingerprint verdict, same gates), focus after opening a project that carries a draft, the
bulk status that names where a recipe-level fix is, and the status after a cancelled import."""
from helpers import ev, click_dialog, stub_downloads, downloads

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _take_over(page, differs=True, with_baseline=True):
    return ev(page, """([header, differs, withBaseline]) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Plant test template');
        const fp = (d, s) => ({ fileCount: 1, totalBytes: 1, digest: d.repeat(64), files: [{ path: 'a.bin', size: 1, sha256: s.repeat(64) }] });
        baselineExpected = withBaseline ? { model: r.model, version: 'x', fingerprint: fp('c', 'd') } : null;
        baseline = withBaseline ? { model: r.model, version: 'x', files: [{ path: 'a.bin', blob: new Blob(['x']) }],
          fingerprint: differs ? fp('a', 'b') : fp('c', 'd') } : null;
        if (baseline) baseline.compare = compareFingerprints(baselineExpected.fingerprint, baseline.fingerprint);
        renderAll(); renderPreview(); }""", [HEADER, differs, with_baseline])


# --- D1: Save text only opens the same write dialog as the card exports ---
def test_save_text_only_needs_the_review_tick_and_shows_the_fingerprint_verdict(page):
    _take_over(page, differs=True)
    stub_downloads(page)
    page.click("#downloadConfig")
    page.wait_for_selector("dialog[open] input[type=checkbox]")
    d = page.locator("dialog[open]")
    text = d.inner_text()
    assert ev(page, "() => document.querySelector('dialog[open] h2').textContent") == "Save text only?"
    assert "What goes in editcontent.txt" in text
    assert "Review: Baseline fingerprint DIFFERS from the project's recorded baseline (1 changed, 0 added, 0 missing)" in text
    assert "Baseline fingerprint\taaaaaaaaaaaaaaaa… DIFFERS from the project's recorded baseline" in text
    assert "No baseline files are written" in text
    sha = ev(page, "() => sha256Hex(generate(current()).text)")
    assert sha in text
    # Download text is off until the box is ticked; Esc cancels with no download
    primary = d.locator(".dialog-actions button.primary")
    assert primary.inner_text() == "Download text" and primary.is_disabled()
    assert ev(page, "() => document.activeElement === document.querySelector('dialog[open] input[type=checkbox]')")
    page.keyboard.press("Escape")
    page.wait_for_selector("dialog[open]", state="detached")
    assert page.inner_text("#status").startswith("Save text only cancelled.")
    assert downloads(page) == []
    assert ev(page, "() => document.activeElement.id") == "downloadConfig"
    # ticked: the download is the preview text, byte for byte
    page.click("#downloadConfig")
    page.wait_for_selector("dialog[open] input[type=checkbox]")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download text")
    page.wait_for_selector("dialog[open]", state="detached")
    dl = downloads(page)
    assert [x["name"] for x in dl] == ["editcontent.txt"]
    assert dl[0]["text"] == ev(page, "() => $('preview').textContent")
    assert page.inner_text("#status").startswith("Text exported as editcontent.txt")
    assert page.problems == []


def test_save_text_only_without_a_baseline_says_none_and_keeps_its_gates(page):
    _take_over(page, with_baseline=False)
    stub_downloads(page)
    assert page.is_enabled("#downloadConfig") and page.is_disabled("#downloadCard")
    page.click("#downloadConfig")
    text = click_dialog(page, "Cancel")
    assert "Baseline\t(none)" in text and "DIFFERS" not in text and "Review:" not in text
    page.wait_for_selector("dialog[open]", state="detached")
    # a team-policy hit still blocks before any dialog
    ev(page, "() => { teamPolicies = ['forbid ^hostname']; renderPreview(); }")
    assert page.is_disabled("#downloadConfig")
    ev(page, "() => $('downloadConfig').onclick()")
    page.wait_for_function("() => $('status').textContent.startsWith('Team policy blocks this text')")
    assert ev(page, "() => document.querySelectorAll('dialog[open]').length") == 0
    assert downloads(page) == []
    assert page.problems == []


# --- D2 (and D6): a restored draft starts on Apply recipe changes, which is in view ---
def test_opening_a_project_with_a_draft_focuses_apply(page):
    ev(page, r"""() => { const t = $('template'); t.value = t.value + '\n! draft line'; t.dispatchEvent(new Event('input', { bubbles: true })); }""")
    wrapper = ev(page, "() => JSON.stringify(autosavePayload())")
    ev(page, "() => $('discardDraft').click()")
    click_dialog(page, "Discard")
    page.wait_for_function("() => editorPending === false")
    ev(page, "() => showView('build')")
    page.set_input_files("#projectInput", {"name": "p.json", "mimeType": "application/json", "buffer": wrapper.encode()})
    if page.locator("dialog[open]").count() or page.wait_for_timeout(200) or page.locator("dialog[open]").count():
        click_dialog(page, "Open and replace")
    page.wait_for_function("() => editorPending === true && currentView === 'manage' && !busy")
    page.wait_for_function("() => document.activeElement && document.activeElement.id === 'applyRecipe'")
    box = ev(page, "() => { const b = document.activeElement.getBoundingClientRect(); return [b.top >= 0, b.bottom <= window.innerHeight]; }")
    assert box == [True, True]
    assert ev(page, "() => editorPending") is True  # nothing was applied by the focus
    assert page.problems == []


# --- D4: the bulk status says where a recipe-level problem is fixed ---
def test_bulk_status_points_at_manage_for_the_example_header(page):
    ev(page, """() => { const r = current(); r.example = false;
        baseline = { model: r.model, version: 'x', files: [{ path: 'a.bin', blob: new Blob(['x']) }] };
        r.switches = countedUpRows(r, [], 2).rows; r.exports = {}; renderAll(); renderPreview(); showView('cards'); }""")
    stub_downloads(page)
    page.click("#cdAll")
    page.wait_for_function("() => $('status').textContent.includes('nothing was exported')")
    assert ev(page, "() => $('status').textContent") == (
        "Rows with errors: 1, 2 (template still contains the example header). "
        "Fix the recipe in Manage recipes & baseline; nothing was exported.")
    assert downloads(page) == []
    assert page.problems == []


# --- D11: a cancelled import says so ---
def test_cancelled_import_says_the_list_is_unchanged(page):
    ev(page, """(h) => { const r = current(); r.example = false; r.template = r.template.replace(h, '! Plant test');
        r.switches = countedUpRows(r, [], 2).rows; renderAll(); showView('switches'); message('Imported 2 switches.'); }""", HEADER)
    page.click("#swImport")
    page.wait_for_selector("dialog[open] textarea")
    page.keyboard.press("Escape")
    page.wait_for_selector("dialog[open]", state="detached")
    assert ev(page, "() => $('status').textContent").startswith("Import cancelled; the switch list is unchanged.")
    assert ev(page, "() => current().switches.length") == 2
    assert page.problems == []
