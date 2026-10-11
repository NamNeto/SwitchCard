"""Gauntlet round 11 (visual merge of ab-r10, both critics): the verdict leads the checks box while
a gate blocks, the Cards table spreads with Card ZIP pinned at the row end and a Status column,
blocked rows say why, the review tick is amber, the Ports dialog note stays whole, the gate line
has no stranded comma, a selected error row keeps its red stripe, the import summary names the
rows that inherit, and the row-actions button is labelled."""
from helpers import ev

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _real(page):
    return ev(page, """(header) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Packaging hall access switches - tested 2026-10-01');
        baseline = { model: r.model, version: 'x', files: [{ path: 'a.bin', blob: new Blob(['x']) }] };
        renderAll(); renderPreview(); }""", HEADER)


# --- (1) one verdict: "Export blocked · …" leads, the check result follows, never "Checks passed" ---
def test_verdict_leads_while_a_gate_blocks_and_never_ends_in_a_full_stop(page):
    # example recipe, no baseline (first run): both gates named in the heading
    t = ev(page, "() => { const n = $('checks').querySelector('.notice'); return [n.querySelector('.notice-head').textContent, n.querySelector('.notice-sub').textContent, n.className]; }")
    assert t[0] == "Export blocked · example recipe · no firmware baseline" and t[1] == "Checks: 0 errors · 1 note to review"
    assert "warning" in t[2] and "notice-gated" in t[2]
    # a real recipe with a baseline: "Checks passed · 1 note to review", no full stop, no gate words
    _real(page)
    h = ev(page, "() => $('checks').querySelector('.notice-head').textContent")
    assert h == "Checks passed · 1 note to review" and not h.endswith(".")
    assert ev(page, "() => !$('checks').querySelector('.notice-sub') && !$('checks').querySelector('.notice-gate')")
    assert page.problems == []


# --- (2) the gate line under the Export button is one quiet sentence with one jump back to the
#         checks box (round 12: the checks box is the one list; no second red panel) ---
def test_gate_line_is_one_quiet_sentence_with_one_jump(page):
    _real(page)
    ev(page, "() => { const r = current(); r.values.MGMT_IP = '10.20.30.300'; Object.assign(r.ports[1], { role: 'access', vlan: '5000' }); renderAll(); renderPreview(); }")
    g = ev(page, """() => { const g = $('exportWhy'); return { cls: g.className, text: g.textContent, links: [...g.querySelectorAll('button')].map((b) => b.textContent),
        bg: getComputedStyle(g).backgroundColor, border: getComputedStyle(g).borderLeftWidth }; }""")
    assert "gate-quiet" in g["cls"] and "gate-bad" not in g["cls"], g
    assert g["links"] == ["2 errors above"] and "MGMT_IP" not in g["text"], g
    assert g["bg"] in ("rgba(0, 0, 0, 0)", "transparent") and g["border"] == "0px", g
    assert ev(page, "() => $('checks').querySelectorAll('.notice.error button.finding-link').length") == 2
    page.click("#exportWhy button.gate-jump")
    page.wait_for_timeout(100)
    assert ev(page, "() => $('checks').contains(document.activeElement) && document.activeElement.classList.contains('finding-link')")
    assert page.problems == []


# --- (3) Cards: Status column, Card ZIP at the row end, the table fills its box; blocked rows say why ---
def test_cards_table_spreads_with_card_zip_at_the_row_end(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    _real(page)
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows; renderAll(); showView('cards'); }")
    m = ev(page, """() => { const t = $('cdTable'); const ths = [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim());
        const box = t.parentElement.getBoundingClientRect(), tr = t.querySelector('tbody tr'), b = tr.querySelector('button.cd-card').getBoundingClientRect();
        return { ths, fill: t.getBoundingClientRect().width >= t.parentElement.clientWidth - 4, atEnd: box.right - b.right < 24, gate: !!tr.querySelector('.cd-gate'), title: tr.querySelector('button.cd-card').title }; }""")
    assert m["ths"][3] == "Status" and m["fill"] and m["atEnd"] and not m["gate"]
    assert m["title"] == "Download the SD-card ZIP of this switch"
    # a gate blocks: every row's button is off with the word "blocked" beside it and the gate in its title
    ev(page, "() => { current().example = true; renderAll(); showView('cards'); }")
    g = ev(page, """() => [...$('cdRows').querySelectorAll('tr')].map((tr) => [tr.querySelector('.cd-gate') && tr.querySelector('.cd-gate').textContent,
        tr.querySelector('button.cd-card').disabled, tr.querySelector('button.cd-card').title, tr.querySelector('.cd-gate') && tr.querySelector('.cd-gate').title])""")
    assert len(g) == 3 and all(x[0] == "blocked" and x[1] and x[2].startswith("Export blocked: Example recipe: untick it") and x[3] == x[2] for x in g)
    assert ev(page, "() => $('cdTable').classList.contains('is-blocked')")
    assert page.problems == []


# --- (4) the review tick is an amber caution step, 14 px from its label ---
def test_review_tick_is_amber_with_a_clear_gap(page):
    _real(page)
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 2).rows; renderAll(); showView('cards'); document.querySelector('#cdRows button.cd-card').click(); }")
    page.wait_for_selector("dialog[open] label.review-tick")
    m = ev(page, """() => { const l = document.querySelector('dialog[open] label.review-tick'); const cs = getComputedStyle(l);
        const warn = getComputedStyle(document.documentElement).getPropertyValue('--warn').trim();
        const probe = document.createElement('span'); probe.style.color = warn; document.body.append(probe); const w = getComputedStyle(probe).color; probe.remove();
        const box = l.querySelector('input').getBoundingClientRect(), text = l.querySelector('span').getBoundingClientRect();
        return { left: cs.borderLeftColor === w, gap: text.left - box.right, tint: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' }; }""")
    assert m["left"] and m["gap"] >= 12 and m["tint"], m
    page.keyboard.press("Escape")
    assert page.problems == []


# --- (5) the Ports dialog note is whole on one line, the side panel's preview in view beside it ---
def test_ports_dialog_note_is_not_clipped_and_the_preview_stays_visible(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    _real(page)
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows; renderAll(); showView('switches'); selectSwitch(r.switches[2].id); openPortsDialog(r.switches[2]); }")
    page.wait_for_selector("dialog[open]")
    # The note has its own line above the buttons: one line in Segoe UI, two in a wider font;
    # either way it is never clipped, never runs under a button, and the side panel's preview
    # stays clear of the dialog.
    m = ev(page, """() => { const n = document.querySelector('dialog[open] .dialog-note'); const dlg = document.querySelector('dialog[open]');
        const d = dlg.getBoundingClientRect(); const r = n.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(n).lineHeight) || r.height; const p = $('swPreview').getBoundingClientRect();
        const btns = [...dlg.querySelectorAll('.dialog-actions button')].map((b) => b.getBoundingClientRect());
        return { lines: Math.round(r.height / lh), clipped: n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1,
          inside: r.left >= d.left && r.right <= d.right && r.top >= d.top && r.bottom <= d.bottom,
          overlap: btns.some((b) => b.top < r.bottom - 1 && b.bottom > r.top + 1 && b.left < r.right - 1 && b.right > r.left + 1),
          previewClear: p.left >= d.right - 1 }; }""")
    assert 1 <= m["lines"] <= 2 and not m["clipped"] and m["inside"] and not m["overlap"] and m["previewClear"], m
    page.keyboard.press("Escape")
    assert page.problems == []


# --- (6) a selected error row keeps a 3 px red stripe inside its frame; ⋯ is "Row actions" ---
def test_selected_error_row_keeps_its_red_stripe(page):
    _real(page)
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows; r.switches[1].values.MGMT_IP = '10.20.30.300'; renderAll(); showView('switches'); selectSwitch(r.switches[1].id); }")
    m = ev(page, """() => { const tr = document.querySelectorAll('#swRows tr[data-row]')[1]; const td = tr.querySelector('td');
        return { cls: tr.className, shadow: getComputedStyle(td).boxShadow, outline: getComputedStyle(tr).outlineWidth, more: tr.querySelector('button.sw-more').title }; }""")
    assert "row-bad" in m["cls"] and "selected" in m["cls"] and "inset" in m["shadow"] and "5px" in m["shadow"] and m["outline"] == "2px"
    assert m["more"] == "Row actions"
    assert page.problems == []


# --- (7) Import CSV: the summary names the rows that take a value from Device details ---
def test_import_summary_names_inherited_cells(page):
    _real(page)
    ev(page, "() => { const r = current(); r.values.SITE = 'Packaging hall'; r.switches = countedUpRows(r, [], 2).rows; renderAll(); showView('switches'); $('swImport').click(); }")
    page.wait_for_selector("dialog[open] textarea")
    page.fill("dialog[open] textarea", "HOSTNAME,MGMT_IP,SITE\nPKG-21,10.20.30.41,Line 3\nPKG-22,10.20.30.42,\nPKG-23,10.20.30.43,\n")
    text = page.inner_text("dialog[open]")
    assert "2 rows take SITE from Device details (Packaging hall): rows 2, 3." in text
    assert "HOSTNAME from Device details" not in text
    labels = [b.inner_text().strip() for b in page.locator("dialog[open] .dialog-actions button").all()]
    assert labels == ["Replace the list", "Cancel", "Add to the list"]
    page.fill("dialog[open] textarea", "HOSTNAME,MGMT_IP,SITE\nPKG-21,10.20.30.41,\n")
    assert "Every row takes SITE from Device details (Packaging hall)." in page.inner_text("dialog[open]")
    page.keyboard.press("Escape")
    assert page.problems == []


# --- (8) Allowed baseline labels: a three-line box, top-aligned with Model family (round 12) ---
def test_allowed_labels_box_is_three_lines_beside_model_family(page):
    ev(page, "() => showView('manage')")
    m = ev(page, "() => { const t = $('firmwareRule').getBoundingClientRect(), s = $('recipeModel').getBoundingClientRect(); return [$('firmwareRule').rows, t.height, Math.abs(t.top - s.top) < 2, $('firmwareRule').placeholder]; }")
    assert m[0] == 3 and 78 <= m[1] <= 84 and m[2] and m[3] == "One per line; blank = any"
    assert page.problems == []
