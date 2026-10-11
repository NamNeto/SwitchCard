"""Gauntlet round 7 (operator report ops-r2): the baseline fingerprint verdict on every export path,
the baseline loader filled in from an opened project, Ports dialog edits that reach the autosave
only on Done, and the minor fixes."""
from helpers import ev, click_dialog, stub_downloads, downloads

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _take_over(page, n=3, differs=True):
    """A non-example recipe with n switches, a baseline and a project record whose fingerprint
    matches the loaded one (differs=False) or not (differs=True)."""
    return ev(page, """([n, header, differs]) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Plant test template');
        const fp = (d, s) => ({ fileCount: 1, totalBytes: 1, digest: d.repeat(64), files: [{ path: 'a.bin', size: 1, sha256: s.repeat(64) }] });
        baselineExpected = { model: r.model, version: 'x', fingerprint: fp('c', 'd') };
        baseline = { model: r.model, version: 'x', files: [{ path: 'a.bin', blob: new Blob(['x']) }],
          fingerprint: differs ? fp('a', 'b') : fp('c', 'd') };
        baseline.compare = compareFingerprints(baselineExpected.fingerprint, baseline.fingerprint);
        r.switches = countedUpRows(r, [], n).rows; r.exports = {};
        renderAll(); renderPreview(); return r.switches.map((x) => x.id); }""", [n, HEADER, differs])


# --- C1: a fingerprint that differs from the project's record is shown on every export path ---
def test_fingerprint_differs_warns_on_build_cards_and_every_bulk_dialog(page):
    _take_over(page, 3, differs=True)
    # Build: a warning, not a block (the single card only warns too)
    assert page.is_enabled("#downloadCard")
    assert ev(page, "() => $('exportWhy').classList.contains('gate-warn')") is True
    why = page.inner_text("#exportWhy")
    assert "Ready to export." in why and "baseline fingerprint DIFFERS" in why
    # Cards gate: the same warning beside "Ready to export 3 cards."
    ev(page, "() => showView('cards')")
    gate = page.inner_text("#cdGates")
    assert "Ready to export 3 cards." in gate and "baseline fingerprint DIFFERS" in gate
    assert ev(page, "() => $('cdGates').classList.contains('gate-warn')") is True
    assert page.is_enabled("#cdAll") and page.is_enabled("#cdText") and page.is_enabled("#cdChanged")
    stub_downloads(page)
    for btn in ["#cdAll", "#cdChanged", "#cdText"]:
        page.click(btn)
        text = click_dialog(page, "Cancel")
        assert "Review: Baseline fingerprint DIFFERS from the project's recorded baseline (1 changed, 0 added, 0 missing)" in text, btn
        assert "Baseline fingerprint\taaaaaaaaaaaaaaaa… DIFFERS from the project's recorded baseline" in text, btn
        assert ev(page, "() => document.querySelectorAll('dialog[open]').length") == 0
    # the single Card ZIP dialog says the same
    page.locator("#cdRows button.cd-card").first.click()
    text = click_dialog(page, "Cancel")
    assert "Review: Baseline fingerprint DIFFERS" in text
    assert downloads(page) == []
    # the warning does not block: a bulk export still writes once the box is ticked
    page.click("#cdText")
    page.wait_for_selector("dialog[open]")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIP")
    page.wait_for_function("() => window.__dl.length === 1")
    assert page.problems == []


def test_fingerprint_match_keeps_the_green_gate_and_a_matches_line(page):
    _take_over(page, 2, differs=False)
    assert ev(page, "() => $('exportWhy').classList.contains('gate-ok')") is True
    assert "DIFFERS" not in page.inner_text("#exportWhy")
    ev(page, "() => showView('cards')")
    assert ev(page, "() => $('cdGates').classList.contains('gate-ok')") is True
    page.click("#cdAll")
    text = click_dialog(page, "Cancel")
    assert "Review:" not in text
    assert "matches the project's recorded baseline" in text


# --- I1: opening a project fills the baseline loader's model and label from its record ---
def test_open_project_prefills_the_baseline_model_and_label(page):
    r = ev(page, """async () => {
        const p = JSON.parse(JSON.stringify(projectPayload()));
        p.baseline = { model: 'IE3x00', version: '17.12.4 plant baseline' };
        $('baseModel').value = 'IE3100'; $('baseVersion').value = '';
        const v = validateProject(p);
        await acceptProject(v, null);
        return [$('baseModel').value, $('baseVersion').value, $('baseDetails').textContent]; }""")
    assert r[0] == "IE3x00" and r[1] == "17.12.4 plant baseline"
    assert "Model family and label are filled in from the record" in r[2]


# --- I3: Ports dialog edits reach the autosave only on Done ---
def _ports_setup(page):
    ids = ev(page, """() => { const r = current(); r.switches = countedUpRows(r, [], 2).rows; touch(); showView('switches'); return r.switches.map((x) => x.id); }""")
    page.wait_for_timeout(700)  # the autosave debounce
    return ids


def test_ports_dialog_edits_are_not_autosaved_before_done(page):
    ids = _ports_setup(page)
    page.locator('#swRows tr[data-row="%s"] button.sw-ports' % ids[0]).click()
    page.wait_for_selector("dialog[open]")
    page.locator("dialog[open] input[data-attr=description]").first.fill("UNCOMMITTED PORT EDIT")
    # the grid follows while the dialog is open
    assert page.inner_text('#swRows tr[data-row="%s"] button.sw-ports' % ids[0]) == "1 override"
    page.wait_for_timeout(1200)
    saved = ev(page, "() => localStorage.getItem(AUTOSAVE_KEY)")
    assert "UNCOMMITTED PORT EDIT" not in saved
    page.reload()
    page.wait_for_function("typeof bootDone !== 'undefined' && bootDone === true")
    assert ev(page, "() => JSON.stringify(current().switches[0].ports || {})") == "{}"
    assert len(ev(page, "() => current().switches")) == 2


def test_ports_dialog_done_autosaves_and_cancel_restores(page):
    ids = _ports_setup(page)
    btn = '#swRows tr[data-row="%s"] button.sw-ports' % ids[0]
    page.locator(btn).click()
    page.locator("dialog[open] input[data-attr=description]").first.fill("Robot cell 1")
    click_dialog(page, "Cancel")
    assert ev(page, "() => JSON.stringify(current().switches[0].ports || {})") == "{}"
    assert ev(page, "() => autosavePaused") is False
    page.locator(btn).click()
    page.locator("dialog[open] input[data-attr=description]").first.fill("Robot cell 1")
    click_dialog(page, "Done")
    assert ev(page, "() => autosavePaused") is False
    page.wait_for_timeout(800)
    assert "Robot cell 1" in ev(page, "() => localStorage.getItem(AUTOSAVE_KEY)")
    page.reload()
    page.wait_for_function("typeof bootDone !== 'undefined' && bootDone === true")
    assert "Robot cell 1" in ev(page, "() => JSON.stringify(current().switches[0].ports)")
    # the Ports button names its switch for screen readers (M12)
    ev(page, "() => showView('switches')")
    assert ev(page, "(s) => document.querySelector(s).getAttribute('aria-label')", btn) == "Ports of switch 1, 1 setting of its own"


# --- Minor fixes ---
def test_gate_summary_names_both_duplicates_and_the_refused_address(page):
    _take_over(page, 1, differs=False)
    ev(page, """() => { current().switches = [
        ['PA-D-SW01', '192.0.2.21'], ['PA-D-SW01', '192.0.2.21'], ['PA-D-SW03', '192.0.2.317']]
        .map(([h, ip], i) => ({ id: 'd' + i, values: { HOSTNAME: h, MGMT_IP: ip }, ports: {} }));
        showView('cards'); }""")
    gate = page.inner_text("#cdGates")
    assert "1, 2 (duplicate HOSTNAME PA-D-SW01 and MGMT_IP 192.0.2.21)" in gate
    assert '3 (MGMT_IP must be a valid IPv4 address (got "192.0.2.317"))' in gate


def test_build_gate_merges_two_checks_on_one_cell(page):
    ev(page, """() => { const r = current(); normalizePorts(r);
        const p = r.ports.find((x) => x.role === 'access') || r.ports[0]; p.role = 'access'; p.vlan = '';
        renderAll(); renderPreview(); }""")
    # round 12: the gate is one line ("2 errors above") and the checks box lists each check once
    li = ev(page, """() => [...document.querySelectorAll('#exportWhy li')].map((l) => l.textContent).find((t) => /errors? above/.test(t)) || ''""")
    assert li == "2 errors above", li
    texts = ev(page, "() => [...$('checks').querySelectorAll('.notice.error button.finding-link')].map((b) => b.textContent)")
    assert len(texts) == 2 and len(set(texts)) == 2, texts


def test_csv_multiline_cell_is_noted_in_the_import(page):
    r = ev(page, r"""() => switchRowsFromCsv(current(), 'HOSTNAME,MGMT_IP,SITE\nA-01,192.0.2.10,"multi\r\nline"\n')""")
    assert r["rows"][0]["values"]["SITE"] == "multi line"
    assert any("1 quoted cell held line breaks" in w for w in r["warnings"])


def test_rail_chip_and_save_button_show_an_unapplied_draft(page):
    ev(page, "() => showView('manage')")
    assert page.is_hidden("#saveProjectDraft")
    page.fill("#recipeName", "Draft name")
    page.wait_for_function("() => $('chipManage').textContent.includes('draft not applied')")
    assert page.is_visible("#saveProjectDraft")
    stub_downloads(page)
    page.click("#saveProjectDraft")
    click_dialog(page, "Save without the draft")
    assert [d["name"] for d in downloads(page)][0].startswith("switchcard-project-")
    page.click("#discardDraft")
    if ev(page, "() => !!document.querySelector('dialog[open]')"):
        click_dialog(page, "Discard")
    page.wait_for_function("() => !$('chipManage').textContent.includes('draft not applied')")


def test_choosing_the_active_recipe_again_keeps_the_workspace_clean(page):
    ev(page, "() => { dirty = false; }")
    ev(page, "() => { const s = $('cdRecipe'); s.value = active; s.dispatchEvent(new Event('change')); }")
    assert ev(page, "() => dirty") is False


def test_example_header_check_selects_the_header_line(page):
    ev(page, "() => { current().example = false; renderAll(); renderPreview(); }")
    page.locator("#checks .finding-link", has_text="example header").first.click()
    sel = ev(page, "() => { const t = $('template'); return t.value.slice(t.selectionStart, t.selectionEnd); }")
    assert sel == HEADER


def test_export_csv_points_out_formula_like_cells(page):
    ev(page, """() => { const r = current(); r.switches = countedUpRows(r, [], 2).rows;
        r.switches[1].values.SITE = "=cmd|' /C calc'!A0"; showView('switches'); }""")
    stub_downloads(page)
    page.click("#swExport")
    d = downloads(page)
    assert "=cmd|' /C calc'!A0" in d[0]["text"]  # the value itself is kept for the round trip
    st = ev(page, "() => $('status').textContent")
    assert "1 cell starts with =, +, - or @ (row 2 SITE)" in st
