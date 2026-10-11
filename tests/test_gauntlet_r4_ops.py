"""Gauntlet round 4 (operator report ops-r1): example text gate, gate lines that name the problem,
focus after Got it / the Ports dialog / Remove all, the bulk export that keeps its pace while the
other views stay closed, and the minor fixes."""
from helpers import ev, click_dialog, stub_downloads, downloads

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _take_over(page, n=3):
    return ev(page, """([n, header]) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Plant test template');
        baseline = {model: r.model, version: 'x', files: [{path: 'a.bin', blob: new Blob(['x'])}]};
        r.switches = countedUpRows(r, [], n).rows; r.exports = {};
        renderAll(); renderPreview(); return r.switches.map((x) => x.id); }""", [n, HEADER])


def _active(page):
    return ev(page, """() => { const a = document.activeElement;
        return { tag: a.tagName, id: a.id, cls: a.className || '', row: a.closest('tr') ? a.closest('tr').dataset.row : null }; }""")


# --- I-1: an example recipe's text cannot be saved as editcontent.txt ---
def test_save_text_only_is_blocked_for_an_example_recipe(page):
    assert ev(page, "() => current().example") is True
    stub_downloads(page)
    assert page.is_disabled("#downloadConfig")
    assert "Example recipe" in ev(page, "() => $('downloadConfig').title")
    assert page.is_enabled("#copyPreview")  # the example can still be read
    ev(page, "() => $('downloadConfig').onclick()")  # even when called directly
    assert "Save text only is blocked" in ev(page, "() => $('status').textContent")
    assert downloads(page) == []
    # a taken-over recipe saves its text (no baseline needed for text only)
    ev(page, """(h) => { const r = current(); r.example = false; r.template = r.template.replace(h, '! Plant test');
        baseline = null; renderAll(); renderPreview(); }""", HEADER)
    assert page.is_enabled("#downloadConfig")
    # (r10, ops-r5 D1) the text goes through the same write dialog as the card exports
    page.click("#downloadConfig")
    page.wait_for_selector("dialog[open] input[type=checkbox]")
    assert ev(page, "() => document.querySelector('dialog[open] h2').textContent") == "Save text only?"
    assert downloads(page) == []
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download text")
    page.wait_for_selector("dialog[open]", state="detached")
    d = downloads(page)
    assert [x["name"] for x in d] == ["editcontent.txt"]
    assert d[0]["text"] == ev(page, "() => $('preview').textContent")
    assert page.problems == []


# --- I-2: the Cards gate and the bulk status name the problem ---
def test_cards_gate_names_duplicates_and_the_example_header(page):
    _take_over(page, 1)
    ev(page, """() => { current().switches = [
        ['PA-D-SW01', '192.0.2.21'], ['PA-D-SW02', '192.0.2.22'], ['PA-D-SW02', '192.0.2.23'],
        ['PA-D-SW04', '192.0.2.24'], ['PA-D-SW05', '192.0.2.24']]
        .map(([h, ip], i) => ({ id: 'd' + i, values: { HOSTNAME: h, MGMT_IP: ip }, ports: {} }));
        showView('cards'); }""")
    gate = page.inner_text("#cdGates")
    assert "Rows with errors: 2, 3 (duplicate HOSTNAME PA-D-SW02) · 4, 5 (duplicate MGMT_IP 192.0.2.24)." in gate
    stub_downloads(page)
    page.click("#cdAll")
    page.wait_for_function("() => $('status').textContent.includes('nothing was exported')")
    assert ev(page, "() => $('status').textContent") == (
        "Rows with errors: 2, 3 (duplicate HOSTNAME PA-D-SW02) · 4, 5 (duplicate MGMT_IP 192.0.2.24). "
        "Fix them in Switches; nothing was exported.")
    assert downloads(page) == []
    # the example header kept in a taken-over recipe
    ev(page, "(h) => { current().switches.splice(2); current().template = h + '\\n' + current().template; renderAll(); renderPreview(); renderCards(); }", HEADER)
    assert "Rows with errors: 1, 2 (template still contains the example header)." in page.inner_text("#cdGates")


def test_bad_rows_summary_shortens_long_lists(page):
    s = ev(page, """() => badRowsSummary([
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ n, errors: ['MGMT_IP must be a valid IPv4 address.'], policy: [] })),
        { n: 9, errors: ['duplicate HOSTNAME (also row 10)'], policy: [], host: 'A-01' },
        { n: 10, errors: [], policy: ['missing required pattern: ^aaa new-model'] },
        { n: 11, errors: ['Something else.'], policy: [] }, { n: 12, errors: ['Other.'], policy: [] }])""")
    assert s == ("1, 2, 3, 4, 5 +3 more (MGMT_IP must be a valid IPv4 address) · 9 (duplicate HOSTNAME A-01) · "
                 "10 (team policy: missing required pattern: ^aaa new-model) · and 2 more rows")


# --- I-3: Got it hands focus to step 1 ---
def test_got_it_moves_focus_to_the_recipe_picker(page):
    ev(page, "() => { $('onboarding').hidden = false; }")
    page.focus("#dismissOnboarding")
    page.keyboard.press("Enter")
    assert ev(page, "() => $('onboarding').hidden") is True
    assert _active(page)["id"] == "recipe"


# --- I-4: fixing a check in the Ports dialog leaves focus on the row's Ports button ---
def test_focus_after_fixing_a_check_in_the_ports_dialog(page):
    ids = _take_over(page, 2)
    port = ev(page, """(id) => { const r = current(); const p = r.ports.find((x) => x.role === 'access') || r.ports[0];
        r.switches[1].ports = { [p.name]: { description: 'Pompe \\u00e0 eau 3' } }; showView('switches'); return p.name; }""", ids[1])
    page.click("#swRows tr[data-row='%s'] td.num" % ids[1])
    page.locator("#swChecks button.finding-link", has_text="non-ASCII").first.click()
    page.wait_for_selector("dialog[open]")
    a = ev(page, "() => [document.activeElement.dataset.port, document.activeElement.dataset.attr]")
    assert a == [port, "description"]
    page.keyboard.press("Control+A")
    page.keyboard.type("Pompe a eau 3")
    page.keyboard.press("Tab")
    click_dialog(page, "Done")  # gauntlet r6: the Ports dialog closes with Done (Cancel reverts)
    page.wait_for_function("() => !document.querySelector('dialog[open]')")
    assert ev(page, "() => current().switches[1].ports") != {}
    act = _active(page)
    assert act["tag"] == "BUTTON" and "sw-ports" in act["cls"] and act["row"] == ids[1]


# --- I-5: Remove all hands focus to Add switches ---
def test_focus_after_remove_all(page):
    _take_over(page, 3)
    ev(page, "() => showView('switches')")
    page.focus("#swRemoveAll")
    page.keyboard.press("Enter")
    click_dialog(page, "Remove all")
    page.wait_for_function("() => (current().switches || []).length === 0")
    assert _active(page)["id"] == "swEmptyAdd"


# --- I-6: a bulk export keeps its pace and its Cancel; other views stay closed and say why ---
def test_bulk_export_keeps_pace_when_another_view_is_clicked(page):
    _take_over(page, 5)
    ev(page, "() => showView('cards')")
    stub_downloads(page)
    page.click("#cdAll")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIPs")
    page.wait_for_function("() => $('cdProgressText').textContent.startsWith('Card 2 of 5')")
    assert ev(page, "() => $('rail').classList.contains('rail-locked')") is True
    assert ev(page, "() => $('railSwitches').classList.contains('rail-off')") is True
    page.click("#railSwitches", timeout=2000)  # clickable at once, not after the run
    assert ev(page, "() => currentView") == "cards"
    assert "A card export is running (Card " in ev(page, "() => $('status').textContent")
    assert ev(page, "() => $('cdProgress').hidden") is False and page.is_enabled("#cdCancel")
    n_now = len([x for x in ev(page, "() => window.__dl.map((d) => d.name)") if x.endswith(".zip")])
    assert n_now < 5  # no burst of the remaining cards
    page.keyboard.press("Enter")  # the focused rail item again: still refused
    assert ev(page, "() => currentView") == "cards"
    page.click("#cdCancel")
    page.wait_for_function("() => !busy", timeout=10000)
    d = downloads(page)
    cards = [x["name"] for x in d if x["name"].endswith(".zip")]
    assert len(cards) < 5 and any("manifest-partial" in x["name"] for x in d)
    # only the cards handed to download are recorded
    assert len(ev(page, "() => Object.keys(current().exportStates || {})")) == len(cards)
    assert ev(page, "() => $('rail').classList.contains('rail-locked')") is False
    assert ev(page, "() => $('railSwitches').classList.contains('rail-off') || $('railSwitches').disabled") is False
    page.click("#railSwitches")
    assert ev(page, "() => currentView") == "switches"
    assert page.problems == []


# --- M-2: the rail item just activated keeps a visible focus ring ---
def test_rail_focus_ring_survives_activation(page):
    page.focus("#railBuild")
    page.keyboard.press("Tab")
    page.keyboard.press("Enter")
    assert ev(page, "() => document.activeElement.id") == "railSwitches"
    page.wait_for_timeout(400)  # the rail's box-shadow transition
    shadow = ev(page, "() => getComputedStyle($('railSwitches')).boxShadow")
    assert "0px 0px 0px 3px" in shadow, shadow


# --- M-3: Tab wraps inside an open dialog ---
def test_tab_wraps_inside_the_dialog(page):
    ev(page, "() => { confirmDialog('Wrap?', 'Body text.'); }")
    page.wait_for_selector("dialog[open]")
    ids = []
    for _ in range(6):
        page.keyboard.press("Tab")
        ids.append(ev(page, "() => !!document.activeElement.closest('dialog[open]')"))
    assert all(ids), ids
    page.keyboard.press("Shift+Tab")
    page.keyboard.press("Shift+Tab")
    page.keyboard.press("Shift+Tab")
    assert ev(page, "() => !!document.activeElement.closest('dialog[open]')") is True


# --- M-5: team-policy results show in the side panel next to other errors ---
def test_side_panel_lists_policy_hits_beside_other_errors(page):
    ids = _take_over(page, 2)
    ev(page, """() => { teamPolicies = ['require ^aaa new-model']; current().switches[0].values.GATEWAY = '203.0.113.1';
        showView('switches'); }""")
    row = ev(page, "() => { const x = checkSwitchRows(current(), current().switches).rows[0]; return { e: x.errors, p: x.policy, t: !!x.text }; }")
    assert row["e"] and row["p"] == [] and row["t"]  # the row check stops at the first kind
    page.click("#swRows tr[data-row='%s'] td.num" % ids[0])
    texts = ev(page, "() => [...$('swChecks').querySelectorAll('li')].map((li) => li.textContent)")
    assert any("outside the management subnet" in t for t in texts), texts
    assert any(t.startswith("Team policy:") and "aaa new-model" in t for t in texts), texts


# --- M-10: a multi-line paste into one cell is refused with a pointer to Import CSV ---
def test_multi_line_paste_into_a_cell_is_refused(page):
    ids = _take_over(page, 2)
    ev(page, "() => showView('switches')")
    sel = '#swRows input[data-row="%s"][data-key="HOSTNAME"]' % ids[1]
    before = page.input_value(sel)
    page.focus(sel)
    ev(page, r"""(s) => { const dt = new DataTransfer(); dt.setData('text/plain', 'PA-P-SW01\nPA-P-SW02\nPA-P-SW03');
        document.querySelector(s).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", sel)
    assert page.input_value(sel) == before
    assert "Import CSV" in ev(page, "() => $('status').textContent")
    # a single value with a trailing line break still pastes (the browser inserts it)
    r = ev(page, r"""(s) => { const dt = new DataTransfer(); dt.setData('text/plain', ' PA-P-SW09\r\n');
        const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        document.querySelector(s).dispatchEvent(e); return e.defaultPrevented; }""", sel)
    assert r is False


# --- M-12: one switch reads as one card ZIP ---
def test_export_finished_grammar_for_one_switch(page):
    _take_over(page, 1)
    ev(page, "() => showView('cards')")
    stub_downloads(page)
    page.click("#cdAll")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIPs")
    page.wait_for_function("() => !busy && $('status').textContent.startsWith('Export finished')", timeout=10000)
    assert ev(page, "() => $('status').textContent").startswith("Export finished: 1 switch as one card ZIP plus a manifest")
