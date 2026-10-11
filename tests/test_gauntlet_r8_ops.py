"""Gauntlet round 8 (operator report ops-r3): focus after the boot dialog, the dialog kit without
showModal (the veil, the Tab and Esc trap, aria-modal), autosave on Ports Done and on the way out
of the page, and the minor fixes (import status, example-header gate name, wording, focus rings,
the links around the switch grid)."""
from helpers import ev, click_dialog

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _seed_old_autosave(page, name="Seeded recipe"):
    ev(page, """(name) => { const p = JSON.parse(JSON.stringify(projectPayload())); p.recipes[0].name = name;
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ format: CONFIG.AUTOSAVE_FORMAT, release: '0.7.3',
          savedAt: new Date().toISOString(), project: p, draft: null })); }""", name)


def _real(page, n=3):
    return ev(page, """([n, header]) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Plant test template');
        r.switches = n ? countedUpRows(r, [], n).rows : []; renderAll(); renderPreview(); return r.switches.map((x) => x.id); }""", [n, HEADER])


# --- I1: focus after the boot dialog lands on the recipe picker, for every choice ---
def test_boot_dialog_leaves_focus_on_the_recipe_picker(page):
    for how in ("Escape", "Start with the examples", "Restore it"):
        _seed_old_autosave(page)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("dialog[open]")
        if how == "Escape":
            page.keyboard.press("Escape")
        else:
            click_dialog(page, how)
        page.wait_for_function("bootDone === true")
        assert ev(page, "() => document.activeElement.id") == "recipe", how
        page.keyboard.press("Tab")
        assert ev(page, "() => document.activeElement.id") == "setup", how
    assert page.problems == []


# --- the dialog kit: no showModal, but a veil, a Tab and Esc trap and aria-modal ---
def test_dialog_has_a_veil_traps_tab_and_closes_on_esc(page):
    ev(page, "() => { window.__r = null; confirmDialog('Trap?', 'Body text.').then((v) => { window.__r = v; }); }")
    page.wait_for_selector("dialog[open]")
    assert ev(page, "() => document.querySelector('dialog[open]').getAttribute('aria-modal')") == "true"
    assert ev(page, "() => { const v = document.querySelector('.dlg-veil'); return v && v.nextElementSibling === document.querySelector('dialog[open]'); }")
    assert ev(page, "() => getComputedStyle(document.querySelector('dialog[open]')).position") == "fixed"
    # Focus pushed behind the veil comes back; Tab from anywhere stays inside.
    ev(page, "() => $('railBuild').focus()")
    page.wait_for_function("() => !!document.activeElement.closest('dialog[open]')")
    for _ in range(5):
        page.keyboard.press("Tab")
        assert ev(page, "() => !!document.activeElement.closest('dialog[open]')")
    page.keyboard.press("Escape")
    page.wait_for_function("() => window.__r === false")
    assert ev(page, "() => !document.querySelector('dialog') && !document.querySelector('.dlg-veil')")
    assert page.problems == []


# --- M1: Done writes the autosave at once; a pending autosave is written when the page unloads ---
def test_ports_done_autosaves_at_once_and_unload_flushes_a_pending_autosave(page):
    ids = _real(page, 2)
    ev(page, "() => showView('switches')")
    page.click("#swRows tr[data-row='%s'] button.sw-ports" % ids[1])
    page.locator("dialog[open] input[data-attr=description]").first.fill("Robot cell 9")
    click_dialog(page, "Done")
    page.wait_for_function("() => !document.querySelector('dialog[open]')")
    assert "Robot cell 9" in ev(page, "() => localStorage.getItem(AUTOSAVE_KEY) || ''")
    # A cell edit followed at once by a reload (within the 400 ms debounce) survives.
    page.fill("#swRows tr[data-row='%s'] input[data-key='SITE']" % ids[0], "Hall 7")
    page.keyboard.press("Tab")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function("bootDone === true")
    assert ev(page, "(id) => (current().switches.find((x) => x.id === id) || {}).values.SITE", ids[0]) == "Hall 7"
    assert page.problems == []


# --- M7: the import status names the rows that arrived with errors ---
def test_import_status_names_error_rows(page):
    _real(page, 0)
    ev(page, "() => showView('switches')")
    page.click("#swImport")
    page.wait_for_selector("dialog[open] textarea")
    page.fill("dialog[open] textarea", "HOSTNAME,MGMT_IP\nSW-A,10.20.30.300\nSW-B,10.20.30.12\nSW-B,10.20.30.13\n")
    click_dialog(page, "Add to the list")
    page.wait_for_function("() => $('status').textContent.includes('Imported 3 switches')")
    status = ev(page, "() => $('status').textContent")
    assert "3 have errors (rows 1, 2, 3)" in status and "Status column" in status, status
    assert page.problems == []


# --- M5: the example header is named as such in the gate and after Apply ---
def test_example_header_is_named_in_the_gate_and_the_apply_status(page):
    ev(page, "() => showView('manage')")
    page.click("#duplicate")
    page.wait_for_timeout(200)
    page.uncheck("#exampleFlag")
    page.click("#applyRecipe")
    page.wait_for_function("() => $('status').textContent.includes('Recipe applied')")
    assert "example header line, which blocks export" in ev(page, "() => $('status').textContent")
    ev(page, "() => showView('build')")
    # round 12: the checks box names the error with its jump; the gate line only counts it
    assert "example header" in page.inner_text("#checks") and "1 error above" in page.inner_text("#exportWhy")
    assert page.problems == []


# --- M6: the draft is called a recipe draft ---
def test_save_with_draft_dialog_says_recipe_draft(page):
    ev(page, "() => showView('manage')")
    page.click("#template")
    page.keyboard.press("Control+End")
    page.keyboard.type("\n! draft")
    page.wait_for_function("() => editorPending === true")
    ev(page, "() => { const s = $('saveProject').closest('details'); if (s) s.open = true; }")
    page.click("#saveProjectDraft")
    text = click_dialog(page, "Cancel")
    assert "unapplied recipe draft" in text and "Maintain" not in text
    assert page.problems == []


# --- M2 / M3: keyboard focus draws a solid 2 px ring; the file button shows it for its input ---
def test_focus_rings_are_solid(page):
    page.focus("#railBuild")
    page.keyboard.press("Tab")
    assert ev(page, "() => document.activeElement.id") == "railSwitches"
    assert ev(page, "() => getComputedStyle($('railSwitches')).outlineStyle") == "solid"
    assert ev(page, "() => parseFloat(getComputedStyle($('railSwitches')).outlineWidth)") >= 2
    ev(page, "() => { const s = $('saveProject').closest('details'); if (s) s.open = true; $('projectInput').focus(); }")
    lab = ev(page, "() => { const l = $('projectInput').closest('label'); const cs = getComputedStyle(l); return cs.outlineStyle + ' ' + cs.outlineWidth; }")
    assert lab.startswith("solid") and float(lab.split()[1].replace("px", "")) >= 2, lab
    assert page.problems == []


# --- M9: links around the switch grid skip the cells ---
def test_skip_links_jump_past_and_back_over_the_grid(page):
    _real(page, 8)
    ev(page, "() => showView('switches')")
    links = page.locator("#switches a.skip-grid")
    assert links.count() == 2
    ev(page, "() => document.querySelectorAll('#switches a.skip-grid')[0].focus()")
    assert ev(page, "() => getComputedStyle(document.activeElement).position") == "static"
    page.keyboard.press("Enter")
    page.wait_for_function("() => document.activeElement.id === 'swPanelTitle'")
    ev(page, "() => document.querySelectorAll('#switches a.skip-grid')[1].focus()")
    page.keyboard.press("Enter")
    page.wait_for_function("() => document.activeElement.id === 'swAdd'")
    assert page.problems == []


# --- scale: a hidden Switches grid is left alone by run(), and a long export table is chunked ---
def test_run_leaves_the_hidden_grid_alone_and_the_bulk_table_fills_in_chunks(page):
    ids = _real(page, 60)
    ev(page, "() => { baseline = { model: current().model, version: 'x', files: [{ path: 'a.bin', blob: new Blob(['x']) }], fingerprint: null, compare: null }; renderAll(); renderPreview(); showView('cards'); }")
    page.click("#cdAll")
    page.wait_for_selector("dialog[open] input[type=checkbox]")
    assert ev(page, "() => [...document.querySelectorAll('#swRows input')].some((i) => i.disabled)") is False
    assert ev(page, "() => $('cdAll').disabled") is True
    page.wait_for_function("() => document.querySelectorAll('dialog[open] table.dlg-rows tbody tr').length === 60")
    click_dialog(page, "Cancel")
    page.wait_for_function("() => !document.querySelector('dialog[open]') && !$('cdAll').disabled")
    assert len(ids) == 60
    assert page.problems == []
