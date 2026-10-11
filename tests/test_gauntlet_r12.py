"""Gauntlet round 12 (visual, both r11 critics): the preview boxes end at a whole line so the
"Showing lines" cue counts exactly what is seen, the Build gate with input errors is one quiet
line with one jump (the checks box is the one list), the Switches grid fits its card at 1440 px
with the policy row saying "policy" (the rule in the title and the panel), a blocked Cards row
reads its checks neutrally, the labels box is three lines, inherited Role selects are dashed, and
the jump chevrons are 24 px targets on a whole-line click area."""
import re

from helpers import ev

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _real(page):
    ev(page, """(header) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Packaging hall access switches - tested 2026-10-01');
        baseline = { model: r.model, version: 'x', files: [{ path: 'a.bin', blob: new Blob(['x']) }] };
        renderAll(); renderPreview(); showView('build'); }""", HEADER)


# the lines whose boxes are wholly inside the box, and whether any line is cut by the bottom edge
PART = """(id) => { const pre = $(id); const box = pre.getBoundingClientRect();
    const top = box.top, bottom = box.top + pre.clientHeight + 2;
    const rs = [...pre.querySelectorAll('.pl')].map((b, i) => [i + 1, b.getBoundingClientRect()]);
    const whole = rs.filter(([i, r]) => r.top >= top && r.bottom <= bottom).map((x) => x[0]);
    const cut = rs.filter(([i, r]) => r.top < bottom - 1 && r.bottom > bottom + 1 && r.top > top).map((x) => x[0]);
    return { whole: [whole[0], whole[whole.length - 1]], cut, total: rs.length }; }"""


def _cue(page, sel):
    m = re.match(r"Showing lines (\d+)–(\d+) of (\d+)", page.text_content(sel) or "")
    return [int(m.group(1)), int(m.group(2))] if m else None


# --- (1) the boxes end at a whole line at rest, so the cue is exactly what the viewer sees ---
def test_preview_boxes_end_at_a_whole_line(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    page.click("#dismissOnboarding")
    _real(page)
    ev(page, "() => { $('preview').scrollTop = 0; sizeBuildPane(); }")
    page.wait_for_timeout(150)
    p = ev(page, PART, "preview")
    assert p["cut"] == [] and p["whole"][0] == 1 and _cue(page, "#previewCue") == p["whole"], (p, page.text_content("#previewCue"))
    # a wrapped line at the edge is hidden whole, never shown as a complete shorter line
    ev(page, "() => { const r = current(); r.values.SITE = 'Packaging hall, a very long site name that wraps the second comment line of the card text onto a second row'; renderPreview(); }")
    page.wait_for_timeout(150)
    p = ev(page, PART, "preview")
    assert p["cut"] == [] and _cue(page, "#previewCue") == p["whole"], p
    # the side panel's box too
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows; renderAll(); showView('switches'); selectSwitch(r.switches[1].id); }")
    page.wait_for_function("() => ($('swPreviewCue').textContent || '').startsWith('Showing lines')")
    p = ev(page, PART, "swPreview")
    assert p["cut"] == [] and _cue(page, "#swPreviewCue") == p["whole"], p
    assert ev(page, "() => $('swPreview').getBoundingClientRect().height <= 378")
    assert page.problems == []


# --- (2) the grid fits its card at 1440 px with the side panel; the policy row says "policy" ---
def test_grid_fits_its_card_at_1440_with_the_policy_row(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    _real(page)
    ev(page, """() => { const r = current(); const rows = countedUpRows(r, [], 12).rows; r.switches = rows;
        rows[4].values.MGMT_IP = '10.20.30.300'; rows[8].values.HOSTNAME = rows[7].values.HOSTNAME; rows[10].values.HOSTNAME = 'PKG-TEST-11';
        teamPolicies = ['forbid ^hostname .*TEST']; renderAll(); showView('switches'); selectSwitch(rows[4].id); }""")
    m = ev(page, """() => { const t = $('swTable'); const box = t.closest('.scroll') || t.parentElement;
        const more = [...t.querySelectorAll('button.sw-more')].pop().getBoundingClientRect();
        return { over: t.scrollWidth - box.clientWidth, tableOver: t.getBoundingClientRect().width - box.clientWidth,
          moreIn: more.right <= box.getBoundingClientRect().right - 1, status: document.querySelectorAll('#swRows td.status')[10].textContent }; }""")
    assert m["tableOver"] <= 0 and m["moreIn"], m
    assert m["status"] == "1 error · policy: forbid ^hostname .*TEST", m
    # the full rule: in the cell's title and in the side panel
    ev(page, "() => selectSwitch(current().switches[10].id)")
    assert "forbidden pattern present: ^hostname .*TEST" in ev(page, "() => { const t = document.querySelectorAll('#swRows td.status')[10]; return t.title || (t.querySelector('[title]') || {}).title || ''; }")
    assert "Team policy: forbidden pattern present: ^hostname .*TEST" in page.inner_text("#swChecks")
    assert page.problems == []


# --- (3) a selected error row keeps its red stripe and its red tint ---
def test_selected_error_row_is_never_green(page):
    _real(page)
    ev(page, """() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows; r.switches[1].values.MGMT_IP = 'bad';
        renderAll(); showView('switches'); selectSwitch(r.switches[1].id); }""")
    m = ev(page, """() => { const tr = document.querySelectorAll('#swRows tr[data-row]')[1]; const td = tr.firstElementChild;
        const cs = getComputedStyle(tr); return { cls: tr.className, stripe: getComputedStyle(td).boxShadow, outline: cs.outlineColor, bg: cs.backgroundImage + cs.backgroundColor }; }""")
    assert "row-bad" in m["cls"] and "selected" in m["cls"]
    assert "inset 5px" in m["stripe"] or "5px 0px 0px 0px inset" in m["stripe"], m
    accent = ev(page, "() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")
    assert accent not in m["outline"], m
    assert page.problems == []


# --- (4) Cards: while a gate blocks, a clean row's checks read neutrally beside a muted "blocked" ---
def test_blocked_cards_row_reads_its_checks_neutrally(page):
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 2).rows; renderAll(); showView('cards'); }")
    assert ev(page, "() => current().example === true")
    m = ev(page, """() => { const tr = $('cdRows').querySelector('tr[data-row]'); const st = tr.querySelector('button.cd-status'), g = tr.querySelector('.cd-gate');
        const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
        return { status: st.textContent, gate: g.textContent, gateColor: getComputedStyle(g).color, statusColor: getComputedStyle(st).color, err: getComputedStyle(document.documentElement).getPropertyValue('--err').trim() }; }""")
    assert m["status"].startswith("checks OK") and m["gate"] == "blocked", m
    assert m["gateColor"] == m["statusColor"], m
    assert "Example recipe" in page.inner_text("#cdGates")
    # a real recipe with a baseline: the plain result again
    ev(page, "() => { const r = current(); r.example = false; r.template = r.template.replace(/^! EXAMPLE ONLY[^\\n]*\\n/, '! tested\\n'); baseline = { model: r.model, version: 'x', files: [] }; renderCards(); }")
    assert ev(page, "() => $('cdRows').querySelector('button.cd-status').textContent").startswith("OK")
    assert page.problems == []


# --- (5) Ports dialog: inherited Role selects are dashed and transparent, own values solid ---
def test_ports_dialog_inherited_role_select_is_dashed(page):
    _real(page)
    ev(page, """() => { const r = current(); const rows = countedUpRows(r, [], 2).rows; r.switches = rows;
        rows[1].ports = { 'GigabitEthernet1/3': { role: 'trunk' } }; renderAll(); showView('switches'); openPortsDialog(rows[1]); }""")
    page.wait_for_selector("dialog[open] select[data-attr='role']")
    m = ev(page, """() => [...document.querySelectorAll("dialog[open] select[data-attr='role']")].map((s) => [s.dataset.port, s.classList.contains('inherit'), getComputedStyle(s).borderTopStyle, getComputedStyle(s).fontStyle])""")
    inh = [x for x in m if x[1]]
    own = [x for x in m if not x[1]]
    assert inh and all(x[2] == "dashed" and x[3] == "italic" for x in inh), m
    assert own == [["GigabitEthernet1/3", False, "solid", "normal"]], own
    page.keyboard.press("Escape")
    assert page.problems == []


# --- (6) the checks' jump chevrons: 24 px badges on a whole-line target at least 24 px tall ---
def test_jump_targets_are_at_least_24px(page):
    _real(page)
    ev(page, "() => { const r = current(); r.values.MGMT_IP = '10.20.30.300'; renderAll(); renderPreview(); }")
    m = ev(page, """() => [...$('checks').querySelectorAll('li:has(> button.finding-link)')].map((li) => { const b = li.querySelector('button.finding-link');
        const r = li.getBoundingClientRect(); const cs = getComputedStyle(b, '::after');
        // a press at the far right end of the line (past the badge) still lands on the button
        const hit = document.elementFromPoint(r.right - 2, r.top + r.height / 2);
        return { li: r.height, wide: hit === b || hit === li || b.contains(hit), badge: parseFloat(cs.fontSize) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) }; })""")
    assert m and all(x["li"] >= 24 and x["wide"] and x["badge"] >= 24 for x in m), m
    # a press on the line's far edge runs the jump (the field gets focus)
    r = ev(page, "() => { const li = $('checks').querySelector('li:has(> button.finding-link)'); const r = li.getBoundingClientRect(); return [r.right - 2, r.top + r.height / 2]; }")
    page.mouse.click(*r)
    page.wait_for_timeout(100)
    assert ev(page, "() => document.activeElement.id") == "value_MGMT_IP"
    assert page.problems == []
