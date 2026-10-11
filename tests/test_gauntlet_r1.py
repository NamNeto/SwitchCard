"""Gauntlet round 1 (operator report r0): duplicates on both rows, the example header, focus after
actions, bulk export progress and stop, decode locations, errors first, and the minor fixes."""
import re
from helpers import ev, click_dialog, stub_downloads, downloads

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _take_over(page, n=3):
    """A non-example copy of the first example (its header replaced), a synthetic baseline and n
    counted-up switches. Returns the switch ids."""
    return ev(page, """([n, header]) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Plant test template');
        baseline = {model: r.model, version: 'x', files: [{path: 'a.bin', blob: new Blob(['x'])}]};
        r.switches = countedUpRows(r, [], n).rows; r.exports = {};
        renderAll(); renderPreview(); return r.switches.map((x) => x.id); }""", [n, HEADER])


def _sw_input(row_id, key):
    return '#swRows input[data-row="%s"][data-key="%s"]' % (row_id, key)


def _cd(row_id, sel):
    return "#cdRows tr[data-row='%s'] %s" % (row_id, sel)


# --- C1: a duplicate flags both rows ---
def test_typo_duplicating_another_rows_ip_blocks_both_rows(page):
    ids = _take_over(page, 3)
    ip3 = ev(page, "() => checkSwitchRows(current(), current().switches).rows[2].ip")
    ev(page, "() => showView('switches')")
    # the operator's case: row 2's management IP typed as row 3's
    page.fill(_sw_input(ids[1], "MGMT_IP"), ip3)
    page.keyboard.press("Tab")
    res = ev(page, "() => checkSwitchRows(current(), current().switches).rows.map((x) => x.errors)")
    assert "duplicate MGMT_IP (also row 3)" in res[1]
    assert "duplicate MGMT_IP (also row 2)" in res[2]
    assert res[0] == []
    for i in (1, 2):
        assert ev(page, "(s) => document.querySelector(s).textContent", "#swRows tr[data-row='%s'] td.status" % ids[i]) == "1 error"
    ev(page, "() => showView('cards')")
    assert page.is_disabled(_cd(ids[1], "button.cd-card"))
    assert page.is_disabled(_cd(ids[2], "button.cd-card"))
    assert page.is_enabled(_cd(ids[0], "button.cd-card"))
    assert "Rows with errors: 2, 3." in page.inner_text("#cdGates")
    stub_downloads(page)
    page.click(_cd(ids[1], "button.cd-card"), force=True)  # disabled: nothing happens
    # and the export path itself refuses row 2 even when called directly
    ev(page, """() => { const r = current(); const x = checkSwitchRows(r, r.switches).rows[1];
        return run(() => exportOneCard(r, x)); }""")
    assert "Switch 2 has errors; nothing was exported." in ev(page, "() => $('status').textContent")
    assert ev(page, "() => !!document.querySelector('dialog[open]')") is False
    assert downloads(page) == []
    assert page.problems == []


def test_three_way_duplicate_names_another_row_each(page):
    r = ev(page, """() => {
        const rows = ['A-01', 'B-02', 'a-01', 'A-01'].map((h, i) => ({ id: 'x' + i, values: { HOSTNAME: h, MGMT_IP: '192.0.2.' + (10 + i) }, ports: {} }));
        return checkSwitchRows(current(), rows).rows.map((x) => x.errors.filter((e) => e.startsWith('duplicate'))); }""")
    assert r == [["duplicate HOSTNAME (also row 3)"], [], ["duplicate HOSTNAME (also row 1)"], ["duplicate HOSTNAME (also row 1)"]]


# --- Example header in a recipe that is no longer an example ---
def test_example_header_blocks_a_non_example_recipe(page):
    r = ev(page, """(header) => {
        const ex = structuredClone(recipes[2]); normalizePorts(ex);
        const own = structuredClone(ex); own.example = false;
        const fixed = structuredClone(own); fixed.template = fixed.template.replace(header, '! Plant A access, tested 2026-10');
        const g = (x) => generate(x);
        return { ex: g(ex), own: g(own), fixed: g(fixed) }; }""", HEADER)
    msg = ("The template still contains the example header line (" + HEADER +
           "). Replace it with your own tested configuration header.")
    assert msg not in r["ex"]["errors"]
    assert msg in r["own"]["errors"]
    assert [f["where"] for f in r["own"]["findings"] if f["text"] == msg] == [{"kind": "template"}]
    assert msg not in r["fixed"]["errors"]
    # the text itself is unchanged by the check
    assert r["own"]["text"] == r["ex"]["text"]
    # Build: export blocked, the check opens the template in Manage
    ev(page, "() => { current().example = false; baseline = {model: current().model, version: 'x', files: [{path: 'a.bin', blob: new Blob(['x'])}]}; renderAll(); renderPreview(); }")
    assert ev(page, "() => $('downloadCard').disabled") is True
    page.locator("#checks .finding-link", has_text="example header").first.click()
    assert ev(page, "() => currentView") == "manage"
    assert ev(page, "() => document.activeElement.id") == "template"
    # a recipe with switches: the Cards gate and the Switches rail chip show it too
    _take_over(page, 2)
    ev(page, "(h) => { current().template = h + '\\n' + current().template; renderAll(); renderPreview(); }", HEADER)
    ev(page, "() => showView('cards')")
    assert "Rows with errors: 1, 2." in page.inner_text("#cdGates")
    page.wait_for_function("() => $('chipSwitches').textContent.includes('2 errors')")
    assert ev(page, "() => $('chipSwitches').classList.contains('chip-bad')")
    assert ev(page, "() => checkSwitchRows(current(), current().switches).rows[0].errors.some((e) => e.includes('still contains the example header line'))")


# --- Team policy rules: the button says what it does ---
def test_team_policy_button_says_rules_apply_as_you_type(page):
    assert ev(page, "() => $('applyTeamPolicies').textContent") == "Tidy rules"
    assert "Rules apply as you type." in ev(page, "() => $('teamPoliciesLive').textContent")
    assert ev(page, "() => $('applyTeamPolicies').getAttribute('aria-describedby')") == "teamPoliciesLive"


# --- Focus after actions ---
def test_closing_the_export_write_dialog_returns_focus(page):
    ev(page, """(header) => { const r = recipes[0]; r.example = false; r.template = r.template.replace(header, '! Plant test template');
        active = r.id; baseline = {model: r.model, version: 'x', files: [{path: 'a.bin', blob: new Blob(['x'])}]};
        renderAll(); renderPreview(); }""", HEADER)
    stub_downloads(page)
    page.focus("#downloadCard")
    page.keyboard.press("Enter")
    page.wait_for_selector("dialog[open]")
    # the review tick has the first focus
    assert ev(page, "() => document.activeElement.type") == "checkbox"
    page.keyboard.press("Escape")
    page.wait_for_function("() => !busy && !document.querySelector('dialog[open]')")
    assert ev(page, "() => document.activeElement.id") == "downloadCard"
    # Download ZIP: focus comes back too
    page.keyboard.press("Enter")
    page.wait_for_selector("dialog[open]")
    page.keyboard.press("Space")  # tick
    page.click("dialog[open] .dialog-actions button.primary")
    page.wait_for_function("() => !busy && $('status').textContent.includes('SD-card ZIP exported')")
    assert ev(page, "() => document.activeElement.id") == "downloadCard"
    assert len(downloads(page)) == 1


def test_bulk_export_dialog_cancel_returns_focus(page):
    _take_over(page, 2)
    ev(page, "() => showView('cards')")
    page.focus("#cdAll")
    page.keyboard.press("Enter")
    page.wait_for_selector("dialog[open]")
    page.keyboard.press("Escape")
    page.wait_for_function("() => !busy && !document.querySelector('dialog[open]')")
    assert ev(page, "() => document.activeElement.id") == "cdAll"
    page.keyboard.press("Enter")
    click_dialog(page, "Cancel")
    page.wait_for_function("() => !busy")
    assert ev(page, "() => document.activeElement.id") == "cdAll"


def test_build_port_role_change_keeps_focus(page):
    name = ev(page, "() => current().ports[1].name")
    sel = "#ports select[data-port='%s'][data-attr='role']" % name
    page.focus(sel)
    before = ev(page, "(s) => document.querySelector(s).value", sel)
    page.keyboard.press("ArrowDown")
    assert ev(page, "(s) => document.querySelector(s).value", sel) != before
    assert ev(page, "() => [document.activeElement.dataset.port, document.activeElement.dataset.attr]") == [name, "role"]
    page.keyboard.press("Tab")
    assert ev(page, "() => [document.activeElement.dataset.port, document.activeElement.dataset.attr]") == [name, "ip"]


def test_ports_dialog_use_table_keeps_focus_in_the_dialog(page):
    ev(page, """() => { current().switches = [{ id: 'sw-a', values: { HOSTNAME: 'A-01' },
        ports: { 'GigabitEthernet1/3': { description: 'own' } } }]; showView('switches'); }""")
    page.click("#swRows tr[data-row='sw-a'] button.sw-ports")
    page.wait_for_selector("dialog[open]")
    page.focus("dialog[open] button.use-table[data-port='GigabitEthernet1/3']")
    page.keyboard.press("Enter")
    assert ev(page, "() => !!document.activeElement.closest('dialog[open]')") is True
    assert ev(page, "() => [document.activeElement.dataset.port, document.activeElement.dataset.attr]") == ["GigabitEthernet1/3", "role"]
    click_dialog(page, "Close")


def test_danger_buttons_show_a_focus_ring_in_both_themes(page):
    ev(page, """() => { current().switches = [{ id: 'sw-a', values: { HOSTNAME: 'A-01' }, ports: {} }]; showView('switches'); }""")
    for theme in ("light", "dark"):
        ev(page, "(t) => applyTheme(t)", theme)
        page.focus("#swRemoveAll")
        page.keyboard.press("Enter")
        page.wait_for_selector("dialog[open]")
        page.keyboard.press("Tab")  # Cancel -> the red Remove all
        ring = ev(page, """() => { const b = document.activeElement; const s = getComputedStyle(b);
            return { danger: b.classList.contains('danger') && b.classList.contains('primary'), style: s.outlineStyle,
                     width: parseFloat(s.outlineWidth), color: s.outlineColor, bg: s.backgroundColor }; }""")
        assert ring["danger"], ring
        assert ring["style"] != "none" and ring["width"] >= 2, ring
        page.keyboard.press("Escape")
        page.wait_for_function("() => !document.querySelector('dialog[open]')")
        assert ev(page, "() => document.activeElement.id") == "swRemoveAll"
    assert ev(page, "() => current().switches.length") == 1


# --- Decode warning names where ---
def test_decode_warning_names_rows_and_columns(page):
    ev(page, "() => showView('switches')")
    page.click("#swImport")
    page.wait_for_selector("dialog[open]")
    rows = b"HOSTNAME,SITE\n" + b"".join(b"A-%02d,Hall %d\n" % (i, i) for i in range(1, 4)) + b"A-04,Pompe \xe0 eau\n"
    rows += b"".join(b"A-%02d,Caf\xe9 %d\n" % (i, i) for i in range(5, 11))
    page.set_input_files("dialog[open] input[type=file]", {"name": "a.csv", "mimeType": "text/csv", "buffer": rows})
    page.wait_for_function("() => document.querySelector('dialog[open]').textContent.includes('could not be read as UTF-8')")
    text = page.inner_text("dialog[open]")
    assert "7 cells could not be read as UTF-8" in text
    assert "Where: data row 4 SITE, data row 5 SITE, data row 6 SITE, data row 7 SITE, data row 8 SITE and 2 more." in text
    click_dialog(page, "Cancel")


def test_separator_only_lines_are_empty_rows(page):
    r = ev(page, "() => switchRowsFromCsv(current(), 'HOSTNAME,MGMT_IP\\nA-01,192.0.2.11\\n;;\\n , ;\\nA-02,192.0.2.12\\n')")
    assert [x["values"]["HOSTNAME"] for x in r["rows"]] == ["A-01", "A-02"]


# --- Errors before notes ---
def test_side_panel_lists_errors_first(page):
    ev(page, """() => { current().switches = [
        { id: 'sw-a', values: { HOSTNAME: 'A-01', MGMT_IP: '192.0.2.71' }, ports: {} },
        { id: 'sw-b', values: { HOSTNAME: 'A-01', MGMT_IP: '192.0.2.72' }, ports: {} }]; showView('switches'); }""")
    page.click("#swRows tr[data-row='sw-b'] td.num")
    classes = ev(page, "() => [...$('swChecks').querySelectorAll('li')].map((li) => li.className)")
    assert "warn" in classes and classes[0] == "bad"
    assert classes == sorted(classes, key=lambda c: 0 if c == "bad" else 1)


# --- Bulk export progress and stop ---
def test_bulk_export_shows_progress_and_stops_after_the_current_card(page):
    ids = _take_over(page, 5)
    ev(page, "() => showView('cards')")
    stub_downloads(page)
    page.click("#cdAll")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIPs")
    page.wait_for_function("() => !$('cdProgress').hidden && $('cdProgressText').textContent.startsWith('Card ')")
    text = ev(page, "() => $('cdProgressText').textContent")
    assert text.startswith("Card 1 of 5: ") and text.endswith("-sdcard.zip")
    assert ev(page, "() => document.activeElement.id") == "cdCancel"
    page.wait_for_function("() => $('cdProgressText').textContent.startsWith('Card 2 of 5')")
    page.click("#cdCancel")
    page.wait_for_function("() => !busy", timeout=10000)
    d = downloads(page)
    cards = [x["name"] for x in d if x["name"].endswith(".zip")]
    manifest = [x for x in d if "manifest" in x["name"]]
    assert manifest[0]["name"] == "switchcard-fleet-" + ev(page, "() => RELEASE") + "-manifest-partial.txt"
    assert 2 <= len(cards) < 5
    assert len(manifest) == 1 and len(manifest[0]["text"].strip().split("\r\n")) == 1 + len(cards)
    assert len(ev(page, "() => Object.keys(current().exportStates || {})")) == len(cards)
    status = ev(page, "() => $('status').textContent")
    assert status.startswith("Export cancelled after card %d of 5." % len(cards))
    assert ev(page, "() => $('cdProgress').hidden") is True
    assert ev(page, "() => document.activeElement.id") in ("cdAll", "cdChanged")
    page.wait_for_function("(n) => $('cdChanged').textContent === 'Changed and new only (' + n + ')'", arg=5 - len(cards))
    assert page.problems == []


# --- Minor fixes ---
def test_boot_dialog_defaults_to_restore_and_says_a_backup_is_kept(page):
    ev(page, """() => { const p = JSON.parse(JSON.stringify(projectPayload())); p.recipes[0].name = 'Seeded';
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ format: CONFIG.AUTOSAVE_FORMAT, release: '0.7.2',
            savedAt: new Date().toISOString(), project: p, draft: null })); }""")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("dialog[open]")
    assert ev(page, "() => document.activeElement.textContent") == "Restore it"
    text = page.inner_text("dialog[open]")
    assert "keeps a copy as an autosave backup" in text and "Restore autosave backup" in text
    page.keyboard.press("Escape")
    page.wait_for_function("bootDone === true")
    assert ev(page, "() => listAutosaveBackups().length") >= 1


def test_checks_box_is_not_green_while_a_gate_blocks(page):
    ev(page, """(header) => { const r = current(); r.example = false; r.template = r.template.replace(header, '! t');
        r.template += '\\nusername admin\\nip ssh version 2\\n';
        baseline = {model: 'IE9999', version: 'x', files: [{path: 'a.bin', blob: new Blob(['x'])}]}; renderAll(); renderPreview(); }""", HEADER)
    box = ev(page, "() => { const n = $('checks').querySelector('.notice'); return [n.className, n.textContent]; }")
    assert "warning" in box[0] and "Baseline model does not match this recipe." in box[1]


def test_csv_template_and_project_names(page):
    stub_downloads(page)
    ev(page, "() => showView('switches')")
    for mode in ("description", "all", "none"):
        page.select_option("#swTemplateMode", mode)
        page.click("#swTemplate")
    ev(page, "() => showView('build')")
    ev(page, "() => $('saveProject').click()")
    page.wait_for_function("() => (window.__dl || []).length === 4")
    names = [x["name"] for x in downloads(page)]
    assert len(set(names[:3])) == 3 and names[2].endswith("-fields-only.csv")
    assert names[3].startswith("switchcard-project-") and re.fullmatch(r"switchcard-project-\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}\.json", names[3])
