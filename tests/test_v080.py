"""Tests for v0.8.0: Switches and Cards views, in-page dialogs, clickable checks."""
from helpers import ev, click_dialog, stub_downloads, downloads


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


def _make_draft(page):
    ev(page, r"""() => { const t = document.getElementById('template');
        t.value = t.value + '\n! draft'; t.dispatchEvent(new Event('input', { bubbles: true })); }""")
    assert ev(page, "() => editorPending") is True


def test_simple_pop_ups_are_in_page_dialogs(page):
    native = []
    page.on("dialog", lambda d: native.append(d.message))
    # delete recipe: Cancel keeps, confirm deletes
    n = ev(page, "() => recipes.length")
    assert n >= 2
    ev(page, "() => { document.getElementById('deleteRecipe').click(); }")
    click_dialog(page, "Cancel")
    page.wait_for_selector("dialog[open]", state="detached")
    assert ev(page, "() => recipes.length") == n
    ev(page, "() => { document.getElementById('deleteRecipe').click(); }")
    click_dialog(page, "Delete recipe")
    page.wait_for_function("(n) => recipes.length === n - 1", arg=n)
    # discard draft
    _make_draft(page)
    ev(page, "() => { document.getElementById('discardDraft').click(); }")
    click_dialog(page, "Discard")
    page.wait_for_function("() => editorPending === false")
    # save project with an unapplied draft
    stub_downloads(page)
    _make_draft(page)
    ev(page, "() => { document.getElementById('saveProject').click(); }")
    click_dialog(page, "Save without the draft")
    page.wait_for_function("() => window.__dl.length === 1")
    assert downloads(page)[0]["name"].startswith("switchcard-project-")
    # port CSV replace
    ev(page, "() => { document.getElementById('portCsv').value = 'something else'; document.getElementById('portCsvFromTable').click(); }")
    click_dialog(page, "Replace")
    page.wait_for_function("() => document.getElementById('portCsv').value !== 'something else'")
    # delete custom SKU preset
    ev(page, """() => { setCustomSkuPresets({ Mine: ['Gi1/0/1', 'Gi1/0/2'] });
        const s = document.getElementById('skuPreset'); s.value = 'custom:Mine';
        document.getElementById('deleteSkuPreset').click(); }""")
    click_dialog(page, "Delete")
    page.wait_for_function("() => !Object.hasOwn(customSkuPresets, 'Mine')")
    # clear autosave
    ev(page, "() => { autosave(); document.getElementById('clearAutosave').click(); }")
    click_dialog(page, "Clear")
    page.wait_for_function("() => Object.keys(localStorage).every((k) => !k.startsWith('switchcard-') || k === CONFIG.LEGACY_AUTOSAVE_READ_KEY)")
    assert native == []


def test_apply_drop_dialog_cancel_and_accept(page):
    native = []
    page.on("dialog", lambda d: native.append(d.message))
    before = ev(page, "() => current().interfaces.slice()")
    assert len(before) > 2
    two = "\n".join(before[:2])

    def edit_and_apply():
        ev(page, """(v) => { const t = document.getElementById('interfaces'); t.value = v;
            t.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('applyRecipe').click(); }""", two)

    edit_and_apply()
    text = click_dialog(page, "Cancel")
    assert "Continue Apply?" in text
    page.wait_for_function("() => document.getElementById('status').textContent.includes('Apply cancelled')")
    assert ev(page, "() => current().interfaces") == before
    edit_and_apply()
    click_dialog(page, "Drop and apply")
    page.wait_for_function("() => current().ports.length === 2")
    assert ev(page, "() => current().interfaces") == before[:2]
    assert native == []


def _seed_old_autosave(page, name="Seeded recipe"):
    # RELEASE is still 0.7.3 on this branch, so an older release triggers the version dialog.
    return ev(page, """(name) => { const p = JSON.parse(JSON.stringify(projectPayload()));
        p.recipes[0].name = name;
        const raw = JSON.stringify({ format: CONFIG.AUTOSAVE_FORMAT, release: '0.7.2',
            savedAt: new Date().toISOString(), project: p, draft: null });
        localStorage.setItem(AUTOSAVE_KEY, raw); return raw; }""", name)


def test_boot_restore_dialog_for_other_version(page):
    native = []
    page.on("dialog", lambda d: native.append(d.message))
    _seed_old_autosave(page)
    page.reload(wait_until="domcontentloaded")
    text = click_dialog(page, "Restore it")
    assert text.startswith("Restore an autosave from v0.7.2?")
    page.wait_for_function("bootDone === true")
    assert ev(page, "() => recipes.some((r) => r.name === 'Seeded recipe')")
    _seed_old_autosave(page, "Second seed")
    page.reload(wait_until="domcontentloaded")
    click_dialog(page, "Start with the examples")
    page.wait_for_function("bootDone === true")
    assert ev(page, "() => recipes.length") == 4
    assert not ev(page, "() => recipes.some((r) => r.name === 'Second seed')")
    assert ev(page, "() => listAutosaveBackups().length") >= 1
    assert native == []


def test_boot_dialog_blocks_autosave_until_answered(page):
    raw = _seed_old_autosave(page)
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector("dialog[open]")
    # An edit-triggered autosave request while the boot dialog is open must not write.
    ev(page, "() => touch()")
    page.wait_for_timeout(800)  # longer than CONFIG.AUTOSAVE_DEBOUNCE_MS (400)
    assert ev(page, "() => bootDone") is False
    assert ev(page, "() => localStorage.getItem(AUTOSAVE_KEY)") == raw
    click_dialog(page, "Restore it")
    page.wait_for_function("bootDone === true")
    assert ev(page, "() => autosavePaused") is False


def test_open_project_over_unsaved_work_dialog(page):
    native = []
    page.on("dialog", lambda d: native.append(d.message))
    payload = ev(page, """() => { const p = JSON.parse(JSON.stringify(projectPayload()));
        p.recipes[0].name = 'Opened recipe'; return JSON.stringify(p); }""")
    _make_draft(page)
    names = ev(page, "() => recipes.map((r) => r.name)")
    f = {"name": "p.json", "mimeType": "application/json", "buffer": payload.encode()}
    page.set_input_files("#projectInput", f)
    text = click_dialog(page, "Cancel")
    assert "You have unsaved changes" in text
    page.wait_for_function("() => document.getElementById('status').textContent.includes('Open project cancelled')")
    assert ev(page, "() => recipes.map((r) => r.name)") == names
    assert ev(page, "() => editorPending") is True
    page.set_input_files("#projectInput", f)
    click_dialog(page, "Open and replace")
    page.wait_for_function("() => recipes.some((r) => r.name === 'Opened recipe')")
    assert native == []


def test_export_dialog_requires_review_tick(page):
    ev(page, """() => { recipes[0].example = false; active = recipes[0].id;
        baseline = {model:'IE3100', version:'x', files:[{path:'a.bin', blob:new Blob(['x'])}]};
        renderAll(); renderPreview(); }""")
    assert ev(page, "() => $('downloadCard').disabled") is False
    assert ev(page, "() => $('reviewed')") is None
    stub_downloads(page)
    page.click("#downloadCard")
    page.wait_for_selector("dialog[open]")
    assert "editcontent.txt SHA-256" in page.inner_text("dialog[open]")
    assert page.is_disabled("dialog[open] .dialog-actions button.primary") or \
        page.locator("dialog[open] .dialog-actions button", has_text="Download ZIP").is_disabled()
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIP")
    page.wait_for_function("() => document.getElementById('status').textContent.includes('SD-card ZIP exported')")
    d = downloads(page)
    assert len(d) == 1 and d[0]["name"].endswith(".zip")


# --- Task 7: switch-list engine (09c-switches.js) ---

def test_switch_rows_inherit_override_and_match_fleet_csv(page):
    r = ev(page, r"""() => {
        const r = structuredClone(recipes[0]); normalizePorts(r);
        const csv = 'HOSTNAME,MGMT_IP,Gi1/2 role,Gi1/2 vlan\nA-01,192.0.2.11,access,10\nA-02,,,\n';
        const parsed = switchRowsFromCsv(r, csv);
        const res = checkSwitchRows(r, parsed.rows);
        const old = checkFleet(r, csv);
        return { errors: parsed.errors, n: parsed.rows.length, ids: parsed.rows.map((x) => /^sw-/.test(x.id)),
          rows: parsed.rows.map((x) => ({ values: x.values, ports: x.ports })),
          same: res.rows.map((x, i) => x.text === old.rows[i].text), oldN: old.rows.length,
          inh2: res.rows[1].inherited, own1: res.rows[0].own, t1: res.rows[0].text,
          errs: res.rows.map((x) => x.errors), fnd: res.rows.map((x) => x.findings.length),
          host2: res.rows[1].host, ip2: res.rows[1].ip, decode: parsed.decodeProblems,
          oldKeys: Object.keys(old.rows[0]).sort(), portCells: old.rows.map((x) => x.portCells.length) };
    }""")
    assert r["errors"] == [] and r["n"] == 2 and all(r["ids"])
    assert r["rows"][0] == {"values": {"HOSTNAME": "A-01", "MGMT_IP": "192.0.2.11"},
                            "ports": {"GigabitEthernet1/2": {"role": "access", "vlan": "10"}}}
    assert r["rows"][1] == {"values": {"HOSTNAME": "A-02"}, "ports": {}}
    assert r["oldN"] == 2 and r["same"] == [True, True]
    assert "MGMT_IP" in r["inh2"] and "HOSTNAME" not in r["inh2"] and "HOSTNAME" in r["own1"]
    assert " switchport access vlan 10" in r["t1"]
    assert r["errs"] == [[], []] and r["host2"] == "A-02" and r["ip2"] == "192.0.2.10" and r["decode"] == 0
    assert r["portCells"] == [2, 0]
    for k in ["n", "values", "inherited", "portCells", "host", "ip", "errors", "policy", "warnings", "text", "sha256", "lines", "bytes", "recipe"]:
        assert k in r["oldKeys"]


def test_switch_rows_findings_locate_port_errors_and_duplicates(page):
    r = ev(page, r"""() => {
        const r = structuredClone(recipes[0]); normalizePorts(r);
        const rows = [
          { id: 'sw-a', values: { HOSTNAME: 'A-01' }, ports: { 'GigabitEthernet1/2': { role: 'edge' }, 'Gi9/9': { description: 'x' } } },
          { id: 'sw-b', values: { HOSTNAME: 'a-01' }, ports: {} },
        ];
        const a = checkSwitchRows(r, rows);
        const b = checkSwitchRows(r, rows);
        return { e: a.rows.map((x) => x.errors), f: a.rows.map((x) => x.findings.filter((f) => f.level === 'error').map((f) => [f.text, f.where])),
                 same: b.rows[0].text === a.rows[0].text && b.rows[1].errors.length === a.rows[1].errors.length,
                 untouched: r.ports.find((p) => p.name === 'GigabitEthernet1/2').role, values: r.values.HOSTNAME };
    }""")
    assert 'GigabitEthernet1/2: role "edge" must be one of' in r["e"][0][0]
    assert "Gi9/9: not in the port table." in r["e"][0]
    ports = {t: w for t, w in r["f"][0]}
    assert ports["Gi9/9: not in the port table."] == {"kind": "port", "name": "Gi9/9", "attr": "description"}
    assert "duplicate HOSTNAME (also row 1)" in r["e"][1]
    assert ["duplicate HOSTNAME (also row 1)", {"kind": "row", "key": "HOSTNAME"}] in r["f"][1]
    assert r["same"] and r["untouched"] != "edge" and r["values"] == "IE3100-DEMO-01"


def test_csv_round_trip(page):
    r = ev(page, r"""() => {
        const r = structuredClone(recipes[0]); normalizePorts(r);
        const csv = 'MGMT_IP,HOSTNAME,Gi1/3 description,Gi1/2 role,Gi1/2 vlan,GATEWAY\n' +
          '192.0.2.11,A-01,"HMI, line 1",access,10,\nA,A-02,,,,192.0.2.254\n,A-03,,,,\n';
        const p1 = switchRowsFromCsv(r, csv);
        const out = switchRowsToCsv(r, p1.rows);
        const p2 = switchRowsFromCsv(r, out.text);
        const strip = (rows) => rows.map((x) => ({ values: x.values, ports: x.ports }));
        return { e: [p1.errors, p2.errors], a: strip(p1.rows), b: strip(p2.rows), columns: out.columns };
    }""")
    assert r["e"] == [[], []] and r["a"] == r["b"] and len(r["a"]) == 3
    assert r["columns"][:2] == ["HOSTNAME", "MGMT_IP"]
    assert r["columns"][-3:] == ["GigabitEthernet1/2 role", "GigabitEthernet1/2 vlan", "GigabitEthernet1/3 description"]
    assert r["a"][0]["ports"]["GigabitEthernet1/3"] == {"description": "HMI, line 1"}


def test_counted_up_rows(page):
    r = ev(page, r"""() => {
        const r = structuredClone(recipes[0]); normalizePorts(r);
        const a = countedUpRows(r, [], 3);
        const b = countedUpRows(r, a.rows, 2);
        const edge = countedUpRows(r, [{ id: 'sw-x', values: { HOSTNAME: 'EDGE' }, ports: {} }], 1);
        const many = Array.from({ length: 499 }, (_, i) => ({ id: 'sw-' + i, values: {}, ports: {} }));
        const full = countedUpRows(r, many, 2);
        const zero = countedUpRows(r, [], 0);
        const one = countedUpRows(r, [], 1);
        return { a: a.rows.map((x) => [x.values.HOSTNAME, x.values.MGMT_IP, Object.keys(x.values).length, /^sw-/.test(x.id)]),
                 b: b.rows.map((x) => [x.values.HOSTNAME, x.values.MGMT_IP]), edge: edge.error, full: full.error, fullRows: full.rows,
                 zero: zero.error, one: one.rows && one.rows.map((x) => x.values) };
    }""")
    assert r["a"] == [["IE3100-DEMO-01", "192.0.2.10", 2, True], ["IE3100-DEMO-02", "192.0.2.11", 2, True], ["IE3100-DEMO-03", "192.0.2.12", 2, True]]
    assert r["b"] == [["IE3100-DEMO-04", "192.0.2.13"], ["IE3100-DEMO-05", "192.0.2.14"]]
    assert "does not end in a number" in r["edge"]
    assert r["full"] and r["fullRows"] is None
    assert r["zero"]
    assert r["one"] == [{"HOSTNAME": "IE3100-DEMO-01", "MGMT_IP": "192.0.2.10"}]


def test_counted_up_rows_messages_name_the_last_row(page):
    r = ev(page, r"""() => {
        const r = structuredClone(recipes[0]); normalizePorts(r);
        return countedUpRows(r, [{ id: 'sw-x', values: { MGMT_IP: 'bad' }, ports: {} }], 1).error;
    }""")
    assert "in the last row" in r and "Device details" not in r


def test_export_state(page):
    r = ev(page, r"""() => {
        const r = structuredClone(recipes[0]); normalizePorts(r); r.exports = {};
        const g = generate(r);
        const s1 = exportState(r, 'IE3100-DEMO-01', sha256Hex(g.text)).state;
        recordExport(r, 'IE3100-DEMO-01', g.text);
        const cur = exportState(r, 'ie3100-demo-01', sha256Hex(g.text));
        const s3 = exportState(r, 'IE3100-DEMO-01', sha256Hex(g.text + 'x')).state;
        const empty = exportState(r, '', sha256Hex(g.text)).state;
        const nh = structuredClone(r); nh.template = nh.template.replace('hostname {{HOSTNAME}}\n', '');
        const s4 = exportState(nh, 'IE3100-DEMO-01', sha256Hex(g.text)).state;
        return { s1, s2: cur.state, at: !!cur.at, entry: cur.entry && cur.entry.host, s3, empty, s4 };
    }""")
    assert r == {"s1": "new", "s2": "current", "at": True, "entry": "IE3100-DEMO-01", "s3": "changed", "empty": "nohost", "s4": "nohost"}


def test_switch_row_cache_invalidates_on_recipe_and_row_changes(page):
    r = ev(page, r"""() => {
        const r = structuredClone(recipes[0]); normalizePorts(r);
        const rows = [{ id: 'sw-a', values: { HOSTNAME: 'A-01' }, ports: {} }];
        const t0 = checkSwitchRows(r, rows).rows[0].text;
        const p = structuredClone(r); delete p.roles.access;
        const sr = switchRowRecipe(p, rows[0]); generate(sr.rr);
        const rolesWritten = p.roles.access !== undefined || sr.rr.roles === p.roles;
        r.provenanceComments = true; r.name = 'Name AAAA';
        const t1 = checkSwitchRows(r, rows).rows[0].text;
        r.name = 'Name BBBB';
        const t2 = checkSwitchRows(r, rows).rows[0].text;
        r.template = r.template.replace('description MANAGEMENT', 'description MGMT-NEW');
        const t3 = checkSwitchRows(r, rows).rows[0].text;
        rows[0].values.HOSTNAME = 'A-02';
        const t4 = checkSwitchRows(r, rows).rows[0].text;
        return { rolesWritten, d01: t0 !== t1, d12: t1 !== t2, b2: t2.includes('Name BBBB'),
                 d23: t2 !== t3, n3: t3.includes('MGMT-NEW'), d34: t3 !== t4, h4: t4.includes('hostname A-02') };
    }""")
    assert r == {"rolesWritten": False, "d01": True, "d12": True, "b2": True, "d23": True, "n3": True, "d34": True, "h4": True}


# --- Task 8: switch list in project files, recipe operations, interface changes ---

_ROWS = r"""[{ id: 'sw-1', values: { HOSTNAME: 'A-01', MGMT_IP: '192.0.2.11' },
    ports: { 'GigabitEthernet1/2': { role: 'access', vlan: '10' } } },
  { id: 'sw-2', values: {}, ports: {} }]"""


def test_switch_list_round_trips_and_is_optional(page):
    native = []
    page.on("dialog", lambda d: native.append(d.message))
    r = ev(page, r"""async () => {
        const p = JSON.parse(JSON.stringify(projectPayload()));
        p.recipes[0].switches = """ + _ROWS + r""";
        const want = JSON.stringify(p.recipes[0].switches);
        const v = validateProject(JSON.parse(JSON.stringify(p)));
        const notes = v._migrationNotes.slice();
        await acceptProject(v, null);
        const back = JSON.stringify(JSON.parse(assertProjectSaveSize(projectPayload())).recipes[0].switches);
        const q = JSON.parse(JSON.stringify(p)); delete q.recipes[0].switches;
        const v2 = validateProject(q);
        const notes2 = v2._migrationNotes.slice();
        await acceptProject(v2, null);
        return { notes, notes2, same: back === want, absent: projectPayload().recipes[0].switches === undefined };
    }""")
    assert r["notes"] == [] and r["notes2"] == []
    assert r["same"] is True and r["absent"] is True
    assert native == []


def test_switch_list_validation_notes(page):
    r = ev(page, r"""() => {
        const base = JSON.parse(JSON.stringify(projectPayload()));
        const p = JSON.parse(JSON.stringify(base));
        p.recipes[0].switches = [
          { id: 'sw-1', values: { HOSTNAME: 'A​-01', INTERFACE: 'x', MGMT_SOURCES: '' },
            ports: { 'GigabitEthernet1/2': { bogus: 'x', role: 'edge', description: 'up​link' } } },
          { id: 'sw-1', values: {}, ports: {} },
          { values: { HOSTNAME: 'C-01' }, ports: {} },
        ];
        const v = validateProject(p);
        const sw = v.recipes[0].switches;
        const refuse = (list) => { const q = JSON.parse(JSON.stringify(base)); q.recipes[0].switches = list;
          try { validateProject(q); return null; } catch (e) { return e.message; } };
        const big = Array.from({ length: CONFIG.MAX_FLEET_ROWS + 1 }, (_, i) => ({ id: 'sw-' + i, values: {}, ports: {} }));
        return { notes: v._migrationNotes, sw,
          r5: refuse(5), rNull: refuse(null), rEntry: refuse([7]), rVals: refuse([{ id: 'a', values: { HOSTNAME: 3 }, ports: {} }]),
          rValsArr: refuse([{ id: 'a', values: ['x'], ports: {} }]),
          rPorts: refuse([{ id: 'a', values: {}, ports: { 'GigabitEthernet1/2': 'access' } }]),
          rAttr: refuse([{ id: 'a', values: {}, ports: { 'GigabitEthernet1/2': { vlan: 10 } } }]),
          rBig: refuse(big),
          rVlan: refuse([{ id: 'a', values: {}, ports: { 'GigabitEthernet1/2': { vlan: '10\n20' } } }]) };
    }""")
    sw = r["sw"]
    assert sw[0]["values"] == {"HOSTNAME": "A-01"}
    assert sw[0]["ports"] == {"GigabitEthernet1/2": {"role": "edge", "description": "uplink"}}
    assert sw[0]["id"] == "sw-1" and sw[1]["id"] != "sw-1" and sw[1]["id"].startswith("sw-")
    assert sw[2]["id"].startswith("sw-") and sw[2]["values"] == {"HOSTNAME": "C-01"}
    notes = "\n".join(r["notes"])
    assert "value HOSTNAME" in notes and "INTERFACE" in notes and "MGMT_SOURCES" in notes
    assert "bogus" in notes and "new id" in notes and "description" in notes
    assert all(n.startswith('Recipe "') for n in r["notes"])
    for k in ["r5", "rNull", "rEntry", "rVals", "rValsArr", "rPorts", "rAttr", "rBig"]:
        assert r[k] == "The project contains an invalid switch list.", (k, r[k])
    assert r["rVlan"] and "control characters" in r["rVlan"] and "GigabitEthernet1/2" in r["rVlan"]


def test_unused_value_kept_but_not_emitted(page):
    r = ev(page, r"""async () => {
        const r = current(); normalizePorts(r);
        const unused = !deviceKeys(r).includes('NTP_SERVER');
        r.switches = [{ id: 'sw-1', values: { HOSTNAME: 'A-01', NTP_SERVER: '10.0.0.5' }, ports: {} }];
        const text = checkSwitchRows(r, r.switches).rows[0].text;
        const v = validateProject(JSON.parse(JSON.stringify(projectPayload())));
        await acceptProject(v, null);
        const saved = JSON.parse(assertProjectSaveSize(projectPayload()));
        const sr = saved.recipes.find((x) => x.id === active);
        return { unused, emitted: text.includes('10.0.0.5'), notes: v._migrationNotes,
          kept: sr.switches[0].values.NTP_SERVER, cols: switchRowsToCsv(current(), current().switches).columns };
    }""")
    assert r["unused"] is True and r["emitted"] is False and r["notes"] == []
    assert r["kept"] == "10.0.0.5"
    assert "NTP_SERVER" not in r["cols"] and "HOSTNAME" in r["cols"]


def _apply_interfaces(page, value):
    ev(page, """(v) => { const t = document.getElementById('interfaces'); t.value = v;
        t.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('applyRecipe').click(); }""", value)


def test_interface_drop_removes_per_switch_settings_on_confirm(page):
    native = []
    page.on("dialog", lambda d: native.append(d.message))
    ev(page, """() => { const r = current(); normalizePorts(r);
        r.switches = [{ id: 'sw-1', values: { HOSTNAME: 'A-01' }, ports: { 'GigabitEthernet1/2': { description: 'x' } } },
                      { id: 'sw-2', values: { HOSTNAME: 'A-02' }, ports: { 'gigabitethernet1/1': { vlan: '20' } } }];
        loadEditor(); }""")
    _apply_interfaces(page, "GigabitEthernet1/1")
    text = click_dialog(page, "Cancel")
    assert "1 switch" in text and "GigabitEthernet1/2" in text
    page.wait_for_function("() => document.getElementById('status').textContent.includes('Apply cancelled')")
    assert ev(page, "() => current().switches[0].ports") == {"GigabitEthernet1/2": {"description": "x"}}
    _apply_interfaces(page, "GigabitEthernet1/1")
    text = click_dialog(page, "Drop and apply")
    assert "1 switch" in text and "GigabitEthernet1/2" in text
    page.wait_for_function("() => current().interfaces.length === 1")
    assert ev(page, "() => current().switches[0].ports") == {}
    # A case-only match is re-keyed to the interface's current spelling.
    assert ev(page, "() => current().switches[1].ports") == {"GigabitEthernet1/1": {"vlan": "20"}}
    assert native == []


def test_apply_lists_unknown_per_switch_settings_alone(page):
    ev(page, """() => { const r = current(); normalizePorts(r);
        r.switches = [{ id: 'sw-1', values: { HOSTNAME: 'A-01' }, ports: { 'Gi9/9': { description: 'x' } } }];
        loadEditor(); }""")
    names = ev(page, "() => current().interfaces.join('\\n')")
    _apply_interfaces(page, names)
    text = click_dialog(page, "Drop and apply")
    assert "1 switch" in text and "Gi9/9" in text
    page.wait_for_function("() => Object.keys(current().switches[0].ports).length === 0")


def test_switch_override_probe_and_align(page):
    r = ev(page, r"""() => {
        const r = { interfaces: ['GigabitEthernet1/1', 'GigabitEthernet1/2'], values: { HOSTNAME: 'DEF' },
          switches: [{ id: 'a', values: { HOSTNAME: 'A-01' }, ports: { 'gigabitethernet1/2': { vlan: '5' }, 'Gi9/9': { role: 'x' } } },
                     { id: 'b', values: {}, ports: { 'GigabitEthernet1/3': { description: 'd' } } }] };
        const probe = probeSwitchOverrideDrops(r, ['GigabitEthernet1/1', 'GigabitEthernet1/2']);
        const keep = alignSwitchOverrides(r, { allowDrop: false });
        const afterKeep = JSON.parse(JSON.stringify(r.switches.map((x) => x.ports)));
        const drop = alignSwitchOverrides(r, { allowDrop: true });
        return { probe, keep, afterKeep, drop, after: r.switches.map((x) => x.ports),
          none: alignSwitchOverrides({ interfaces: [] }, { allowDrop: true }) };
    }""")
    assert r["probe"] == [{"n": 1, "host": "A-01", "name": "Gi9/9"}, {"n": 2, "host": "DEF", "name": "GigabitEthernet1/3"}]
    assert r["keep"] == {"dropped": []}
    assert r["afterKeep"][0] == {"GigabitEthernet1/2": {"vlan": "5"}, "Gi9/9": {"role": "x"}}
    assert r["drop"]["dropped"] == r["probe"]
    assert r["after"] == [{"GigabitEthernet1/2": {"vlan": "5"}}, {}]
    assert r["none"] == {"dropped": []}


def test_open_lists_unmatched_switch_settings(page):
    payload = ev(page, """() => { const p = JSON.parse(JSON.stringify(projectPayload()));
        p.recipes[0].switches = [{ id: 'sw-1', values: {}, ports: { 'Gi9/9': { description: 'x' } } }];
        return JSON.stringify(p); }""")
    f = {"name": "p.json", "mimeType": "application/json", "buffer": payload.encode()}
    page.set_input_files("#projectInput", f)
    text = click_dialog(page, "Drop and continue")
    assert "1 switch" in text and "Gi9/9" in text
    page.wait_for_function("() => recipes[0].switches && Object.keys(recipes[0].switches[0].ports).length === 0")


def test_duplicate_recipe_copies_switches_with_new_ids(page):
    r = ev(page, r"""() => {
        const r = current(); r.switches = """ + _ROWS + r""";
        const orig = JSON.parse(JSON.stringify(r.switches));
        document.getElementById('duplicate').click();
        const c = current();
        return { differs: c.id !== r.id, orig, origNow: r.switches, copy: c.switches };
    }""")
    assert r["differs"] is True and r["origNow"] == r["orig"]
    assert len(r["copy"]) == 2
    for a, b in zip(r["orig"], r["copy"]):
        assert a["values"] == b["values"] and a["ports"] == b["ports"]
        assert a["id"] != b["id"] and b["id"].startswith("sw-")
    assert len({x["id"] for x in r["copy"]}) == 2
