"""Gauntlet round 13 (final fixes): a space typed inside an address is never removed while typing
(it used to be trimmed key by key, so "10.20.30.2 1" became the valid "10.20.30.21"), the status
message is docked under the rail where it covers no control, the team-policy row names its rule,
the Ports dialog opens on its heading, the bulk primary says how many files it writes, the
fingerprint line says when it is not verified, and the operator round 8 minors."""
from helpers import ev, stub_downloads, downloads, click_dialog

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _real(page, n=0):
    return ev(page, """([header, n]) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Plant test template');
        baseline = { model: r.model, version: 'x', files: [{ path: 'a.bin', blob: new Blob(['x']) }] };
        r.switches = n ? countedUpRows(r, [], n).rows : []; r.exports = {};
        renderAll(); renderPreview(); showView('build'); return r.switches.map((x) => x.id); }""", [HEADER, n])


def _type_keys(page, sel, text):
    page.click(sel)
    page.keyboard.press("Control+A")
    page.keyboard.press("Delete")
    for ch in text:
        page.keyboard.press("Space" if ch == " " else ch)


# --- (1) Build MGMT_IP: the inner space stays, the checks report the address, export is blocked ---
def test_build_ip_keeps_an_inner_space_typed_key_by_key(page):
    page.click("#dismissOnboarding")
    _real(page)
    _type_keys(page, "#value_MGMT_IP", "10.20.30.2 1")
    assert page.input_value("#value_MGMT_IP") == "10.20.30.2 1"
    assert ev(page, "() => current().values.MGMT_IP") == "10.20.30.2 1"
    assert "MGMT_IP must be a valid IPv4 address." in page.inner_text("#checks")
    assert page.is_disabled("#downloadCard") and page.is_disabled("#downloadConfig")
    stub_downloads(page)
    page.click("#downloadCard", force=True)
    page.wait_for_timeout(200)
    assert page.locator("dialog[open]").count() == 0
    assert downloads(page) == []
    # the ends are still trimmed when the field is committed
    _type_keys(page, "#value_MGMT_IP", " 10.20.30.21 ")
    assert page.input_value("#value_MGMT_IP") == " 10.20.30.21 "
    assert ev(page, "() => current().values.MGMT_IP") == "10.20.30.21"
    page.keyboard.press("Tab")
    assert page.input_value("#value_MGMT_IP") == "10.20.30.21"
    assert "MGMT_IP must be a valid IPv4 address." not in page.inner_text("#checks")
    assert page.problems == []


# --- (1) a Switches grid cell: the same, and the row and the Cards export are blocked ---
def test_grid_ip_keeps_an_inner_space_typed_key_by_key(page):
    ids = _real(page, 3)
    ev(page, "() => showView('switches')")
    sel = '#swRows input[data-row="%s"][data-key="MGMT_IP"]' % ids[1]
    _type_keys(page, sel, "10.20.30.2 1")
    assert page.input_value(sel) == "10.20.30.2 1"
    assert ev(page, "() => current().switches[1].values.MGMT_IP") == "10.20.30.2 1"
    st = page.text_content('#swRows tr[data-row="%s"] td.status' % ids[1])
    assert st.startswith("1 error"), st
    assert "MGMT_IP must be a valid IPv4 address." in page.inner_text("#swChecks")
    ev(page, "() => showView('cards')")
    assert page.is_disabled('#cdRows tr[data-row="%s"] button.cd-card' % ids[1])
    stub_downloads(page)
    page.click("#cdAll")
    page.wait_for_timeout(200)
    assert page.locator("dialog[open]").count() == 0 and downloads(page) == []
    assert "Rows with errors" in page.inner_text("#cdGates")
    # blur trims the ends
    ev(page, "() => showView('switches')")
    _type_keys(page, sel, " 10.20.30.22 ")
    page.keyboard.press("Tab")
    assert page.input_value(sel) == "10.20.30.22"
    assert ev(page, "() => current().switches[1].values.MGMT_IP") == "10.20.30.22"
    assert page.problems == []


# --- (1) a routed port's IP on Build and in the Ports dialog ---
def test_port_ip_keeps_an_inner_space_typed_key_by_key(page):
    page.click("#dismissOnboarding")
    ids = _real(page, 2)
    port = ev(page, "() => current().ports[0].name")
    page.select_option('#ports select[data-attr="role"][data-port="%s"]' % port, "routed")
    sel = '#ports input[data-attr="ip"][data-port="%s"]' % port
    _type_keys(page, sel, "10.20.30.2 1")
    assert page.input_value(sel) == "10.20.30.2 1"
    assert ev(page, "() => current().ports[0].ip") == "10.20.30.2 1"
    assert port + ": routed IP must be a valid IPv4 address." in page.inner_text("#checks")
    _type_keys(page, sel, " 10.20.30.21 ")
    page.keyboard.press("Tab")
    assert page.input_value(sel) == "10.20.30.21"
    assert ev(page, "() => current().ports[0].ip") == "10.20.30.21"
    # the Ports dialog of a switch: its VLAN field keeps an inner space too, trimmed on commit
    ev(page, "() => showView('switches')")
    page.click('#swRows tr[data-row="%s"] button.sw-ports' % ids[0])
    page.wait_for_selector("dialog[open]")
    p2 = ev(page, "() => current().ports[1].name")
    vsel = 'dialog[open] input[data-attr="vlan"][data-port="%s"]' % p2
    _type_keys(page, vsel, "1 0")
    assert page.input_value(vsel) == "1 0"
    page.keyboard.press("Tab")
    assert page.input_value(vsel) == "1 0"
    _type_keys(page, vsel, " 10 ")
    page.keyboard.press("Tab")
    assert page.input_value(vsel) == "10"
    assert ev(page, "(p) => current().switches[0].ports[Object.keys(current().switches[0].ports).find((k) => k.toLowerCase() === p.toLowerCase())].vlan", p2) == "10"
    assert page.problems == []


# --- (2) the status message covers no control: the draft lock's Save project, Cards rows ---
def _covered(page, sel):
    return ev(page, """(sel) => { const b = document.querySelector(sel).getBoundingClientRect();
        const pts = [[b.left + 4, b.top + 4], [b.left + b.width / 2, b.top + b.height / 2], [b.right - 4, b.bottom - 4]];
        return pts.some(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#status')); }); }""", sel)


def test_status_never_covers_save_project_in_the_draft_lock(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    page.click("#railManage")
    page.click("#template")
    page.keyboard.press("End")
    page.keyboard.type(" x")
    page.click("#railBuild")
    page.wait_for_function("() => !$('status').hidden")
    assert "Apply your recipe changes" in page.text_content("#status")
    assert page.is_visible("#saveProjectDraft")
    assert not _covered(page, "#saveProjectDraft")
    for sel in ("#applyRecipe", "#discardDraft"):
        if page.locator(sel).count():
            assert not _covered(page, sel), sel
    # the status sits beside the content, under the rail
    r = ev(page, "() => { const s = $('status').getBoundingClientRect(), v = document.querySelector('.views').getBoundingClientRect(); return [s.right, v.left]; }")
    assert r[0] <= r[1], r
    assert page.problems == []


def test_status_never_covers_card_rows_after_a_bulk_export(page):
    for size in ({"width": 1440, "height": 900}, {"width": 900, "height": 900}):
        page.set_viewport_size(size)
        ids = _real(page, 12)
        ev(page, "() => showView('cards')")
        stub_downloads(page)
        page.click("#cdText")
        page.check("dialog[open] input[type=checkbox]")
        click_dialog(page, "Download ZIP")
        page.wait_for_function("() => !$('status').hidden && $('status').textContent.startsWith('Export finished')")
        hidden = []
        for i in ids:
            sel = '#cdRows tr[data-row="%s"] button.cd-card' % i
            box = page.locator(sel).bounding_box()
            if box and 0 <= box["y"] and box["y"] + box["height"] <= size["height"]:
                if _covered(page, sel):
                    hidden.append(i)
        if size["width"] == 1440:
            assert hidden == [], hidden
    assert page.problems == []


def test_status_close_is_next_after_the_rail_in_tab_order(page):
    ev(page, "() => message('hello')")
    page.focus("#railManage")
    page.keyboard.press("Tab")
    assert ev(page, "() => document.activeElement.id") == "statusClose"


# --- (3) the team-policy row names its rule, and the grid still fits its card ---
def test_policy_row_names_its_rule_without_overflowing(page):
    for size in ({"width": 1440, "height": 900}, {"width": 900, "height": 900}):
        page.set_viewport_size(size)
        _real(page, 12)
        ev(page, """() => { const r = current(); r.switches[10].values.HOSTNAME = 'PKG-TEST-11';
            teamPolicies = ['forbid ^hostname .*TEST']; renderAll(); showView('switches'); }""")
        m = ev(page, """() => { const td = document.querySelectorAll('#swRows td.status')[10]; const w = td.querySelector('.st-what');
            const t = $('swTable'); const box = t.closest('.scroll') || t.parentElement;
            return { text: td.textContent, title: td.title, whatH: w.getBoundingClientRect().height, lineH: parseFloat(getComputedStyle(w).lineHeight),
              whatOver: w.scrollWidth - w.clientWidth, cellOver: td.scrollWidth - td.clientWidth,
              tableOver: t.getBoundingClientRect().width - box.clientWidth }; }""")
        assert m["text"] == "1 error · policy: forbid ^hostname .*TEST", m
        assert "Team policy: forbidden pattern present: ^hostname .*TEST" in m["title"]
        assert m["whatH"] <= 2 * m["lineH"] + 1 and m["cellOver"] <= 0, m
        if size["width"] == 1440:
            assert m["tableOver"] <= 0, m
    assert page.problems == []


# --- (3) inherited values in the light theme are at least 4.5:1 ---
CONTRAST = """() => {
  const parse = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(getComputedStyle(e).backgroundColor);
    let c = { r: 255, g: 255, b: 255, a: 1 }; for (const s of chain.reverse()) { const p = parse(s); if (p.a > 0) c = over(p, c); } return c; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const of = (el, pseudo) => { const bg = bgOf(el); return ratio(over(parse(getComputedStyle(el, pseudo).color), bg), bg); };
  const grid = [...document.querySelectorAll('#swRows input.inherit')].map((i) => of(i, '::placeholder'));
  const dlg = [...document.querySelectorAll('dialog[open] input.inherit')].map((i) => of(i, '::placeholder'))
    .concat([...document.querySelectorAll('dialog[open] select.inherit')].map((s) => of(s)));
  return { grid: Math.min(...grid), dlg: dlg.length ? Math.min(...dlg) : null }; }"""


def test_inherited_values_meet_aa_in_the_light_theme(browser):
    from helpers import HTML
    ctx = browser.new_context(color_scheme="light", viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(HTML.as_uri())
    page.wait_for_function("typeof generate === 'function' && (typeof bootDone === 'undefined' || bootDone === true)")
    ids = _real(page, 6)
    ev(page, "(id) => { current().switches[4].values.MGMT_IP = '10.20.30.300'; renderAll(); showView('switches'); selectSwitch(id); }", ids[4])
    page.click('#swRows tr[data-row="%s"] button.sw-ports' % ids[0])
    page.wait_for_selector("dialog[open]")
    m = ev(page, CONTRAST)
    assert m["grid"] >= 4.5 and m["dlg"] is not None and m["dlg"] >= 4.5, m
    ctx.close()


# --- (3) the Ports dialog opens on its heading; Use table is named per port; paste is refused ---
def test_ports_dialog_starts_on_its_heading(page):
    ids = _real(page, 2)
    ev(page, """() => { const r = current(); const p = r.ports[0].name; r.switches[0].ports = { [p]: { description: 'Pump 1' } };
        renderAll(); showView('switches'); }""")
    page.click('#swRows tr[data-row="%s"] button.sw-ports' % ids[0])
    page.wait_for_selector("dialog[open]")
    page.wait_for_timeout(50)
    assert ev(page, "() => document.activeElement.tagName") == "H2"
    before = ev(page, "() => JSON.stringify(current().switches[0].ports)")
    page.keyboard.press("ArrowDown")
    assert ev(page, "() => JSON.stringify(current().switches[0].ports)") == before
    port = ev(page, "() => current().ports[0].name")
    assert page.get_attribute("dialog[open] button.use-table", "aria-label") == "Use table for " + port
    # a multi-line paste is refused with a note, as in the grid
    dsel = 'dialog[open] input[data-attr="description"][data-port="%s"]' % port
    refused = ev(page, """(s) => { const dt = new DataTransfer(); dt.setData('text/plain', 'Line A\\nLine B');
        const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        document.querySelector(s).dispatchEvent(e); return e.defaultPrevented; }""", dsel)
    assert refused is True
    assert page.input_value(dsel) == "Pump 1"
    assert "Not pasted" in page.text_content("#status")
    page.keyboard.press("Escape")
    assert page.problems == []


# --- (3) the fingerprint line says "not verified" when there is no record to compare with ---
def test_fingerprint_without_a_record_says_not_verified(page):
    page.click("#dismissOnboarding")
    _real(page)
    ev(page, "() => { baseline.fingerprint = { digest: 'f'.repeat(64), files: [] }; baseline.compare = null; renderPreview(); }")
    page.click("#downloadCard")
    page.wait_for_selector("dialog[open]")
    row = page.locator("dialog[open] tr.dlg-unverified")
    assert row.count() == 1
    assert "not verified — no recorded fingerprint" in row.inner_text()
    page.keyboard.press("Escape")
    assert page.problems == []


# --- (4) a boot status about the autosave goes away at the first edit ---
def test_until_edit_status_goes_away_at_the_first_edit(page):
    page.click("#dismissOnboarding")
    ev(page, "() => message('Browser autosave was NOT restored: test. Showing the example recipes.', { untilEdit: true })")
    assert page.is_visible("#status")
    page.click("#value_HOSTNAME")
    page.keyboard.type("X")
    page.wait_for_function("() => $('status').hidden")
    # an ordinary message stays
    ev(page, "() => message('kept')")
    page.keyboard.type("Y")
    assert page.is_visible("#status")
    assert page.problems == []
