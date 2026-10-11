"""Gauntlet round 9 (operator report ops-r4 and the round-8 dialog review): a row's actions from
the keyboard (the Row actions menu), the page behind a dialog hidden from assistive technology
and deaf to activation, internal view changes inside run() (a project with a draft opens in
Manage), Esc during IME composition, focus back to the last control, the bulk dialog's Download
waiting for the last table chunk, the dialog focus ring and the status line."""
from helpers import ev, click_dialog

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _real(page, n=3):
    return ev(page, """([n, header]) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Plant test template');
        r.switches = n ? countedUpRows(r, [], n).rows : []; renderAll(); renderPreview(); return r.switches.map((x) => x.id); }""", [n, HEADER])


def _tab_until(page, js, limit):
    for i in range(1, limit + 1):
        page.keyboard.press("Tab")
        if ev(page, "() => { const a = document.activeElement; return !!(%s); }" % js):
            return i
    raise AssertionError("not reached in %d Tabs: %s" % (limit, js))


# --- I1: from a focused row the keyboard reaches that row's Copy below and Remove in a few keys,
#         and the action applies to that row ---
def test_keyboard_row_actions_act_on_the_focused_row(page):
    ids = _real(page, 8)
    ev(page, "() => showView('switches')")
    page.focus("#swRows input[aria-label='Hostname, switch 6']")
    n = _tab_until(page, "a.matches('button.sw-more') && a.closest('tr').dataset.row === '%s'" % ids[5], 12)
    assert n <= 10
    assert ev(page, "() => $('swPanelTitle').textContent").startswith("Switch 6")
    page.keyboard.press("Enter")
    page.wait_for_selector(".sw-row-menu [role=menuitem]")
    assert ev(page, "() => document.activeElement.textContent") == "Copy below"
    page.keyboard.press("Enter")
    page.wait_for_function("() => current().switches.length === 9")
    rows = ev(page, "() => current().switches")
    assert rows[6]["values"] == rows[5]["values"]
    assert "Copied switch 6" in page.inner_text("#status")
    assert ev(page, "() => document.activeElement.getAttribute('aria-label')") == "Hostname, switch 7"
    # Shift+F10 from a cell opens the same menu; Remove names row 6, Esc keeps it and the status says so
    page.focus("#swRows input[aria-label='Site, switch 6']")
    page.keyboard.press("Shift+F10")
    page.wait_for_selector(".sw-row-menu")
    page.keyboard.press("ArrowDown")
    assert ev(page, "() => document.activeElement.textContent") == "Remove"
    page.keyboard.press("Enter")
    text = click_dialog(page, "Cancel")
    assert "Remove switch 6 (" in text
    page.wait_for_selector("dialog[open]", state="detached")
    assert ev(page, "() => current().switches.length") == 9
    assert page.inner_text("#status").startswith("Remove cancelled; switch 6")
    assert ev(page, "() => document.activeElement.className") == "sw-more"
    # Esc on the menu closes it and puts focus back on the button; the panel's buttons name the row
    page.keyboard.press("Enter")
    page.wait_for_selector(".sw-row-menu")
    page.keyboard.press("Escape")
    assert ev(page, "() => !document.querySelector('.sw-row-menu') && document.activeElement.className === 'sw-more'")
    assert ev(page, "() => [$('swCopyRow').title, $('swRemoveRow').title]") == ["Copy switch 6 below itself", "Remove switch 6 (" + rows[5]["values"]["HOSTNAME"] + ")"]
    # the button is drawn only on the selected (focused) or hovered row: no extra tab stop elsewhere
    page.mouse.move(0, 0)
    assert ev(page, "() => [...document.querySelectorAll('#swRows button.sw-more')].filter((b) => getComputedStyle(b).visibility === 'visible').length") == 1
    assert page.problems == []


# --- review I1: the page behind a dialog is hidden from assistive technology and ignores activation ---
def test_dialog_hides_the_page_and_swallows_background_activation(page):
    ev(page, "() => { window.__r = null; confirmDialog('Hidden?', 'Body text.').then((v) => { window.__r = v; }); }")
    page.wait_for_selector("dialog[open]")
    assert ev(page, "() => [...document.body.children].filter((n) => !n.matches('dialog, .dlg-veil')).every((n) => n.getAttribute('aria-hidden') === 'true')")
    assert ev(page, "() => { const d = document.querySelector('dialog[open]'); return d.getAttribute('aria-labelledby') === d.querySelector('h2').id && !!d.querySelector('h2').id; }")
    assert page.get_by_role("button", name="Switches").count() == 0
    assert page.get_by_role("dialog", name="Hidden?").count() == 1
    # a synthetic click (voice control, a script) on a background control does nothing
    ev(page, "() => $('railSwitches').click()")
    assert ev(page, "() => currentView") == "build"
    assert ev(page, "() => !!document.querySelector('dialog[open]')")
    # Esc that ends an IME composition is not a cancel
    ev(page, "() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true }))")
    assert ev(page, "() => !!document.querySelector('dialog[open]') && window.__r === null")
    # focus pushed behind the veil comes back to the control that last had it, not the first one
    ev(page, "() => document.querySelector('dialog[open] .dialog-actions button.primary').focus()")
    ev(page, "() => $('railBuild').focus()")
    page.wait_for_function("() => document.activeElement.matches('dialog[open] .dialog-actions button.primary')")
    # the focused control shows a ring even though nothing was pressed on the keyboard
    assert ev(page, "() => getComputedStyle(document.activeElement).outlineStyle") == "solid"
    page.keyboard.press("Escape")
    page.wait_for_function("() => window.__r === false")
    assert ev(page, "() => [...document.body.children].every((n) => !n.hasAttribute('aria-hidden'))")
    assert page.get_by_role("button", name="Switches").count() == 1
    assert page.problems == []


# --- review I2: a project that carries an unapplied draft opens in Manage (inside run()) ---
def test_open_project_with_a_draft_lands_in_manage(page):
    ev(page, r"""() => { const t = $('template'); t.value = t.value + '\n! draft line'; t.dispatchEvent(new Event('input', { bubbles: true })); }""")
    assert ev(page, "() => editorPending") is True
    wrapper = ev(page, "() => JSON.stringify(autosavePayload())")
    ev(page, "() => $('discardDraft').click()")
    click_dialog(page, "Discard")
    page.wait_for_function("() => editorPending === false")
    ev(page, "() => showView('cards')")
    page.set_input_files("#projectInput", {"name": "p.json", "mimeType": "application/json", "buffer": wrapper.encode()})
    if page.locator("dialog[open]").count() or page.wait_for_timeout(200) or page.locator("dialog[open]").count():
        click_dialog(page, "Open and replace")
    page.wait_for_function("() => editorPending === true && currentView === 'manage'")
    assert "! draft line" in ev(page, "() => $('template').value")
    assert ev(page, "() => !$('maintain').hidden && $('cards').hidden")
    assert "draft restored" in page.inner_text("#status")
    assert page.problems == []


# --- review minor: the bulk dialog's Download waits for the last table chunk ---
def test_bulk_dialog_download_waits_for_the_whole_table(page):
    _real(page, 60)
    ev(page, "() => { baseline = { model: current().model, version: 'x', files: [{ path: 'a.bin', blob: new Blob(['x']) }], fingerprint: null, compare: null }; renderAll(); renderPreview(); showView('cards'); }")
    ev(page, """() => { window.__seen = null;
        new MutationObserver((muts, mo) => { const d = document.querySelector('dialog[open] table.dlg-rows'); if (!d) return;
          const dlg = d.closest('dialog'); const c = dlg.querySelector('input[type=checkbox]'); c.click();
          window.__seen = { rows: d.querySelectorAll('tbody tr').length, busy: d.getAttribute('aria-busy'),
            disabled: dlg.querySelector('.dialog-actions button.primary').disabled, ticked: c.checked }; mo.disconnect(); })
          .observe(document.body, { childList: true, subtree: true }); }""")
    page.click("#cdAll")
    page.wait_for_function("() => document.querySelectorAll('dialog[open] table.dlg-rows tbody tr').length === 60")
    seen = ev(page, "() => window.__seen")
    assert seen == {"rows": 40, "busy": "true", "disabled": True, "ticked": True}, seen
    page.wait_for_function("() => !document.querySelector('dialog[open] table.dlg-rows').hasAttribute('aria-busy') && !document.querySelector('dialog[open] .dialog-actions button.primary').disabled")
    click_dialog(page, "Cancel")
    page.wait_for_selector("dialog[open]", state="detached")
    assert page.problems == []


# --- ops M4: a status line from another view goes when the view changes ---
def test_status_clears_on_view_change_and_cancel_says_so(page):
    _real(page, 2)
    ev(page, "() => { message('Old news.'); showView('switches'); }")
    assert ev(page, "() => $('status').hidden") is True
    ev(page, "() => $('swRemoveAll').click()")
    click_dialog(page, "Cancel")
    page.wait_for_function("() => $('status').textContent.startsWith('Remove all cancelled')")
    assert ev(page, "() => current().switches.length") == 2
    assert page.problems == []


# --- the remembered control is a control: the Ports dialog (whose body the browser focuses first)
#     still lands on its first field ---
def test_ports_dialog_opened_by_click_focuses_its_first_field(page):
    ids = _real(page, 2)
    ev(page, "() => showView('switches')")
    page.locator("#swRows tr[data-row='%s'] button.sw-ports" % ids[1]).click()
    page.wait_for_selector("dialog[open]")
    page.wait_for_function("() => document.activeElement.matches('dialog[open] select[data-attr=role]')")
    page.keyboard.press("Escape")
    page.wait_for_selector("dialog[open]", state="detached")
    assert page.problems == []
