"""Tests for v0.8.0: Switches and Cards views, in-page dialogs, clickable checks."""
from helpers import ev


def test_every_check_has_a_location_and_strings_are_unchanged(page):
    r = ev(page, r"""() => {
        const cases = recipes.map((x) => structuredClone(x));
        const bad = structuredClone(recipes[0]); normalizePorts(bad);
        bad.values.MGMT_IP = '192.0.2.0'; bad.values.GATEWAY = '10.0.0.1'; bad.values.SITE = 'München';
        bad.ports[1].role = 'access'; bad.ports[1].vlan = '5000'; bad.ports[2].role = 'routed';
        bad.ports[3].description = 'x'.repeat(201); bad.interfaces.push('Gi9/9/9'); cases.push(bad);
        return cases.map((c) => { normalizePorts(c); const g = generate(c);
          return { e: g.errors, w: g.warnings, fe: g.findings.filter((f) => f.level === 'error').map((f) => f.text),
                   fw: g.findings.filter((f) => f.level === 'warning').map((f) => f.text),
                   kinds: g.findings.map((f) => f.where && f.where.kind),
                   wh: g.findings.map((f) => [f.text.slice(0, 30), f.where]) }; });
    }""")
    allowed = {"field", "port", "ports", "interfaces", "template", "sources", "file"}
    for c in r:
        assert c["fe"] == c["e"] and c["fw"] == c["w"]
        assert all(k in allowed for k in c["kinds"]), c["wh"]
    bad = dict((t, w) for t, w in r[-1]["wh"])
    assert any(w == {"kind": "field", "key": "MGMT_IP"} for w in bad.values())
    assert any(w == {"kind": "field", "key": "GATEWAY"} for w in bad.values())
    assert any(w.get("kind") == "port" and w.get("attr") == "vlan" for w in bad.values())
    assert any(w.get("kind") == "port" and w.get("attr") == "ip" for w in bad.values())
    assert any(w.get("kind") == "file" and w.get("line") for w in bad.values())
    assert any(w.get("kind") == "interfaces" for w in bad.values())


def test_dialog_kit(page):
    from helpers import click_dialog
    page.evaluate("() => { window.__p = showDialog({ title: 'T', body: el('p', {}, 'hello'), actions: [{label: 'A', value: 'a'}, {label: 'B', value: 'b', primary: true}] }); }")
    assert click_dialog(page, "B").startswith("T")
    assert page.evaluate("() => window.__p") == "b"
    assert page.evaluate("() => document.querySelectorAll('dialog').length") == 0
    # Esc -> null
    page.evaluate("() => { window.__p = showDialog({ title: 'T', body: el('p'), actions: [{label: 'A', value: 'a'}] }); }")
    page.wait_for_selector("dialog[open]")
    page.evaluate("() => document.querySelector('dialog').dispatchEvent(new Event('cancel', {cancelable: true}))")
    assert page.evaluate("() => window.__p") is None
    assert page.evaluate("() => document.querySelectorAll('dialog').length") == 0
    # confirmDialog danger
    page.evaluate("() => { window.__p = confirmDialog('Sure?', 'text', { ok: 'Delete', danger: true }); }")
    page.wait_for_selector("dialog[open]")
    assert page.evaluate("() => [...document.querySelectorAll('dialog .dialog-actions button')].find(b => b.textContent === 'Delete').classList.contains('danger')")
    click_dialog(page, "Delete")
    assert page.evaluate("() => window.__p") is True
    page.evaluate("() => { window.__p = confirmDialog('Sure?', 'text'); }")
    click_dialog(page, "Cancel")
    assert page.evaluate("() => window.__p") is False
    # infoDialog
    page.evaluate("() => { window.__p = infoDialog('I', 'x'); }")
    click_dialog(page, "Close")
    assert page.evaluate("() => window.__p") is None
    # writeDialog gate
    page.evaluate(r"() => { window.__p = writeDialog({ title: 'W', summary: 'line1\n\nCancel = no download.', primary: 'Download' }); }")
    page.wait_for_selector("dialog[open]")
    assert page.evaluate("() => document.querySelector('.dlg-summary').textContent") == "line1"
    prim = page.locator("dialog[open] .dialog-actions button", has_text="Download")
    assert prim.is_disabled()
    page.locator("dialog[open] input[type=checkbox]").check()
    assert prim.is_enabled()
    click_dialog(page, "Download")
    assert page.evaluate("() => window.__p") is True
    assert page.evaluate("() => document.querySelectorAll('dialog').length") == 0
