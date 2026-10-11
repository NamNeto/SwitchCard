"""Gauntlet round 7 (visual, ab-r6): the preview cue counts what is on screen, the preview keeps a
useful height with the tips banner, the side-panel preview never cuts a line, the restore dialog
names its safe escape, Replace stands apart, the baseline-labels box shows three lines, and the
grid's Copy and Remove columns fit at 900 px."""
from helpers import ev, click_dialog

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"

# The first and last line blocks wholly inside the preview box, measured on screen (r11: one rule
# for both ends, a line cut by an edge is not counted).
VISIBLE = """(id) => { const pre = $(id); const box = pre.getBoundingClientRect();
    const top = box.top, bottom = box.top + pre.clientHeight + 2;
    const vis = [...pre.querySelectorAll('.pl')].map((b, i) => [i + 1, b.getBoundingClientRect()])
      .filter(([i, r]) => r.top >= top && r.bottom <= bottom).map((x) => x[0]);
    return [vis[0], vis[vis.length - 1], pre.querySelectorAll('.pl').length]; }"""


def _cue(page):
    t = page.text_content("#previewCue")
    m = __import__("re").match(r"Showing lines (\d+)–(\d+) of (\d+)", t)
    return [int(m.group(1)), int(m.group(2)), int(m.group(3))] if m else None


def _real(page, bad_ip=False):
    return ev(page, """([header, bad]) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Packaging hall access switches - tested 2026-10-01');
        if (bad) r.values.MGMT_IP = '10.20.30.300';
        renderAll(); renderPreview(); showView('build'); }""", [HEADER, bad_ip])


# --- (1) the cue is computed from what the box shows, in every state ---
def test_preview_cue_matches_the_visible_lines(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    page.click("#dismissOnboarding")
    _real(page, bad_ip=True)
    # Scrolled to the checks (the pane pins under the header), then at the page top, then in a
    # shorter window, then after scrolling the box itself: the cue follows each time.
    for step in ("checks", "top", "short", "scrolled"):
        if step == "checks":
            ev(page, "() => { const c = $('checks').closest('.card'); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 100); }")
        elif step == "top":
            ev(page, "() => window.scrollTo(0, 0)")
        elif step == "short":
            page.set_viewport_size({"width": 1440, "height": 700})
        else:
            ev(page, "() => { $('preview').scrollTop = 130; }")
        page.wait_for_timeout(150)
        first, last, total = ev(page, VISIBLE, "preview")
        assert _cue(page) == [first, last, total], (step, page.text_content("#previewCue"))
        assert last - first >= 7, (step, first, last)
    assert page.problems == []


# --- (2) the tips banner never squeezes the preview ---
def test_preview_keeps_twelve_lines_with_the_tips_banner(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    ev(page, "() => { showView('build'); window.scrollTo(0, 0); }")
    page.wait_for_timeout(150)
    assert ev(page, "() => !$('onboarding').hidden")
    # Counted in text lines of the font in use (a wider font wraps more lines and the box takes
    # the rows they need), never in rows of an assumed height: 12 lines, or 11 when one row less
    # keeps the pane above the fold.
    first, last, total = ev(page, VISIBLE, "preview")
    assert first == 1 and last - first + 1 >= 11, (first, last)
    rows = ev(page, "() => { const p = $('preview'); const cs = getComputedStyle(p); return (p.clientHeight - parseFloat(getComputedStyle(p, '::before').height)) / parseFloat(cs.lineHeight); }")
    assert rows >= 11 and abs(rows - round(rows)) < 0.01, rows
    # The export button is in view at the top of the page, with the banner showing.
    assert ev(page, "() => $('downloadCard').getBoundingClientRect().bottom <= innerHeight")
    assert page.problems == []


# --- (4) the side-panel preview wraps a wide line instead of cutting it ---
def test_side_preview_wraps_without_cutting(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    _real(page)
    text = ev(page, """() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows;
        renderAll(); showView('switches'); selectSwitch(r.switches[0].id);
        return checkSwitchRows(r, r.switches).rows[0].text; }""")
    assert ev(page, "() => $('swPreview').textContent") == text
    pre = ev(page, "() => { const p = $('swPreview'); return { wide: p.scrollWidth > p.clientWidth + 1,"
                   " wrapped: [...p.querySelectorAll('.pl')].filter((b) => b.getBoundingClientRect().height > 19).length,"
                   " longest: Math.max(...[...p.querySelectorAll('.pl')].map((b) => b.textContent.length)) }; }")
    assert pre["longest"] > 40, "a line wider than the panel"
    assert pre["wrapped"] >= 1 and not pre["wide"], pre
    assert page.problems == []


# --- (8) the restore dialog names its safe escape; Esc is that escape ---
def test_restore_dialog_names_not_now_and_esc_means_it(page):
    ev(page, """() => { const p = JSON.parse(JSON.stringify(projectPayload())); p.recipes[0].name = 'Seeded recipe';
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ format: CONFIG.AUTOSAVE_FORMAT, release: '0.7.2',
          savedAt: new Date().toISOString(), project: p, draft: null })); }""")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("dialog[open]")
    text = page.inner_text("dialog[open]")
    # The secondary button names its outcome; the body says what Esc does once (no duplicate footnote).
    assert "Start with the examples (or Esc) keeps your v0.7.2 work as a backup." in text and "Nothing is deleted." in text
    assert text.count("Nothing is deleted.") == 1 and "Esc =" not in text
    labels = [b.inner_text().strip() for b in page.locator("dialog[open] .dialog-actions button").all()]
    assert labels == ["Start with the examples", "Restore it"]
    page.keyboard.press("Escape")
    page.wait_for_function("bootDone === true")
    assert ev(page, "() => recipes.length") == 4
    assert ev(page, "() => listAutosaveBackups().length") >= 1
    assert page.problems == []


# --- (9, 10) Replace the list stands apart from Cancel and Add to the list; the helpers are normal buttons ---
def test_import_dialog_replace_stands_apart(page):
    _real(page)
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 2).rows; renderAll(); showView('switches'); $('swImport').click(); }")
    page.wait_for_selector("dialog[open] textarea")
    page.fill("dialog[open] textarea", "HOSTNAME,MGMT_IP\nPKG-01,10.20.30.41\n")
    labels = [b.inner_text().strip() for b in page.locator("dialog[open] .dialog-actions button").all()]
    assert labels == ["Replace the list", "Cancel", "Add to the list"]
    cls = ev(page, "() => [...document.querySelectorAll('dialog[open] .dialog-actions button')].map((b) => b.className.trim())")
    assert "aside" in cls[0] and "danger" in cls[0] and "primary" in cls[2]
    # Replace the list sits at the left end, Cancel and Add to the list at the right, with a clear gap between.
    x = ev(page, "() => [...document.querySelectorAll('dialog[open] .dialog-actions button')].map((b) => b.getBoundingClientRect())")
    assert x[1]["x"] - (x[0]["x"] + x[0]["width"]) > 100
    helpers = ev(page, "() => { const row = document.querySelector('dialog[open] .filebutton').parentElement;"
                       " return { even: row.classList.contains('even'), w: document.querySelector('dialog[open] .filebutton').getBoundingClientRect().width }; }")
    assert not helpers["even"] and helpers["w"] < 200
    click_dialog(page, "Cancel")
    assert page.problems == []


# --- (6) Allowed baseline labels: a three-line box beside Model family, top-aligned with its
#         select (round 12: visibly multi-line), growing a line per label beyond ---
def test_allowed_baseline_labels_is_three_lines_that_grow(page):
    ev(page, "() => showView('manage')")
    assert ev(page, "() => $('firmwareRule').rows") == 3
    page.fill("#firmwareRule", "")
    m = ev(page, """() => { const t = $('firmwareRule').getBoundingClientRect(), s = $('recipeModel').getBoundingClientRect();
        return { h: t.height, sh: s.height, sameTop: Math.abs(t.top - s.top) < 2 }; }""")
    assert 78 <= m["h"] <= 84 and m["sameTop"], m
    page.fill("#firmwareRule", "17.12.4\n17.15.1\n17.15.2\n17.15.3\n17.15.4")
    assert ev(page, "() => $('firmwareRule').clientHeight") >= 110
    assert ev(page, "() => getComputedStyle($('firmwareRule')).resize") == "vertical"


# --- (5) at 900 px the grid fits its box, and the selected row's Copy below and Remove are
#         labelled buttons inline under the row (round 8: no per-row icons at any width) ---
def test_grid_row_actions_fit_at_900(page):
    page.set_viewport_size({"width": 900, "height": 900})
    _real(page)
    ids = ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 12).rows; renderAll(); showView('switches'); return r.switches.map((x) => x.id); }")
    page.wait_for_timeout(150)
    assert ev(page, "() => $('swTable').querySelectorAll('td.c-copy, td.c-remove, button.sw-icon').length") == 0
    ev(page, "(id) => selectSwitch(id)", ids[4])
    m = ev(page, """() => { const box = document.querySelector('#switches .scroll'); const d = $('swTable').querySelector('tr.sw-detail');
        const bs = [...d.querySelectorAll('.sw-detail-actions button')];
        return { over: box.scrollWidth - box.clientWidth, labels: bs.map((b) => b.textContent), shown: bs.map((b) => b.getBoundingClientRect().width >= 60),
          inside: bs.every((b) => b.getBoundingClientRect().right <= box.getBoundingClientRect().right) }; }""")
    assert m["over"] <= 0 and m["labels"] == ["Copy below", "Remove"] and all(m["shown"]) and m["inside"], m
    assert page.problems == []


# --- round 8: beside the grid the same two actions sit in the side panel, for the selected row ---
def test_panel_row_actions_act_on_the_selected_switch(page):
    _real(page)
    ids = ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows; renderAll(); showView('switches'); return r.switches.map((x) => x.id); }")
    assert ev(page, "() => $('swPanel').querySelector('.sw-panel-actions').hidden") is True
    ev(page, "(id) => selectSwitch(id)", ids[1])
    assert ev(page, "() => $('swPanel').querySelector('.sw-panel-actions').hidden") is False
    assert ev(page, "() => $('swTable').querySelector('tr.sw-detail')") is None  # no inline row beside the grid
    page.click("#swCopyRow")
    rows = ev(page, "() => current().switches")
    assert len(rows) == 4 and rows[2]["values"] == rows[1]["values"]
    page.click("#swRemoveRow")
    click_dialog(page, "Remove")
    page.wait_for_function("() => current().switches.length === 3")
    assert page.problems == []
