"""Browser tests for the built SwitchCard.html (pytest + Playwright, Chromium).

Run locally:
    pip install -r requirements-dev.txt
    python -m playwright install chromium
    python -m pytest -q

Regenerate the golden editcontent.txt files after an intended output change:
    python -m pytest -q --update-golden
"""
import json
import pathlib

import pytest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = ROOT / "SwitchCard.html"
GOLDEN = ROOT / "tests" / "golden"



@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def page(browser):
    ctx = browser.new_context()
    pg = ctx.new_page()
    problems = []
    pg.on("pageerror", lambda e: problems.append("pageerror: %s" % e))
    pg.on("console", lambda m: problems.append("console.%s: %s" % (m.type, m.text)) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(HTML.as_uri())
    pg.wait_for_function("typeof generate === 'function' && typeof recipes !== 'undefined'")
    pg.problems = problems
    yield pg
    ctx.close()


def ev(page, expr, *args):
    return page.evaluate(expr, *args)


# ---------------------------------------------------------------- static properties

def test_single_file_no_external_resources():
    html = HTML.read_text(encoding="utf-8")
    assert "connect-src 'none'" in html and "default-src 'none'" in html
    assert "<script src=" not in html and "<link " not in html
    assert "fetch(" not in html and "XMLHttpRequest" not in html
    assert html.endswith("\n") and "\r\n" not in html


def test_release_strings_agree():
    html = HTML.read_text(encoding="utf-8")
    import re
    release = re.search(r'RELEASE: "([0-9.]+)"', html).group(1)
    assert ("SwitchCard v%s" % release) in html
    assert ('/ v%s</span>' % release) in html
    assert ("<strong>%s</strong>" % release) in html
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    assert ("## v%s" % release) in changelog


# ---------------------------------------------------------------- boot and examples

def test_boot_without_errors(page):
    assert page.problems == []
    assert ev(page, "() => recipes.length") == 4
    assert ev(page, "() => $('releaseLabel').textContent") == "/ v" + ev(page, "() => CONFIG.RELEASE")


@pytest.mark.parametrize("index", [0, 1, 2, 3])
def test_golden_example_output(page, index, request):
    text = ev(page, "(i) => { const r = structuredClone(recipes[i]); normalizePorts(r); const g = generate(r); return { text: g.text, errors: g.errors }; }", index)
    assert text["errors"] == []
    path = GOLDEN / ("example-%d.txt" % index)
    if request.config.getoption("--update-golden"):
        GOLDEN.mkdir(exist_ok=True)
        path.write_bytes(text["text"].encode("utf-8"))
    assert path.exists(), "missing golden file; run pytest --update-golden"
    assert text["text"].encode("utf-8") == path.read_bytes()
    assert text["text"].endswith("\r\n") and "\n" not in text["text"].replace("\r\n", "")


def test_preview_equals_generated_text(page):
    assert ev(page, "() => $('preview').textContent === generate(current()).text")


# ---------------------------------------------------------------- management interface

def test_svi_binds_mgmt_vlan_and_sources_follow(page):
    r = ev(page, """() => {
        const r = structuredClone(recipes[0]); normalizePorts(r);
        const keys = deviceKeys(r);
        r.values.MGMT_VLAN = '200';
        const g = generate(r);
        return { keys, errors: g.errors, vlan200: (g.text.match(/Vlan200/g) || []).length, vlan100: /Vlan100/.test(g.text),
                 vlanLine: /\\r\\nvlan 200\\r\\n/.test(g.text) };
    }""")
    assert "MGMT_VLAN" in r["keys"] and "MGMT_LOOPBACK" not in r["keys"]
    assert r["errors"] == [] and r["vlan200"] == 5 and not r["vlan100"] and r["vlanLine"]


def test_loopback_mode_binds_loopback_and_relaxes_svi_rules(page):
    r = ev(page, """() => {
        const r = structuredClone(recipes[3]); normalizePorts(r);
        const g = generate(r);
        const bad = structuredClone(r); bad.values.MGMT_LOOPBACK = 'x';
        const mask24 = structuredClone(r); mask24.values.MGMT_MASK = '255.255.255.0';
        const noRouting = structuredClone(r); noRouting.template = noRouting.template.replace('ip routing\\n!\\n', '').replace('ip route 0.0.0.0 0.0.0.0 {{GATEWAY}}', 'ip default-gateway {{GATEWAY}}');
        const noRouted = structuredClone(r); noRouted.ports[0].role = 'trunk'; noRouted.ports[0].ip = ''; noRouted.ports[0].mask = '';
        return { keys: deviceKeys(r), errors: g.errors, head: /interface Loopback0\\r\\n/.test(g.text),
                 sources: /ntp source Loopback0\\r\\nip radius source-interface Loopback0\\r\\nlogging source-interface Loopback0\\r\\nip ssh source-interface Loopback0/.test(g.text),
                 badErr: generate(bad).errors, mask24: generate(mask24).warnings.filter(w => /MGMT_MASK is \\/24/.test(w)).length,
                 noRouting: generate(noRouting).warnings.filter(w => /Loopback management/.test(w)).length,
                 noRouted: generate(noRouted).warnings.filter(w => /not inside any Routed port subnet/.test(w)).length,
                 confirm: exportConfirmSummary(r, g) };
    }""")
    assert "MGMT_LOOPBACK" in r["keys"] and "MGMT_VLAN" not in r["keys"]
    assert r["errors"] == [] and r["head"] and r["sources"]
    assert any("loopback number" in e for e in r["badErr"])
    assert r["mask24"] == 1 and r["noRouting"] == 2 and r["noRouted"] == 1
    assert "Management interface: Loopback0 (Loopback mode)" in r["confirm"]


def test_hidden_mgmt_vlan_value_never_emits_vlan_line(page):
    assert not ev(page, """() => { const r = structuredClone(recipes[0]); normalizePorts(r);
        r.template = 'hostname {{HOSTNAME}}\\n{{VLANS}}\\n{{PORTS}}\\n'; return /vlan 100/.test(generate(r).text); }""")


def test_derived_placeholders_ignore_typed_values(page):
    assert ev(page, """() => { const r = structuredClone(recipes[0]); normalizePorts(r);
        r.values.MGMT_INTERFACE = 'Vlan1\\nshutdown'; r.values.MGMT_SOURCES = 'evil';
        const t = generate(r).text; return /interface Vlan100\\r\\n/.test(t) && !/evil/.test(t); }""")


# ---------------------------------------------------------------- persistence

def test_schema_v3_project_opens_with_defaults(page):
    r = ev(page, """() => { const p = JSON.parse(JSON.stringify(projectPayload())); p.version = 3;
        for (const x of p.recipes) { delete x.mgmtInterface; delete x.mgmtSources; }
        const v = validateProject(p);
        return { ok: v.recipes.every(x => x.mgmtInterface === 'svi' && typeof x.mgmtSources === 'string'), notes: v._migrationNotes }; }""")
    assert r["ok"] and r["notes"] == []


def test_unknown_mgmt_values_reset_with_notes(page):
    r = ev(page, """() => { const p = JSON.parse(JSON.stringify(projectPayload()));
        p.recipes[0].mgmtInterface = 'bogus'; p.recipes[0].mgmtSources = 5; p.recipes[0].values.MGMT_SOURCES = 'x';
        const v = validateProject(p); return { mode: v.recipes[0].mgmtInterface, notes: v._migrationNotes }; }""")
    assert r["mode"] == "svi" and len(r["notes"]) == 3


def test_future_schema_refused(page):
    msg = ev(page, """() => { try { const p = JSON.parse(JSON.stringify(projectPayload())); p.version = 99; validateProject(p); return ''; } catch (e) { return e.message; } }""")
    assert "Not a supported SwitchCard project" in msg


def test_autosave_round_trip(page):
    r = ev(page, """() => { autosave(); const a = JSON.parse(localStorage.getItem(AUTOSAVE_KEY));
        return { version: a.project.version, n: a.project.recipes.length, release: a.release }; }""")
    assert r["version"] == ev(page, "() => CONFIG.PROJECT_VERSION") and r["n"] == 4


# ---------------------------------------------------------------- presets and ZIP

def test_sku_presets_consistent(page):
    r = ev(page, """() => ({
        groupsOk: SKU_PRESET_GROUPS.every(g => g.keys.every(k => SKU_PRESETS[k] && SKU_PRESET_LABELS[k])),
        labelsOk: Object.keys(SKU_PRESET_LABELS).every(k => SKU_PRESETS[k]) && Object.keys(SKU_PRESETS).every(k => SKU_PRESET_LABELS[k]),
        unique: Object.values(SKU_PRESETS).every(l => new Set(l.map(x => x.toLowerCase())).size === l.length),
        ie9300: Object.entries(SKU_PRESETS).filter(([k]) => k.startsWith('IE-93')).every(([, l]) => l.length === 28 && l[24].endsWith('1/0/25')),
        fam: SKU_PRESET_GROUPS.flatMap(g => g.keys).every(k => interfaceFamilyMismatches({ model: k.startsWith('IE-93') ? 'IE9300' : k.startsWith('IE-31') ? 'IE3100' : 'IE3x00', interfaces: SKU_PRESETS[k] }).length === 0),
    })""")
    assert all(r.values()), r


def test_zip_round_trip(page):
    r = ev(page, """async () => {
        const files = [{ path: 'a/b.txt', blob: new Blob(['hello']) }, { path: 'editcontent.txt', blob: new Blob(['x\\r\\n']) }];
        const z = await zip(files, new Date(2026, 0, 2, 3, 4, 6));
        const back = await unzip(z);
        return { n: back.length, paths: back.map(f => f.path), first: await back[0].blob.text(), size: z.size };
    }""")
    assert r["n"] == 2 and r["paths"] == ["a/b.txt", "editcontent.txt"] and r["first"] == "hello"


def test_sha256_matches_known_vector(page):
    assert ev(page, "() => sha256Hex('abc')") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
