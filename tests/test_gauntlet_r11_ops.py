"""Gauntlet round 11 (operator report ops-r6): focus never falls to <body> after Transliterate or
after Discard (and a general safety net for controls that remove or hide themselves), the status
close control hands focus back, the preview cue counts whole lines (Build and the side panel),
the Ports dialog is clean on Cancel, dialogs survive a failing onOpen and stack by depth, cut gate
messages end at a clause, and cancelled dialogs say so."""
from helpers import ev, click_dialog

HEADER = "! EXAMPLE ONLY - replace with your tested configuration"


def _real(page):
    return ev(page, """(header) => { const r = current(); r.example = false;
        r.template = r.template.replace(header, '! Packaging hall access switches - tested 2026-10-01');
        renderAll(); renderPreview(); showView('build'); }""", HEADER)


# --- D1: Transliterate to ASCII leaves focus on the field it fixed ---
def test_transliterate_focuses_the_fixed_field(page):
    _real(page)
    page.fill("#value_SITE", "München")
    page.wait_for_function("() => !$('asciiFix').hidden")
    page.focus("#fixAscii")
    page.keyboard.press("Enter")
    page.wait_for_function("() => $('asciiFix').hidden")
    assert ev(page, "() => document.activeElement.id") == "value_SITE"
    assert ev(page, "() => $('value_SITE').value") == "Muenchen"
    assert page.problems == []


# --- D2: confirming Discard hands focus to Apply recipe changes; cancelling says so ---
def test_discard_draft_keeps_focus_in_the_apply_bar(page):
    ev(page, "() => showView('manage')")
    page.fill("#template", "! draft\nhostname {{HOSTNAME}}\n")
    page.wait_for_function("() => editorPending === true && !$('discardDraft').hidden")
    page.focus("#discardDraft")
    page.keyboard.press("Enter")
    page.wait_for_selector("dialog[open]")
    page.keyboard.press("Escape")
    page.wait_for_selector("dialog[open]", state="detached")
    assert page.inner_text("#status").startswith("Discard cancelled; the draft is kept.")
    assert ev(page, "() => [document.activeElement.id, editorPending]") == ["discardDraft", True]
    page.keyboard.press("Enter")
    page.wait_for_selector("dialog[open]")
    ev(page, "() => document.querySelector('dialog[open] .dialog-actions button.primary').focus()")
    page.keyboard.press("Enter")
    page.wait_for_selector("dialog[open]", state="detached")
    page.wait_for_function("() => editorPending === false")
    assert ev(page, "() => [document.activeElement.id, $('discardDraft').hidden]") == ["applyRecipe", True]
    assert ev(page, "() => document.activeElement.matches(':focus-visible') || document.activeElement === $('applyRecipe')")
    assert page.problems == []


# --- the safety net: a control that removes or disables itself on activation hands focus on ---
def test_focus_net_moves_focus_from_a_control_that_went_away(page):
    _real(page)
    ev(page, """() => { const box = $('newSwitch').closest('.actions');
        const gone = el('button', { type: 'button', id: 'tGone', onclick: () => gone.remove() }, 'Gone');
        const off = el('button', { type: 'button', id: 'tOff', onclick: () => { off.disabled = true; } }, 'Off');
        const mover = el('button', { type: 'button', id: 'tMover', onclick: () => $('value_SITE').focus() }, 'Mover');
        box.append(gone, off, mover); }""")
    # removed by its own click: focus goes to the first enabled control of its group
    page.focus("#tGone")
    page.keyboard.press("Enter")
    page.wait_for_function("() => !$('tGone') && document.activeElement.id === 'newSwitch'")
    # disabled by its own click: the same
    page.click("#tOff")
    page.wait_for_function("() => $('tOff').disabled && document.activeElement.id === 'newSwitch'")
    # a handler that moves focus itself is left alone (nothing is stolen)
    page.click("#tMover")
    page.wait_for_timeout(60)
    assert ev(page, "() => document.activeElement.id") == "value_SITE"
    # a click on empty page space blurs on purpose: the net does not pull focus back
    ev(page, "() => { $('value_SITE').focus(); document.activeElement.blur(); }")
    page.mouse.click(10, 500)
    page.wait_for_timeout(60)
    assert ev(page, "() => document.activeElement === document.body")
    # typing never triggers it: keys in a text field (each re-renders the preview) leave focus there
    page.focus("#value_SITE")
    page.keyboard.type("x1")
    page.wait_for_timeout(60)
    assert ev(page, "() => document.activeElement.id") == "value_SITE"
    # a render that drops the focused control (a rebuilt panel) is caught too, without a click
    ev(page, "() => { const b = el('button', { type: 'button', id: 'tGone2' }, 'x'); $('newSwitch').after(b); b.focus(); setTimeout(() => b.remove(), 10); }")
    page.wait_for_function("() => !$('tGone2') && document.activeElement.id === 'newSwitch'")
    assert page.problems == []


def test_focus_net_after_a_dialog_whose_opener_is_gone(page):
    _real(page)
    ev(page, """() => { const box = $('newSwitch').closest('.actions');
        const b = el('button', { type: 'button', id: 'tAsk', onclick: async () => { await confirmDialog('Sure?', 'Really.'); b.remove(); } }, 'Ask');
        box.append(b); }""")
    page.focus("#tAsk")
    page.keyboard.press("Enter")
    page.wait_for_selector("dialog[open]")
    page.keyboard.press("Escape")
    page.wait_for_function("() => !$('tAsk') && document.activeElement.id === 'newSwitch'")
    assert page.problems == []


# --- D4: dismissing the status message returns focus to the control that raised it ---
def test_status_close_hands_focus_back(page):
    _real(page)
    page.click("#newSwitch")
    page.wait_for_function("() => !$('status').hidden && !!$('statusClose')")
    page.click("#statusClose")
    page.wait_for_function("() => $('status').hidden")
    assert ev(page, "() => document.activeElement.id") == "newSwitch"
    assert page.problems == []


# --- D6: the cue counts whole lines only, at both ends, in Build and in the side panel ---
WHOLE = """(id) => { const pre = $(id); const box = pre.getBoundingClientRect();
    const top = box.top, bottom = box.top + pre.clientHeight + 2;
    const vis = [...pre.querySelectorAll('.pl')].map((b, i) => [i + 1, b.getBoundingClientRect()])
      .filter(([i, r]) => r.top >= top && r.bottom <= bottom).map((x) => x[0]);
    return [vis[0], vis[vis.length - 1], pre.querySelectorAll('.pl').length]; }"""


def _cue(page, sel):
    m = __import__("re").match(r"Showing lines (\d+)–(\d+) of (\d+)", page.text_content(sel) or "")
    return [int(m.group(1)), int(m.group(2)), int(m.group(3))] if m else None


def test_preview_cue_counts_whole_lines_at_both_ends(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    page.click("#dismissOnboarding")
    _real(page)
    for st in (130, 300, 7):
        ev(page, "(t) => { $('preview').scrollTop = t; }", st)
        page.wait_for_timeout(120)
        first, last, total = ev(page, WHOLE, "preview")
        assert _cue(page, "#previewCue") == [first, last, total], (st, page.text_content("#previewCue"))
        # a line cut by an edge is not counted: the first counted line starts inside the box
        assert ev(page, """(n) => { const b = $('preview').querySelectorAll('.pl')[n - 1].getBoundingClientRect();
            return b.top >= $('preview').getBoundingClientRect().top - 0.5; }""", first)
    assert page.problems == []


def test_side_panel_preview_has_the_same_cue(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    _real(page)
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 3).rows; renderAll(); showView('switches'); selectSwitch(r.switches[1].id); }")
    page.wait_for_function("() => ($('swPreviewCue').textContent || '').startsWith('Showing lines')")
    first, last, total = ev(page, WHOLE, "swPreview")
    assert _cue(page, "#swPreviewCue") == [first, last, total] and first == 1 and last < total
    ev(page, "() => { $('swPreview').scrollTop = 100; }")
    page.wait_for_timeout(120)
    first, last, total = ev(page, WHOLE, "swPreview")
    assert _cue(page, "#swPreviewCue") == [first, last, total] and first > 1
    # no row selected: no cue
    ev(page, "() => selectSwitch(null)")
    page.wait_for_function("() => $('swPreviewCue').textContent === ''")
    assert page.problems == []


# --- Ports dialog: Cancel with nothing typed marks nothing; autosave resumes even if onOpen throws ---
def test_ports_dialog_cancel_without_edits_marks_nothing(page):
    _real(page)
    ev(page, "() => { const r = current(); r.switches = countedUpRows(r, [], 2).rows; renderAll(); showView('switches'); }")
    ev(page, "() => { dirty = false; openPortsDialog(current().switches[0]); }")
    page.wait_for_selector("dialog[open]")
    assert ev(page, "() => autosavePaused") is True
    page.keyboard.press("Escape")
    page.wait_for_selector("dialog[open]", state="detached")
    assert ev(page, "() => [dirty, autosavePaused]") == [False, False]
    assert page.problems == []


def test_dialog_closes_when_onopen_throws(page):
    r = ev(page, """async () => { const p = showDialog({ title: 'Broken', body: el('p', {}, 'x'),
        actions: [{ label: 'Close', value: true }], onOpen: () => { throw new Error('boom'); } });
        const v = await p;
        return [v, document.querySelectorAll('dialog[open]').length, openDialogs.length,
          [...document.body.children].some((n) => n.getAttribute('aria-hidden') === 'true')]; }""")
    assert r == [None, 0, 0, False]
    page.wait_for_timeout(50)
    assert page.problems == ["pageerror: boom"]


def test_stacked_dialogs_layer_by_depth(page):
    ev(page, """() => { showDialog({ title: 'Lower', body: el('p', {}, 'a'), actions: [{ label: 'Close', value: true }] });
        showDialog({ title: 'Upper', body: el('p', {}, 'b'), actions: [{ label: 'Close', value: true }] }); }""")
    page.wait_for_function("() => document.querySelectorAll('dialog[open]').length === 2")
    z = ev(page, "() => [...document.querySelectorAll('.dlg-veil, dialog.dlg')].map((n) => [n.tagName, parseInt(getComputedStyle(n).zIndex, 10)])")
    assert [t for t, _ in z] == ["DIV", "DIALOG", "DIV", "DIALOG"]
    assert z[0][1] < z[1][1] < z[2][1] < z[3][1]
    page.keyboard.press("Escape")
    page.keyboard.press("Escape")
    page.wait_for_function("() => document.querySelectorAll('dialog[open]').length === 0")
    assert page.problems == []


# --- D7: a cut message ends at a clause boundary ---
def test_gate_cut_ends_at_a_clause(page):
    t = "Hostname must be 1-63 characters: letters, digits and hyphens, not starting with a hyphen, and more words here"
    out = ev(page, "(t) => clauseCut(t, 67)", t)
    assert out == "Hostname must be 1-63 characters: letters, digits and hyphens" and len(out) <= 67
    assert ev(page, "() => clauseCut('abcdefghij'.repeat(10), 67)") == "abcdefghij" * 6 + "abcdefg"


# --- D11: a cancelled Clear says so ---
def test_cancelled_clear_says_so(page):
    ev(page, "() => { showView('build'); $('clearAutosave').closest('details').open = true; }")
    page.click("#clearAutosave")
    page.wait_for_selector("dialog[open]")
    page.keyboard.press("Escape")
    page.wait_for_selector("dialog[open]", state="detached")
    assert page.inner_text("#status").startswith("Clear cancelled; nothing was removed.")
    assert page.problems == []
