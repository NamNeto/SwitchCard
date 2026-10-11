"""Gauntlet round 12 (operator report ops-r7 and the focus-net review): the safety net rescues
only focus that died with its control (a menu closed by a scroll or a press elsewhere, a click on
empty space, a click on a row's number cell leave focus where the user put it, and the page never
jumps), the Cards Text-only ZIP needs no baseline (as Save text only), a bulk run does not
re-focus a row button on every card, and two status messages read right."""
from helpers import ev, click_dialog, stub_downloads, downloads

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _rows(page, n=40, w=1440):
    page.set_viewport_size({"width": w, "height": 900})
    ev(page, """([header, n]) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! tested');
        r.switches = countedUpRows(r, [], n).rows; renderAll(); showView('switches'); }""", [HEADER, n])
    page.wait_for_timeout(200)


def _state(page):
    return ev(page, "() => [document.activeElement.id || document.activeElement.tagName + '.' + document.activeElement.className, Math.round(scrollY)]")


def _open_menu_by_mouse(page, i):
    ev(page, "(i) => document.querySelectorAll('#swRows button.sw-more')[i].scrollIntoView({ block: 'center' })", i)
    page.wait_for_timeout(150)
    x, y = ev(page, "(i) => { const r = document.querySelectorAll('#swRows button.sw-more')[i].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }", i)
    page.mouse.click(x, y)
    page.wait_for_timeout(100)
    assert ev(page, "() => !!rowMenu && rowMenu.menu.contains(document.activeElement)")


# --- A2: a wheel scroll closes the menu; focus stays by the row and the page scrolls only as wheeled ---
def test_menu_closed_by_a_wheel_scroll_does_not_jump_the_page(page):
    _rows(page)
    _open_menu_by_mouse(page, 29)
    active0, y0 = _state(page)
    page.mouse.move(300, 600)
    page.mouse.wheel(0, 300)
    page.wait_for_timeout(400)
    active, y = _state(page)
    assert ev(page, "() => rowMenu === null")
    assert active != "viewTitle" and active == "BUTTON.sw-more", active
    assert y0 <= y <= y0 + 300, (y0, y)
    assert page.problems == []


# --- B: a mousedown on plain text (a row's number cell) closes the menu; nothing is pulled ---
def test_menu_closed_by_a_press_elsewhere_leaves_focus_alone(page):
    _rows(page)
    _open_menu_by_mouse(page, 29)
    _, y0 = _state(page)
    nx, ny = ev(page, "() => { const r = document.querieSelectorAll ? null : document.querySelectorAll('#swRows tr[data-row] td.num')[24].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
    page.mouse.move(nx, ny)
    page.mouse.down()
    page.wait_for_timeout(150)
    mid = _state(page)
    page.mouse.up()
    page.wait_for_timeout(200)
    end = _state(page)
    assert mid[0] != "viewTitle" and end[0] != "viewTitle", (mid, end)
    assert mid[1] == y0 and end[1] == y0, (y0, mid, end)
    assert page.problems == []


# --- C: a side-panel check has focus; a click on another row's number cell is a deliberate blur ---
def test_click_on_a_row_cell_does_not_push_focus_into_the_new_checks(page):
    _rows(page)
    ev(page, "() => { const r = current(); r.switches[2].values = { MGMT_IP: 'bad' }; renderSwitches(); selectSwitch(r.switches[2].id); }")
    page.wait_for_timeout(100)
    ev(page, "() => document.querySelector('#swChecks button.finding-link').focus()")
    nx, ny = ev(page, """() => { const t = document.querySelectorAll('#swRows tr[data-row] td.num')[20]; t.scrollIntoView({ block: 'center' });
        const r = t.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }""")
    page.wait_for_timeout(100)
    _, y0 = _state(page)
    page.mouse.click(nx, ny)
    page.wait_for_timeout(300)
    active, y = _state(page)
    assert active != "viewTitle" and not active.startswith("BUTTON.finding-link"), active
    assert ev(page, "() => !$('swChecks').contains(document.activeElement)")
    assert y == y0, (y0, y)
    # the row was selected all the same
    assert ev(page, "() => swSelectedId === current().switches[20].id")
    assert page.problems == []


# --- D: a status message replaced after the user clicked empty space does not take focus ---
def test_replaced_status_message_does_not_take_focus_after_a_deliberate_blur(page):
    _rows(page, 20)
    ev(page, "() => { message('first'); $('statusClose').focus(); window.scrollTo(0, 600); }")
    page.mouse.click(5, 450)
    page.wait_for_timeout(100)
    assert ev(page, "() => document.activeElement === document.body")
    y0 = ev(page, "() => Math.round(scrollY)")
    ev(page, "() => message('second, from a later action')")
    page.wait_for_timeout(150)
    assert ev(page, "() => document.activeElement === document.body")
    assert ev(page, "() => Math.round(scrollY)") == y0
    # a control that dies under the focus is still rescued, without a scroll
    ev(page, "() => { $('statusClose').focus(); window.scrollTo(0, 600); }")
    y1 = ev(page, "() => Math.round(scrollY)")
    ev(page, "() => message('third')")
    page.wait_for_timeout(100)
    assert ev(page, "() => document.activeElement.id") == "statusClose"
    assert ev(page, "() => Math.round(scrollY)") == y1
    assert page.problems == []


# --- I1: the Text-only ZIP needs no baseline; the card ZIPs still do ---
def _no_baseline(page, n=2):
    ev(page, """([header, n]) => { const r = current(); r.example = false; r.template = r.template.replace(header, '! Plant test template');
        baseline = null; r.switches = countedUpRows(r, [], n).rows; r.exports = {};
        renderAll(); renderPreview(); showView('cards'); }""", [HEADER, n])


def test_text_only_zip_needs_no_baseline(page):
    _no_baseline(page)
    assert page.is_disabled("#cdAll") and page.is_disabled("#cdChanged")
    assert page.is_enabled("#cdText")
    gate = page.inner_text("#cdGates")
    assert "Export blocked" in gate and "No firmware baseline" in gate
    assert "Text-only ZIP is still available" in gate
    assert "no baseline" in ev(page, "() => $('cdText').title") and "blocked" not in ev(page, "() => $('cdText').title")
    assert "Export blocked" in ev(page, "() => $('cdAll').title")
    assert page.locator("#cdRows button.cd-card").first.is_disabled()
    stub_downloads(page)
    page.click("#cdText")
    text = click_dialog(page, "Cancel")
    assert "Export text-only ZIP?" in text
    assert "Baseline fingerprint" in text and "(none)" in text
    assert "No baseline files are written" in text
    assert downloads(page) == []
    page.wait_for_function("() => !busy")
    page.click("#cdText")
    page.wait_for_selector("dialog[open]")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIP")
    page.wait_for_function("() => (window.__dl || []).length === 1")
    d = downloads(page)
    assert d[0]["name"].endswith("-text.zip")
    names = ev(page, """async (b64) => { const bin = atob(b64); const u = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        const files = await unzip(new Blob([u])); return files.map((f) => f.path); }""", d[0]["b64"])
    assert names == ["IE3100-DEMO-01/editcontent.txt", "IE3100-DEMO-02/editcontent.txt", "fleet-manifest.txt"]
    assert page.problems == []


def test_text_only_zip_keeps_the_other_gates(page):
    _no_baseline(page)
    # example recipe
    ev(page, "() => { current().example = true; renderCards(); }")
    assert page.is_disabled("#cdText")
    assert "Example recipe" in ev(page, "() => $('cdText').title")
    assert "still available" not in page.inner_text("#cdGates")
    # unapplied draft
    ev(page, "() => { current().example = false; editorPending = true; renderCards(); }")
    assert page.is_disabled("#cdText")
    ev(page, "() => { editorPending = false; renderCards(); }")
    assert page.is_enabled("#cdText")
    # a row with errors: the button stays on but the click refuses before any dialog
    ev(page, "() => { current().switches[1].values.MGMT_IP = '999.1.1.1'; renderCards(); }")
    assert "still available" not in page.inner_text("#cdGates")
    stub_downloads(page)
    page.click("#cdText")
    page.wait_for_function("() => $('status').textContent.includes('Rows with errors') && $('status').textContent.includes('nothing was exported')")
    assert ev(page, "() => !document.querySelector('dialog[open]')")
    assert downloads(page) == []
    # a baseline for another model blocks the cards, not the text
    ev(page, "() => { current().switches = countedUpRows(current(), [], 2).rows; baseline = { model: 'OTHER', version: 'x', files: [] }; renderCards(); }")
    assert page.is_disabled("#cdAll") and page.is_enabled("#cdText")
    assert "Text-only ZIP is still available" in page.inner_text("#cdGates")
    assert page.problems == []


# --- M1: a rebuild of the Cards table leaves a focused row button alone ---
def test_cards_rebuild_does_not_refocus_an_unchanged_row(page):
    ev(page, """([header, n]) => { const r = current(); r.example = false; r.template = r.template.replace(header, '! Plant test template');
        baseline = {model: r.model, version: 'x', files: [{path: 'a.bin', blob: new Blob(['x'])}]};
        r.switches = countedUpRows(r, [], n).rows; r.exports = {}; renderAll(); renderPreview(); showView('cards'); }""", [HEADER, 3])
    page.focus("#cdRows tr[data-row] button.cd-status")
    ev(page, "() => { window.__fi = 0; document.addEventListener('focusin', () => window.__fi++, true); window.__node = document.activeElement; }")
    ev(page, "() => { renderCards(); renderCards(); updateRail(); }")
    page.wait_for_timeout(100)
    assert ev(page, "() => [window.__fi, document.activeElement === window.__node, document.activeElement.isConnected]") == [0, True, True]
    # a row that changed is swapped, and focus on it comes back once
    ev(page, "() => { recordExport(current(), current().switches[0].values.HOSTNAME || current().values.HOSTNAME, 'x'); renderCards(); }")
    page.wait_for_timeout(100)
    assert ev(page, "() => [document.activeElement.className.split(' ')[0], document.activeElement.closest('tr') === $('cdRows').querySelector('tr[data-row]')]") == ["cd-status", True]
    assert page.problems == []


# --- M9: Apply that keeps every port by name says nothing about the port table ---
def test_apply_without_a_remap_does_not_mention_the_port_table(page):
    ev(page, "() => showView('manage')")
    ev(page, "() => { $('template').value = $('template').value + '\\n! note\\n'; $('template').dispatchEvent(new Event('input', { bubbles: true })); }")
    page.wait_for_function("() => editorPending === true")
    page.click("#applyRecipe")
    page.wait_for_function("() => $('status').textContent.includes('Recipe applied')")
    assert "remapped" not in page.inner_text("#status")
    assert page.problems == []
