"""Gauntlet round 8 (visual: ab-r7 defects): the preview meter is never covered by the pinned
footer, a team-policy row has a marked status cell, the Ports dialog sits over the content column,
the light veil dims the page, the whole check line is the jump target, and the template editor
ends two lines after its text."""
from helpers import ev

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _real(page):
    ev(page, """(header) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Plant test template'); renderAll(); renderPreview(); }""", HEADER)


# --- (1) "Lines · Bytes" keeps its descenders: the row ends above the pinned footer ---
def test_preview_meter_is_not_covered_by_the_footer(page):
    for h in (900, 760, 650):
        page.set_viewport_size({"width": 1440, "height": h})
        ev(page, "() => { showView('build'); window.scrollTo(0, 0); sizeBuildPane(); }")
        page.wait_for_timeout(100)
        m = ev(page, """() => { const p = document.querySelector('.preview-meter'), f = document.querySelector('.pane-foot');
            const pane = document.querySelector('#build .card.pane');
            return { gap: f.getBoundingClientRect().top - p.getBoundingClientRect().bottom, lh: getComputedStyle(p).lineHeight,
              scrolled: pane.scrollTop, over: pane.scrollHeight - pane.clientHeight }; }""")
        assert m["gap"] >= 0 and m["scrolled"] == 0, (h, m)


# --- (2) a team-policy hit marks the status cell (no single cell is at fault) ---
def test_policy_row_marks_its_status_cell(page):
    _real(page)
    ev(page, """() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows;
        r.switches[1].values.HOSTNAME = 'PKG-TEST-02'; teamPolicies = ['forbid ^hostname .*TEST']; renderAll(); showView('switches'); }""")
    cells = ev(page, "() => [...document.querySelectorAll('#swRows td.status')].map((t) => [t.className, getComputedStyle(t).boxShadow !== 'none'])")
    assert cells[1][0] == "status bad policy" and cells[1][1] is True
    assert cells[0][0] == "status ok" and cells[0][1] is False
    assert page.problems == []


# --- (3) the Ports dialog is placed over the content column, beside the panel ---
def test_ports_dialog_sits_over_the_content_column(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    _real(page)
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows; renderAll(); showView('switches'); openPortsDialog(r.switches[1]); }")
    page.wait_for_selector("dialog[open]")
    m = ev(page, """() => { const d = document.querySelector('dialog[open]').getBoundingClientRect();
        const grid = document.querySelector('#switches .scroll').getBoundingClientRect(), panel = $('swPanel').getBoundingClientRect();
        return { left: d.left, right: d.right, gridLeft: grid.left, panelLeft: panel.left, centred: Math.abs((d.left + d.right) / 2 - (grid.left + grid.right) / 2) }; }""")
    assert m["right"] <= m["panelLeft"] + 1 and m["left"] >= m["gridLeft"] - 1 and m["centred"] < 4, m
    page.keyboard.press("Escape")
    assert page.problems == []


# --- (4) the light veil dims the page clearly ---
def test_light_veil_is_dark_enough(page):
    ev(page, "() => { applyTheme('light'); confirmDialog('Veil?', 'Body.'); }")
    page.wait_for_selector("dialog[open]")
    bg = ev(page, "() => getComputedStyle(document.querySelector('.dlg-veil')).backgroundColor")
    alpha = float(bg.split(",")[-1].strip(" )"))
    assert alpha >= 0.6, bg
    page.keyboard.press("Escape")


# --- (5) the whole check line is the button, with a text-size chevron in the accent colour ---
def test_check_line_is_the_whole_target(page):
    _real(page)
    ev(page, "() => { current().values.MGMT_IP = '10.20.30.300'; renderAll(); renderPreview(); showView('build'); }")
    m = ev(page, """() => { const b = document.querySelector('#checks li > button.finding-link'); const li = b.parentElement;
        const cs = getComputedStyle(b), after = getComputedStyle(b, '::after');
        return { display: cs.display, fills: b.getBoundingClientRect().right >= li.getBoundingClientRect().right - 8, size: parseFloat(after.fontSize) }; }""")
    assert m["display"] == "block" and m["fills"] and m["size"] >= 14, m


# --- (6) the template editor ends two lines after its text; the labels box has its own row ---
def test_template_box_ends_two_lines_after_its_text(page):
    ev(page, "() => showView('manage')")
    page.wait_for_timeout(100)
    m = ev(page, """() => { const t = $('template'); const cs = getComputedStyle(t); const ch = t.clientHeight;
        const h = t.style.height; t.style.height = '0px'; const content = t.scrollHeight; t.style.height = h;
        const natural = t.rows * parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const lab = $('firmwareRule').getBoundingClientRect(), model = $('recipeModel').getBoundingClientRect();
        return { over: ch - content, natural: ch < natural, beside: Math.abs(lab.top - model.top) < 2 }; }""")
    # the box ends with its text (the trailing newline and the editor's spare line are the two lines
    # of room), not at the 24 rows of its attribute; the labels box sits level with Model family
    assert 0 <= m["over"] <= 4 and m["natural"] and m["beside"], m
