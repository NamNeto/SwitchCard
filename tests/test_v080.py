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
    ev(page, """() => { recipes[0].example = false; recipes[0].template = recipes[0].template.replace('! EXAMPLE ONLY - replace with your tested configuration', '! Plant test template'); active = recipes[0].id;
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
    assert ["duplicate HOSTNAME (also row 2)", {"kind": "row", "key": "HOSTNAME"}] in r["f"][0]
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
            ports: { 'GigabitEthernet1/2': { bogus: 'x', role: 'edge', description: 'up\u200Blink' }, 'GigabitEthernet1/3': { bogus: 'y' } } },
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
          rVlan: refuse([{ id: 'a', values: {}, ports: { 'GigabitEthernet1/2': { vlan: '10\n20' } } }]),
          rVlanName: refuse([{ id: 'a', values: {}, ports: { 'Gi1/2\u202E': { vlan: '1\t2' } } }]) };
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
    assert r["rVlanName"].startswith("Port Gi1/2?:")


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
        r.switches = [{ id: 'sw-1', values: { HOSTNAME: 'A-01' }, ports: { 'GigabitEthernet1/2': { description: 'x' }, 'Gi9/9': { vlan: '7' } } },
                      { id: 'sw-2', values: { HOSTNAME: 'A-02' }, ports: { 'gigabitethernet1/1': { vlan: '20' } } }];
        loadEditor(); }""")
    _apply_interfaces(page, "GigabitEthernet1/1")
    text = click_dialog(page, "Cancel")
    assert "1 switch" in text and "GigabitEthernet1/2" in text and "Gi9/9" not in text
    page.wait_for_function("() => document.getElementById('status').textContent.includes('Apply cancelled')")
    assert ev(page, "() => current().switches[0].ports") == {"GigabitEthernet1/2": {"description": "x"}, "Gi9/9": {"vlan": "7"}}
    _apply_interfaces(page, "GigabitEthernet1/1")
    text = click_dialog(page, "Drop and apply")
    assert "1 switch" in text and "GigabitEthernet1/2" in text
    page.wait_for_function("() => current().interfaces.length === 1")
    # Only the settings on the dropped port go; the unknown Gi9/9 setting stays (a row error).
    assert ev(page, "() => current().switches[0].ports") == {"Gi9/9": {"vlan": "7"}}
    # A case-only match is re-keyed to the interface's current spelling.
    assert ev(page, "() => current().switches[1].ports") == {"GigabitEthernet1/1": {"vlan": "20"}}
    assert native == []


def test_apply_keeps_unknown_per_switch_settings(page):
    ev(page, """() => { const r = current(); normalizePorts(r);
        r.switches = [{ id: 'sw-1', values: { HOSTNAME: 'A-01' }, ports: { 'Gi9/9': { description: 'x' } } }];
        loadEditor(); }""")
    names = ev(page, "() => current().interfaces.join('\\n')")
    _apply_interfaces(page, names)
    page.wait_for_function("() => document.getElementById('status').textContent.includes('Recipe applied')")
    assert ev(page, "() => document.querySelectorAll('dialog').length") == 0
    assert ev(page, "() => current().switches[0].ports") == {"Gi9/9": {"description": "x"}}


def test_switch_override_probe_and_align(page):
    r = ev(page, r"""() => {
        const r = { interfaces: ['GigabitEthernet1/1', 'GigabitEthernet1/2'], values: { HOSTNAME: 'DEF' },
          switches: [{ id: 'a', values: { HOSTNAME: 'A-01' }, ports: { 'gigabitethernet1/2': { vlan: '5' }, 'Gi9/9': { role: 'x' } } },
                     { id: 'b', values: {}, ports: { 'GigabitEthernet1/3': { description: 'd' } } }] };
        const probe = probeSwitchOverrideDrops(r, ['GigabitEthernet1/1', 'GigabitEthernet1/2']);
        const keep = alignSwitchOverrides(r, { allowDrop: false });
        const afterKeep = JSON.parse(JSON.stringify(r.switches.map((x) => x.ports)));
        const listed = alignSwitchOverrides(r, { drop: [{ n: 2, name: 'GigabitEthernet1/3' }] });
        const afterListed = JSON.parse(JSON.stringify(r.switches.map((x) => x.ports)));
        r.switches[1].ports = { 'GigabitEthernet1/3': { description: 'd' } };
        const drop = alignSwitchOverrides(r, { allowDrop: true });
        return { probe, keep, afterKeep, listed, afterListed, drop, after: r.switches.map((x) => x.ports),
          none: alignSwitchOverrides({ interfaces: [] }, { allowDrop: true }) };
    }""")
    assert r["probe"] == [{"n": 1, "host": "A-01", "name": "Gi9/9"}, {"n": 2, "host": "DEF", "name": "GigabitEthernet1/3"}]
    assert r["keep"] == {"dropped": []}
    assert r["afterKeep"][0] == {"GigabitEthernet1/2": {"vlan": "5"}, "Gi9/9": {"role": "x"}}
    assert r["listed"]["dropped"] == [{"n": 2, "host": "DEF", "name": "GigabitEthernet1/3"}]
    assert r["afterListed"] == [{"GigabitEthernet1/2": {"vlan": "5"}, "Gi9/9": {"role": "x"}}, {}]
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


def test_rail_switches_views_and_locks_with_a_draft(page):
    assert page.evaluate("() => document.querySelectorAll('#rail button').length") == 4
    assert page.evaluate("() => document.getElementById('tabs')") is None
    assert page.evaluate("() => document.querySelector('#rail [aria-current=page]').id") == "railBuild"
    ev(page, "() => showView('switches')")
    vis = ev(page, "() => ['build', 'switches', 'cards', 'maintain'].filter((i) => !$(i).hidden)")
    assert vis == ["switches"]
    assert ev(page, "() => document.querySelector('#rail [aria-current=page]').id") == "railSwitches"
    # chips follow the switch list after typing stops
    ev(page, "() => { current().switches = [{ id: 'a', values: { HOSTNAME: 'sw-a' }, ports: {} }, { id: 'b', values: { HOSTNAME: 'sw-a' }, ports: {} }]; renderPreview(); }")
    page.wait_for_timeout(400)
    assert ev(page, "() => $('chipSwitches').textContent") == "2 switches · 2 errors"  # both rows of a duplicate (gauntlet r1, C1)
    assert ev(page, "() => $('chipCards').textContent").endswith("up to date")
    assert ev(page, "() => $('chipManage').textContent") != ""
    # pending draft locks the other views
    ev(page, "() => { showView('manage'); editorPending = true; }")
    assert ev(page, "() => showView('cards')") is False
    assert "Apply" in ev(page, "() => $('status').textContent")
    assert ev(page, "() => $('maintain').hidden") is False
    ev(page, "() => { editorPending = false; }")
    assert ev(page, "() => showView('build')") is True


def _sw_input(row_id, key):
    return '#swRows input[data-row="%s"][data-key="%s"]' % (row_id, key)


def test_switches_grid_add_edit_inherit_keeps_focus(page):
    ev(page, "() => showView('switches')")
    assert ev(page, "() => $('viewTitle').textContent") == "Switches"
    assert "Device details" in ev(page, "() => $('viewSubtitle').textContent")
    assert "Example site" in ev(page, "() => $('swRows').querySelector('tr.defaults').textContent")
    page.fill("#swCount", "3")
    page.click("#swAdd")
    ids = ev(page, "() => current().switches.map((x) => x.id)")
    assert len(ids) == 3
    sel = _sw_input(ids[1], "SITE")
    ev(page, """(s) => { document.querySelector(s).__mark = 1;
        document.querySelectorAll('#swRows td.status').forEach((t) => { t.textContent = 'stale'; }); }""", sel)
    page.click(sel)
    page.keyboard.type("Plant B")
    act = ev(page, "() => { const a = document.activeElement; return [a.__mark, a.dataset.row, a.dataset.key, a.value]; }")
    assert act == [1, ids[1], "SITE", "Plant B"]
    assert ev(page, "() => current().switches[1].values.SITE") == "Plant B"
    st = ev(page, "() => [...document.querySelectorAll('#swRows td.status')].map((t) => t.textContent)")
    assert len(st) == 3 and all(s.startswith("OK") for s in st), st
    cells = ev(page, """(ids) => ids.map((id) => { const i = document.querySelector('#swRows input[data-row="' + id + '"][data-key="SITE"]');
        return [i.placeholder, i.classList.contains('inherit'), i.value]; })""", ids)
    assert cells[0] == ["Example site", True, ""] and cells[2] == ["Example site", True, ""]
    assert cells[1][1] is False
    assert ev(page, "() => swSelectedId") == ids[1]
    assert "Site: Plant B" in ev(page, "() => $('swPreview').textContent")
    # Arrow Down / Enter / Arrow Up move within the column
    page.keyboard.press("ArrowDown")
    assert ev(page, "() => [document.activeElement.dataset.row, document.activeElement.dataset.key]") == [ids[2], "SITE"]
    page.keyboard.press("ArrowUp")
    page.keyboard.press("ArrowUp")
    assert ev(page, "() => document.activeElement.dataset.row") == ids[0]
    page.keyboard.press("Enter")
    assert ev(page, "() => document.activeElement.dataset.row") == ids[1]
    # change trims; clearing a cell deletes the value
    page.fill(sel, "  ")
    page.keyboard.press("Tab")
    assert "SITE" not in ev(page, "() => current().switches[1].values")
    assert page.problems == []


def test_switches_duplicate_flagged_and_cleared(page):
    ev(page, "() => { current().switches = []; showView('switches'); }")
    page.fill("#swCount", "2")
    page.click("#swAdd")
    ids = ev(page, "() => current().switches.map((x) => x.id)")
    host1 = ev(page, "() => current().switches[0].values.HOSTNAME")
    page.fill(_sw_input(ids[1], "HOSTNAME"), host1)
    status = "#swRows tr[data-row='%s'] td.status" % ids[1]
    assert "duplicate HOSTNAME" in page.get_attribute(status, "title")
    assert page.text_content(status) == "1 error · duplicate"  # gauntlet r5: the kind of error under the count
    page.fill(_sw_input(ids[1], "HOSTNAME"), "SW-OTHER-07")
    # the example recipe carries one soft note (no enable secret), so OK shows "OK · 1 note"
    assert page.inner_text(status) in ("OK", "OK · 1 note")
    assert "duplicate" not in page.get_attribute(status, "title")
    # Copy makes an exact copy (flagged), Remove asks first
    ev(page, "(id) => selectSwitch(id)", ids[1])
    page.click("#swCopyRow")
    rows = ev(page, "() => current().switches")
    assert len(rows) == 3 and rows[2]["values"] == rows[1]["values"] and rows[2]["id"] not in ids
    assert "duplicate HOSTNAME" in page.get_attribute("#swRows tr[data-row='%s'] td.status" % rows[2]["id"], "title")
    ev(page, "(id) => selectSwitch(id)", rows[2]["id"])
    page.click("#swRemoveRow")
    click_dialog(page, "Cancel")
    assert ev(page, "() => current().switches.length") == 3
    page.click("#swRemoveRow")
    click_dialog(page, "Remove")
    page.wait_for_function("() => current().switches.length === 2")
    page.click("#swRemoveAll")
    click_dialog(page, "Remove all")
    page.wait_for_function("() => current().switches.length === 0")
    assert ev(page, "() => $('swEmpty').hidden") is False


def test_switches_add_counted_up_error_adds_nothing(page):
    ev(page, "() => { current().values.HOSTNAME = 'NO-NUMBER'; current().switches = []; showView('switches'); }")
    page.fill("#swCount", "3")
    page.click("#swAdd")
    assert ev(page, "() => current().switches.length") == 0
    assert "does not end in a number" in ev(page, "() => $('status').textContent")


def test_import_dialog_replace_add_and_decode_warning(page):
    ev(page, "() => showView('switches')")
    page.click("#swImport")
    page.wait_for_selector("dialog[open]")
    assert "Columns for this recipe" in page.inner_text("dialog[open]")
    assert "HOSTNAME" in ev(page, "() => document.querySelector('dialog[open] textarea').placeholder")
    page.set_input_files("dialog[open] input[type=file]",
                         {"name": "a.csv", "mimeType": "text/csv", "buffer": b"HOSTNAME,SITE\nA-01,M\xfcnchen\n"})
    page.wait_for_function("() => document.querySelector('dialog[open]').textContent.includes('could not be read as UTF-8')")
    assert "1 cell" in page.inner_text("dialog[open]")
    # errors disable Replace / Add after
    page.fill("dialog[open] textarea", "foo bar\n1\n")
    assert ev(page, "() => [...document.querySelectorAll('dialog[open] .dialog-actions button')].filter((b) => b.disabled).length") == 2
    page.fill("dialog[open] textarea", "HOSTNAME,SITE,NOPE,Gi1/3 description\nA-01,Plant,x,uplink\nA-02,,,\n")
    text = page.inner_text("dialog[open]")
    assert "2 rows" in text and "NOPE" in text and "GigabitEthernet1/3 description" in text
    click_dialog(page, "Replace")
    rows = ev(page, "() => current().switches")
    assert [r["values"] for r in rows] == [{"HOSTNAME": "A-01", "SITE": "Plant"}, {"HOSTNAME": "A-02"}]
    assert rows[0]["ports"] == {"GigabitEthernet1/3": {"description": "uplink"}} and rows[1]["ports"] == {}
    assert ev(page, "() => document.querySelectorAll('#swRows tr[data-row]').length") == 2
    page.click("#swImport")
    page.wait_for_selector("dialog[open]")
    page.click("dialog[open] button:text-is('Start from template')")
    assert ev(page, "() => document.querySelector('dialog[open] textarea').value").startswith("HOSTNAME,")
    page.fill("dialog[open] textarea", "HOSTNAME\nA-03\n")
    click_dialog(page, "Add after")
    assert ev(page, "() => current().switches.map((x) => x.values.HOSTNAME)") == ["A-01", "A-02", "A-03"]
    # Export CSV and CSV template downloads (BOM + CRLF)
    stub_downloads(page)
    # Blob.text() drops a UTF-8 byte-order mark, so record the first bytes as well
    ev(page, """() => { const inner = download; window.__bom = [];
        download = (blob, name) => { window.__dlPending.push(blob.slice(0, 3).arrayBuffer().then((b) => window.__bom.push([...new Uint8Array(b)])));
          inner(blob, name); }; }""")
    page.click("#swExport")
    page.select_option("#swTemplateMode", "none")
    page.click("#swTemplate")
    d = downloads(page)
    assert ev(page, "() => window.__bom") == [[0xEF, 0xBB, 0xBF]] * 2
    assert d[0]["name"].startswith("switchcard-switches-") and d[0]["name"].endswith(".csv")
    assert d[0]["text"].startswith("HOSTNAME,") and "\r\nA-01," in d[0]["text"]
    assert "GigabitEthernet1/3 description" in d[0]["text"].split("\r\n")[0]
    assert d[1]["name"].startswith("switchcard-fleet-template-")
    assert d[1]["text"].startswith("HOSTNAME,") and "description" not in d[1]["text"]


def test_ports_dialog_overrides_and_use_table(page):
    ev(page, """() => { current().switches = [{ id: 'sw-a', values: { HOSTNAME: 'A-01' }, ports: { 'Gi9/9': { description: 'x' } } }];
        showView('switches'); }""")
    page.click("#swRows tr[data-row='sw-a'] button.sw-ports")
    page.wait_for_selector("dialog[open]")
    dlg = "dialog[open] "
    assert "Gi9/9" in page.inner_text("dialog[open]")
    desc = dlg + "input[data-port='GigabitEthernet1/3'][data-attr='description']"
    base = ev(page, "() => current().ports.find((p) => p.name === 'GigabitEthernet1/3')")
    assert page.get_attribute(desc, "placeholder") == base["description"]
    assert ev(page, "(s) => document.querySelector(s).classList.contains('inherit')", desc) is True
    page.fill(desc, "own text")
    assert ev(page, "() => current().switches[0].ports['GigabitEthernet1/3']") == {"description": "own text"}
    role = dlg + "select[data-port='GigabitEthernet1/2'][data-attr='role']"
    assert ev(page, "(s) => document.querySelector(s).classList.contains('inherit')", role) is True
    page.select_option(role, "routed")
    ip = dlg + "input[data-port='GigabitEthernet1/2'][data-attr='ip']"
    mask = dlg + "input[data-port='GigabitEthernet1/2'][data-attr='mask']"
    page.fill(ip, "10.9.9.1")
    page.fill(mask, "255.255.255.252")
    assert ev(page, "() => current().switches[0].ports['GigabitEthernet1/2']") == {"role": "routed", "ip": "10.9.9.1", "mask": "255.255.255.252"}
    page.select_option(role, "access")
    assert ev(page, "() => current().switches[0].ports['GigabitEthernet1/2']") == {"role": "access"}
    # gauntlet r2: a port that is not Routed has no address cell at all (the IP/Mask columns show only while a port is Routed)
    assert ev(page, "(s) => document.querySelector(s)", ip) is None
    page.click(dlg + "button.use-table[data-port='GigabitEthernet1/2']")
    assert "GigabitEthernet1/2" not in ev(page, "() => current().switches[0].ports")
    page.click(dlg + "button.remove-unknown[data-port='Gi9/9']")
    assert ev(page, "() => current().switches[0].ports") == {"GigabitEthernet1/3": {"description": "own text"}}
    click_dialog(page, "Done")  # gauntlet r6: the Ports dialog closes with Done (Cancel reverts)
    assert page.inner_text("#swRows tr[data-row='sw-a'] button.sw-ports") == "1 override"
    # focus option
    ev(page, "() => { openPortsDialog(current().switches[0], { name: 'GigabitEthernet1/3', attr: 'vlan' }); }")
    page.wait_for_selector("dialog[open]")
    assert ev(page, "() => [document.activeElement.dataset.port, document.activeElement.dataset.attr]") == ["GigabitEthernet1/3", "vlan"]
    click_dialog(page, "Done")  # gauntlet r6: the Ports dialog closes with Done (Cancel reverts)


def test_switches_follow_template_changes(page):
    ev(page, """() => { current().switches = [{ id: 'sw-a', values: { HOSTNAME: 'A-01', NTP_SERVER: '10.0.0.5' }, ports: {} }];
        showView('switches'); }""")
    assert ev(page, "() => !!document.querySelector('#swHead th[data-key=NTP_SERVER]')") is False

    def set_template(t):
        ev(page, """(t) => { showView('manage'); const el = document.getElementById('template'); el.value = t;
            el.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('applyRecipe').click(); }""", t)
        page.wait_for_function("() => !editorPending")
        ev(page, "() => showView('switches')")

    orig = ev(page, "() => current().template")
    set_template(orig.replace("\nend\n", "\nntp server {{NTP_SERVER}}\nend\n"))
    assert ev(page, "() => document.querySelector('#swHead th[data-key=NTP_SERVER]').textContent") == "NTP SERVER"
    assert page.input_value(_sw_input("sw-a", "NTP_SERVER")) == "10.0.0.5"
    set_template(orig)
    assert ev(page, "() => !!document.querySelector('#swHead th[data-key=NTP_SERVER]')") is False
    assert ev(page, "() => current().switches[0].values.NTP_SERVER") == "10.0.0.5"


def test_switches_team_policy_hit_is_an_error(page):
    ev(page, """() => { teamPolicies = ['forbid ^hostname A-01$']; current().switches = [
        { id: 'sw-a', values: { HOSTNAME: 'A-01' }, ports: {} }, { id: 'sw-b', values: { HOSTNAME: 'A-02', MGMT_IP: '192.0.2.77' }, ports: {} }];
        showView('switches'); }""")
    status = "#swRows tr[data-row='sw-a'] td.status"
    assert page.text_content(status) == "1 error · policy"  # gauntlet r6: the kind of error under the count
    assert ev(page, "(s) => document.querySelector(s).classList.contains('bad')", status) is True
    assert "Team policy: forbidden pattern present" in page.get_attribute(status, "title")
    page.click("#swRows tr[data-row='sw-a'] td.num")
    assert ev(page, "() => [...$('swChecks').querySelectorAll('li.bad')].some((li) => li.textContent.startsWith('Team policy'))") is True
    page.wait_for_function("() => $('chipSwitches').textContent === '2 switches · 1 error'")


def test_switches_minor_fixes_role_and_trim(page):
    ev(page, "() => { current().switches = [{ id: 'sw-a', values: {}, ports: {} }]; showView('switches'); }")
    page.fill(_sw_input("sw-a", "MGMT_IP"), " 192.0.2.50 ")
    assert ev(page, "() => current().switches[0].values.MGMT_IP") == "192.0.2.50"
    page.fill(_sw_input("sw-a", "SITE"), "Plant B ")
    assert ev(page, "() => current().switches[0].values.SITE") == "Plant B "  # trimmed on change, not while typing
    base = ev(page, "() => current().ports.find((p) => p.name === 'GigabitEthernet1/2').role")
    other = "routed" if base != "routed" else "access"
    ev(page, "() => { openPortsDialog(current().switches[0]); }")
    page.wait_for_selector("dialog[open]")
    role = "dialog[open] select[data-port='GigabitEthernet1/2'][data-attr='role']"
    page.select_option(role, other)
    assert ev(page, "() => current().switches[0].ports['GigabitEthernet1/2'].role") == other
    page.select_option(role, base)
    assert "GigabitEthernet1/2" not in ev(page, "() => current().switches[0].ports")
    assert ev(page, "(s) => document.querySelector(s).classList.contains('inherit')", role) is True
    click_dialog(page, "Done")  # gauntlet r6: the Ports dialog closes with Done (Cancel reverts)


# --- Task 11: Cards view ---

def _cards_setup(page, n=3):
    """Synthetic baseline, example=false and n counted-up rows; opens the Cards view."""
    ev(page, """(n) => { const r = current(); r.example = false; r.template = r.template.replace('! EXAMPLE ONLY - replace with your tested configuration', '! Plant test template');
        baseline = {model: r.model, version: 'x', files: [{path: 'a.bin', blob: new Blob(['x'])}]};
        r.switches = countedUpRows(r, [], n).rows; r.exports = {};
        renderAll(); renderPreview(); showView('cards'); }""", n)
    return ev(page, "() => current().switches.map((x) => x.id)")


def _cd_row(row_id, sel=""):
    return ("#cdRows tr[data-row='%s'] " % row_id) + sel


def _zip_names(d):
    return sorted(x["name"] for x in d)


def test_cards_single_and_all_exports_record_history(page):
    ids = _cards_setup(page)
    assert ev(page, "() => $('cdRows').querySelectorAll('tr[data-row]').length") == 3
    assert "Ready to export 3 cards." in page.inner_text("#cdGates")
    assert page.inner_text(_cd_row(ids[1], "td.cd-last")) == "not exported"
    assert page.inner_text("#cdChanged") == "Changed and not exported (3)"
    stub_downloads(page)
    rel = ev(page, "() => RELEASE")
    page.click(_cd_row(ids[1], "button.cd-card"))
    page.wait_for_selector("dialog[open]")
    assert "IE3100-DEMO-02" in page.inner_text("dialog[open]")
    assert page.locator("dialog[open] .dialog-actions button", has_text="Download ZIP").is_disabled()
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIP")
    page.wait_for_function("() => (window.__dl || []).length === 1")
    assert downloads(page)[0]["name"] == "IE3100-DEMO-02-switchcard-%s-sdcard.zip" % rel
    page.wait_for_function("(s) => document.querySelector(s).textContent.startsWith('up to date')", arg=_cd_row(ids[1], "td.cd-last"))
    assert ev(page, "() => Object.keys(current().exports)") == ["ie3100-demo-02"]
    assert page.inner_text("#cdChanged") == "Changed and not exported (2)"
    # status button opens Switches with the row selected
    page.click(_cd_row(ids[0], "button.cd-status"))
    assert ev(page, "() => [currentView, swSelectedId]") == ["switches", ids[0]]
    ev(page, "() => { showView('cards'); window.__dl = []; window.__dlPending = []; }")
    page.click("#cdAll")
    page.wait_for_selector("dialog[open]")
    text = page.inner_text("dialog[open]")
    assert "IE3100-DEMO-01" in text and "IE3100-DEMO-03" in text
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIPs")
    page.wait_for_function("() => (window.__dl || []).length === 4", timeout=10000)
    assert _zip_names(downloads(page)) == sorted(
        ["IE3100-DEMO-0%d-switchcard-%s-sdcard.zip" % (i, rel) for i in (1, 2, 3)] + ["switchcard-fleet-%s-manifest.txt" % rel])
    page.wait_for_function("() => $('cdChanged').textContent === 'Changed and not exported (0)'")
    assert page.is_disabled("#cdChanged")
    assert page.problems == []


def test_changed_only_after_template_edit(page):
    ids = _cards_setup(page)
    stub_downloads(page)
    page.click("#cdAll")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIPs")
    page.wait_for_function("() => (window.__dl || []).length === 4", timeout=10000)
    page.wait_for_function("() => $('cdChanged').textContent === 'Changed and not exported (0)'")
    # only row 3's SITE changes
    ev(page, "() => { current().switches[2].values.SITE = 'Plant C'; touch(); renderPreview(); }")
    page.wait_for_function("() => $('cdChanged').textContent === 'Changed and not exported (1)'")
    assert page.is_enabled("#cdChanged")
    assert page.inner_text(_cd_row(ids[2], "button.cd-diff")) == "changed"
    assert page.inner_text(_cd_row(ids[2], "td.cd-last")).startswith("changed since")
    page.click(_cd_row(ids[2], "button.cd-diff"))
    page.wait_for_selector("dialog[open]")
    assert "Plant C" in page.inner_text("dialog[open]")
    click_dialog(page, "Close")
    ev(page, "() => { window.__dl = []; window.__dlPending = []; }")
    page.click("#cdChanged")
    page.wait_for_selector("dialog[open]")
    text = page.inner_text("dialog[open]")
    assert "IE3100-DEMO-03" in text and "IE3100-DEMO-01" not in text
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIPs")
    page.wait_for_function("() => (window.__dl || []).length === 2", timeout=10000)
    names = _zip_names(downloads(page))
    assert len(names) == 2 and names[0].startswith("IE3100-DEMO-03-") and "manifest" in names[1]
    page.wait_for_function("() => $('cdChanged').textContent === 'Changed and not exported (0)'")
    # a template edit applied in Manage marks every card changed
    ev(page, r"""() => { showView('manage'); const el = document.getElementById('template');
        el.value = el.value.replace('\nend\n', '\nntp server 192.0.2.250\nend\n');
        el.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('applyRecipe').click(); }""")
    page.wait_for_function("() => !editorPending")
    assert ev(page, "() => current().template.includes('ntp server 192.0.2.250')") is True
    ev(page, "() => showView('cards')")
    page.wait_for_function("() => $('cdChanged').textContent === 'Changed and not exported (3)'")
    lasts = ev(page, "() => [...document.querySelectorAll('#cdRows td.cd-last')].map((t) => t.textContent)")
    assert all(s.startswith("changed since") for s in lasts), lasts


def test_cards_gates_example_and_errors(page):
    ids = _cards_setup(page)
    ev(page, "() => { current().example = true; renderCards(); }")
    assert page.is_disabled("#cdAll") and page.is_disabled("#cdText")
    assert "Example recipe" in page.inner_text("#cdGates")
    assert page.is_disabled(_cd_row(ids[0], "button.cd-card"))
    ev(page, "() => { current().example = false; current().switches[1].values.MGMT_IP = '999.1.1.1'; renderCards(); }")
    assert "Rows with errors: 2" in page.inner_text("#cdGates")
    assert page.is_disabled(_cd_row(ids[1], "button.cd-card"))
    assert page.is_enabled(_cd_row(ids[0], "button.cd-card"))
    stub_downloads(page)
    page.click("#cdAll")
    page.wait_for_function("() => $('status').textContent.includes('Rows with errors: 2 (') && $('status').textContent.includes('nothing was exported')")
    assert ev(page, "() => !!document.querySelector('dialog[open]')") is False
    assert downloads(page) == []


def test_text_only_zip(page):
    _cards_setup(page, 2)
    stub_downloads(page)
    page.click("#cdText")
    page.wait_for_selector("dialog[open]")
    assert "text-only" in page.inner_text("dialog[open]")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIP")
    page.wait_for_function("() => (window.__dl || []).length === 1")
    d = downloads(page)
    names = ev(page, """async (b64) => { const bin = atob(b64); const u = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        const files = await unzip(new Blob([u])); return files.map((f) => f.path); }""", d[0]["b64"])
    assert names == ["IE3100-DEMO-01/editcontent.txt", "IE3100-DEMO-02/editcontent.txt", "fleet-manifest.txt"]
    assert d[0]["name"].endswith("-text.zip")
    assert sorted(ev(page, "() => Object.keys(current().exports)")) == ["ie3100-demo-01", "ie3100-demo-02"]


# --- Task 11, fix round 1 ---

def test_cards_keep_focus_across_refresh(page):
    ids = _cards_setup(page)
    btn = _cd_row(ids[1], "button.cd-card")
    page.click(btn)
    page.wait_for_selector("dialog[open]")
    click_dialog(page, "Cancel")
    page.wait_for_function("() => !document.querySelector('dialog[open]')")
    ev(page, "() => { current().switches[0].values.SITE = 'Plant Z'; touch(); renderPreview(); }")  # forces a rebuild
    page.wait_for_timeout(600)
    assert ev(page, "() => { const a = document.activeElement; return [a.className, a.closest('tr') && a.closest('tr').dataset.row]; }") == ["cd-card", ids[1]]
    page.focus(_cd_row(ids[0], "button.cd-status"))
    ev(page, "() => renderCards()")
    assert ev(page, "() => { const a = document.activeElement; return [a.className.split(' ')[0], a.closest('tr').dataset.row]; }") == ["cd-status", ids[0]]


def test_cards_cancel_exports_nothing(page):
    ids = _cards_setup(page)
    stub_downloads(page)
    page.click(_cd_row(ids[0], "button.cd-card"))
    click_dialog(page, "Cancel")
    page.wait_for_function("() => $('status').textContent.includes('cancelled')")
    for b in ("#cdAll", "#cdText"):
        page.wait_for_function("(s) => !document.querySelector(s).disabled", arg=b)
        page.click(b)
        click_dialog(page, "Cancel")
        page.wait_for_function("() => !document.querySelector('dialog[open]') && !busy")
    assert downloads(page) == []
    assert ev(page, "() => current().exports") == {}


def test_cards_team_policy_row_blocks(page):
    ids = _cards_setup(page)
    ev(page, "() => { teamPolicies = ['forbid ^hostname IE3100-DEMO-02$']; renderCards(); }")
    assert page.is_disabled(_cd_row(ids[1], "button.cd-card"))
    assert page.is_enabled(_cd_row(ids[0], "button.cd-card"))
    assert "Rows with errors: 2 (team policy: forbidden pattern present: ^hostname IE3100-DEMO-02$)." in page.inner_text("#cdGates")
    assert page.inner_text(_cd_row(ids[1], "button.cd-status")) == "1 error · policy"  # gauntlet r6: the kind of error under the count
    stub_downloads(page)
    page.click("#cdAll")
    page.wait_for_function("() => $('status').textContent.includes('Rows with errors: 2 (') && $('status').textContent.includes('nothing was exported')")
    assert ev(page, "() => !!document.querySelector('dialog[open]')") is False
    assert downloads(page) == []


def test_cards_empty_list_still_shows_gates(page):
    ev(page, "() => { current().switches = []; current().example = true; showView('cards'); }")
    assert "Example recipe" in page.inner_text("#cdGates")
    assert ev(page, "() => $('cdEmpty').hidden") is False


# $('checks').textContent for example 0, captured from the v0.7.3-style build before Task 13.
EXAMPLE0_CHECKS_TEXT = (
    "Checks passed · 1 note to review No enable secret / username patterns found. Optional; "
    "confirm local credentials exist in your tested recipe.  Cisco syntax and device behavior are not verified."
)


def _click_finding(page, scope, text):
    page.locator(scope + " .finding-link", has_text=text).first.click()


def test_clicking_checks_focuses_targets(page):
    # Same visible text as before; only the items became buttons.
    assert ev(page, "() => $('checks').textContent") == EXAMPLE0_CHECKS_TEXT
    assert ev(page, "() => $('checks').querySelectorAll('li > button.finding-link[type=button]').length") == 1
    # field -> Device details input (and it flashes, then the flash goes)
    page.fill("#value_MGMT_IP", "192.0.2.0")
    _click_finding(page, "#checks", "MGMT_IP")
    assert ev(page, "() => document.activeElement.id") == "value_MGMT_IP"
    assert ev(page, "() => $('value_MGMT_IP').classList.contains('flash')") is True
    page.wait_for_function("() => !$('value_MGMT_IP').classList.contains('flash')", timeout=3000)
    page.fill("#value_MGMT_IP", "192.0.2.10")
    # port -> its cell in the port table; keyboard (Enter) works too
    port = ev(page, """() => { const r = current(); normalizePorts(r); r.ports[1].role = 'access'; r.ports[1].vlan = '5000';
        renderAll(); return r.ports[1].name; }""")
    page.locator("#checks .finding-link", has_text="access VLAN").first.focus()
    page.keyboard.press("Enter")
    assert ev(page, "() => [document.activeElement.dataset.port, document.activeElement.dataset.attr]") == [port, "vlan"]
    assert ev(page, "() => !!document.activeElement.closest('#ports')") is True
    ev(page, "() => { current().ports[1].vlan = '10'; renderAll(); }")
    # file line -> that line selected in the preview
    exp = ev(page, r"""() => { const r = current(); r.template = '! café note\n' + r.template; renderAll();
        const f = generate(r).findings.find((x) => x.where && x.where.kind === 'file' && x.where.line);
        return generate(r).text.split(/\r?\n/)[f.where.line - 1]; }""")
    assert "café" in exp
    _click_finding(page, "#checks", "column")
    assert ev(page, "() => document.activeElement.id") == "preview"
    assert ev(page, "() => window.getSelection().toString()") == exp
    ev(page, "() => { const r = current(); r.template = r.template.replace(/^! café note\\n/, ''); renderAll(); }")
    assert ev(page, "() => $('checks').textContent") == EXAMPLE0_CHECKS_TEXT
    # team rule -> Manage, the rules box (its section opened)
    ev(page, "() => { teamPolicies = ['forbid ^hostname ']; renderPreview(); }")
    _click_finding(page, "#checks", "forbidden pattern")
    assert ev(page, "() => currentView") == "manage"
    assert ev(page, "() => $('teamHintsPanel').open") is True
    assert ev(page, "() => document.activeElement.id") == "teamPoliciesEditor"
    ev(page, "() => { teamPolicies = []; showView('build'); }")
    # Switches: a duplicate -> that row's HOSTNAME cell
    ev(page, """() => { current().switches = [
        { id: 'sw-a', values: { HOSTNAME: 'A-01', MGMT_IP: '192.0.2.71' }, ports: {} },
        { id: 'sw-b', values: { HOSTNAME: 'A-01', MGMT_IP: '192.0.2.72' }, ports: {} }]; showView('switches'); }""")
    page.click("#swRows tr[data-row='sw-b'] td.num")
    _click_finding(page, "#swChecks", "duplicate HOSTNAME")
    assert ev(page, "() => [document.activeElement.dataset.row, document.activeElement.dataset.key]") == ["sw-b", "HOSTNAME"]
    # Switches: a port value the row sets -> the row's Ports dialog, that cell
    ev(page, "(p) => { const r = current(); r.switches[1].values.HOSTNAME = 'A-02'; r.switches[1].ports = { [p]: { vlan: '5000' } }; renderSwitches(); }", port)
    _click_finding(page, "#swChecks", port)
    page.wait_for_selector("dialog[open]")
    assert ev(page, "() => [document.activeElement.dataset.port, document.activeElement.dataset.attr, !!document.activeElement.closest('dialog')]") == [port, "vlan", True]
    click_dialog(page, "Done")  # gauntlet r6: the Ports dialog closes with Done (Cancel reverts)
    assert page.problems == []


def test_500_rows_check_time(page):
    # Thresholds are twice the spec's (1.5 s cold, 50 ms one-row change) for shared CI runners.
    r = ev(page, r"""() => {
        const r = current(); normalizePorts(r);
        r.values.MGMT_MASK = '255.255.0.0'; r.values.MGMT_IP = '10.20.0.10'; r.values.GATEWAY = '10.20.0.1';
        const res = countedUpRows(r, [], 500);
        if (res.error) return { error: res.error };
        r.switches = res.rows;
        switchRowCache = { stamp: null, map: new Map() };
        let t = performance.now();
        const a = checkSwitchRows(r, r.switches);
        const cold = performance.now() - t;
        r.switches[250].values.HOSTNAME = 'CHANGED-250';
        t = performance.now();
        const b = checkSwitchRows(r, r.switches);
        const warm = performance.now() - t;
        return { n: a.rows.length, m: b.rows.length, cold, warm, cached: switchRowCache.map.size };
    }""")
    assert "error" not in r, r
    print("500 rows: cold %.0f ms (spec 1500), one-row change %.1f ms (spec 50)" % (r["cold"], r["warm"]))
    assert r["n"] == 500 and r["m"] == 500
    assert r["cold"] < 3000
    assert r["warm"] < 100
    # Measurement only: render time of the two list views with 500 rows.
    for view in ("switches", "cards"):
        ms = ev(page, """(view) => new Promise((resolve) => {
            const orig = updateRail;
            const t = performance.now();
            updateRail = function () { orig.apply(this, arguments); updateRail = orig; resolve(performance.now() - t); };
            showView(view);
        })""", view)
        print("showView(%s) with 500 rows incl. rail refresh: %.0f ms" % (view, ms))
    assert page.problems == []


# --- Final review fixes ---

def test_cards_export_states_beyond_history_bound(page):
    n = 120
    ids = ev(page, """(n) => { const r = current(); r.example = false; normalizePorts(r);
        r.template = r.template.replace('! EXAMPLE ONLY - replace with your tested configuration', '! Plant test template');
        r.values.MGMT_MASK = '255.255.0.0'; r.values.MGMT_IP = '10.20.0.10'; r.values.GATEWAY = '10.20.0.1';
        baseline = {model: r.model, version: 'x', files: [{path: 'a.bin', blob: new Blob(['x'])}]};
        r.switches = countedUpRows(r, [], n).rows; r.exports = {};
        renderAll(); renderPreview(); showView('cards'); return r.switches.map((x) => x.id); }""", n)
    assert len(ids) == n
    stub_downloads(page)
    page.click("#cdText")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIP")
    page.wait_for_function("() => (window.__dl || []).length === 1", timeout=20000)
    page.wait_for_function("() => $('chipCards').textContent === '120 of 120 up to date'", timeout=10000)
    page.wait_for_function("() => $('cdChanged').textContent === 'Changed and not exported (0)'")
    assert page.is_disabled("#cdChanged")
    lasts = ev(page, "() => [...document.querySelectorAll('#cdRows td.cd-last')].map((t) => t.textContent)")
    assert len(lasts) == n and all(s.startswith("up to date") for s in lasts)
    counts = ev(page, "() => [Object.keys(current().exports).length, Object.keys(current().exportStates).length]")
    assert counts[0] <= 50 and counts[1] == n
    # a row whose text was pruned from the export history
    i = ev(page, """() => { const r = current(); const keys = Object.keys(r.exports);
        return r.switches.findIndex((x) => !keys.includes(x.values.HOSTNAME.toLowerCase())); }""")
    assert i >= 0
    ev(page, "(i) => { current().switches[i].values.SITE = 'Plant Q'; touch(); renderPreview(); }", i)
    page.wait_for_function("() => $('cdChanged').textContent === 'Changed and not exported (1)'")
    page.wait_for_function("() => $('chipCards').textContent === '119 of 120 up to date'")
    page.click(_cd_row(ids[i], "button.cd-diff"))
    page.wait_for_selector("dialog[open]")
    text = page.inner_text("dialog[open]")
    assert "No stored text to compare" in text and "SHA-256 old" in text
    click_dialog(page, "Close")
    # the Switches side panel handles the text-less entry too
    ev(page, "(id) => { showView('switches'); selectSwitch(id); }", ids[i])
    assert ev(page, "() => $('swDiffPanel').hidden") is False
    assert "No stored text to compare" in ev(page, "() => $('swDiff').textContent")
    # 500 states fit the project size check
    size = ev(page, """() => { const r = current(); r.exportStates = {};
        for (let k = 0; k < 500; k++) r.exportStates['host-' + k] = { host: 'HOST-' + k, at: new Date().toISOString(), release: RELEASE, sha256: 'a'.repeat(64) };
        return assertProjectSaveSize(projectPayload()).length; }""")
    assert size < 10 * 1024 * 1024
    assert page.problems == []


def test_export_state_newer_entry_wins(page):
    r = ev(page, r"""() => {
        const r = structuredClone(recipes[0]); normalizePorts(r); r.exports = {};
        const a = generate(r).text, b = a + '! b\n';
        const k = 'ie3100-demo-01';
        // a v0.7.3 export (text history only) newer than the v0.8.0 hash-only state
        r.exportStates = { [k]: { host: 'IE3100-DEMO-01', at: '2026-01-01T00:00:00.000Z', release: '0.8.0', sha256: sha256Hex(b) } };
        r.exports = { [k]: { host: 'IE3100-DEMO-01', at: '2026-02-01T00:00:00.000Z', release: '0.7.3', sha256: sha256Hex(a), text: a } };
        const s1 = exportState(r, 'IE3100-DEMO-01', sha256Hex(a));
        // a newer hash-only state wins over an older text entry; no text when they differ
        r.exportStates[k].at = '2026-03-01T00:00:00.000Z';
        const s2 = exportState(r, 'IE3100-DEMO-01', sha256Hex(b));
        const s3 = exportState(r, 'IE3100-DEMO-01', sha256Hex(a));
        // same hash: the text entry comes along, with the newer time
        r.exportStates[k].sha256 = sha256Hex(a);
        const s4 = exportState(r, 'IE3100-DEMO-01', sha256Hex(a));
        return { s1: [s1.state, s1.at, typeof s1.entry.text], s2: [s2.state, s2.at, typeof s2.entry.text],
                 s3: s3.state, s4: [s4.state, s4.at, s4.entry.text === a] };
    }""")
    assert r == {"s1": ["current", "2026-02-01T00:00:00.000Z", "string"],
                 "s2": ["current", "2026-03-01T00:00:00.000Z", "undefined"],
                 "s3": "changed",
                 "s4": ["current", "2026-03-01T00:00:00.000Z", True]}


def test_validate_project_export_states(page):
    r = ev(page, r"""() => {
        const good = 'b'.repeat(64);
        const p = JSON.parse(JSON.stringify(projectPayload()));
        p.recipes[0].exportStates = {
            'a-01': { host: 'A-01', at: '2026-01-01T00:00:00.000Z', release: '0.8.0', sha256: good },
            'a-02': { host: 'A-02', at: '2026-01-01T00:00:00.000Z', sha256: 'xyz' },
            'wrong': { host: 'A-03', at: '2026-01-01T00:00:00.000Z', sha256: good },
            'a-04': 'nope',
            'a-05': { host: 'A-05', at: 5, sha256: good },
        };
        const q = JSON.parse(JSON.stringify(projectPayload()));
        q.recipes[0].exportStates = [1, 2];
        const big = JSON.parse(JSON.stringify(projectPayload()));
        big.recipes[0].exportStates = {};
        for (let k = 0; k < 510; k++)
            big.recipes[0].exportStates['h-' + k] = { host: 'H-' + k, at: new Date(Date.UTC(2026, 0, 1, 0, 0, k)).toISOString(), sha256: good };
        const vp = validateProject(p), vq = validateProject(q), vb = validateProject(big);
        return { p: vp.recipes[0].exportStates, pn: vp._migrationNotes, q: vq.recipes[0].exportStates, qn: vq._migrationNotes,
                 bn: Object.keys(vb.recipes[0].exportStates).length, oldest: Object.hasOwn(vb.recipes[0].exportStates, 'h-0'),
                 newest: Object.hasOwn(vb.recipes[0].exportStates, 'h-509'), bnotes: vb._migrationNotes };
    }""")
    assert r["p"] == {"a-01": {"host": "A-01", "at": "2026-01-01T00:00:00.000Z", "release": "0.8.0", "sha256": "b" * 64}}
    assert any("dropped 4 invalid export state entries" in s for s in r["pn"]), r["pn"]
    assert r["q"] == {} and any("invalid export states dropped" in s for s in r["qn"]), r["qn"]
    assert r["bn"] == 500 and r["oldest"] is False and r["newest"] is True
    assert any("newest 500 export states" in s for s in r["bnotes"]), r["bnotes"]


def test_duplicate_recipe_resets_export_states(page):
    r = ev(page, """() => { const r = current();
        r.exportStates = { x: { host: 'X', at: '2026-01-01T00:00:00.000Z', release: '0.8.0', sha256: 'c'.repeat(64) } };
        document.getElementById('duplicate').click();
        return [Object.keys(current().exports).length, Object.keys(current().exportStates || {}).length, Object.keys(r.exportStates).length]; }""")
    assert r == [0, 0, 1]


def test_import_summary_names_replaced_rows(page):
    ev(page, """() => { current().switches = [{ id: 'sw-a', values: { HOSTNAME: 'A-01' }, ports: {} }]; showView('switches'); }""")
    page.click("#swImport")
    page.fill("dialog[open] textarea", "HOSTNAME\nB-01\n")
    assert "Replace drops the 1 switch in the list." in page.inner_text("dialog[open]")
    click_dialog(page, "Cancel")
    ev(page, """() => { current().switches.push({ id: 'sw-b', values: { HOSTNAME: 'A-02' }, ports: {} }); renderSwitches(); }""")
    page.click("#swImport")
    page.fill("dialog[open] textarea", "HOSTNAME\nB-01\n")
    assert "Replace drops the 2 switches in the list." in page.inner_text("dialog[open]")
    click_dialog(page, "Cancel")
    ev(page, "() => { current().switches = []; renderSwitches(); }")
    page.click("#swImport")
    page.fill("dialog[open] textarea", "HOSTNAME\nB-01\n")
    assert "Replace drops" not in page.inner_text("dialog[open]")
    click_dialog(page, "Cancel")


def test_copy_remove_and_card_status_move_focus(page):
    ev(page, """() => { current().switches = [
        { id: 'sw-a', values: { HOSTNAME: 'A-01', MGMT_IP: '192.0.2.71' }, ports: {} },
        { id: 'sw-b', values: { HOSTNAME: 'A-02', MGMT_IP: '192.0.2.72' }, ports: {} },
        { id: 'sw-c', values: { HOSTNAME: 'A-03', MGMT_IP: '192.0.2.73' }, ports: {} }]; showView('switches'); }""")
    first = """() => { const a = document.activeElement; const tr = a.closest('tr');
        const f = tr && tr.querySelector('input[data-key]'); return [a.dataset.row || null, a === f]; }"""
    # round 8: Copy below and Remove act on the selected row from the side panel
    ev(page, "() => selectSwitch('sw-a')")
    page.click("#swCopyRow")
    copy = ev(page, "() => current().switches[1].id")
    assert ev(page, first) == [copy, True]
    # remove the copy -> focus on the next row (sw-b)
    ev(page, "(id) => selectSwitch(id)", copy)
    page.click("#swRemoveRow")
    click_dialog(page, "Remove")
    page.wait_for_function("() => !document.querySelector('dialog[open]')")
    assert ev(page, first) == ["sw-b", True]
    # remove the last row -> focus on the previous row
    ev(page, "() => selectSwitch('sw-c')")
    page.click("#swRemoveRow")
    click_dialog(page, "Remove")
    page.wait_for_function("() => !document.querySelector('dialog[open]')")
    assert ev(page, first) == ["sw-b", True]
    for rid in ("sw-a", "sw-b"):
        ev(page, "(id) => selectSwitch(id)", rid)
        page.click("#swRemoveRow")
        click_dialog(page, "Remove")
        page.wait_for_function("() => !document.querySelector('dialog[open]')")
    assert ev(page, "() => document.activeElement.id") == "swAdd"
    # Cards: Status opens Switches with focus in the row's first cell
    ids = _cards_setup(page)
    page.click(_cd_row(ids[2], "button.cd-status"))
    assert ev(page, "() => currentView") == "switches"
    assert ev(page, first) == [ids[2], True]
    assert page.problems == []


def test_import_header_decode_hint(page):
    ev(page, "() => showView('switches')")
    page.click("#swImport")
    page.set_input_files("dialog[open] input[type=file]",
                         {"name": "a.csv", "mimeType": "text/csv", "buffer": b"HOSTNAME,ST\xc4DT\nA-01,x\n"})
    page.wait_for_function("() => document.querySelector('dialog[open]').textContent.includes('could not be read as UTF-8')")
    assert "Header names must be placeholder names" in page.inner_text("dialog[open]")
    click_dialog(page, "Cancel")


def test_grid_has_no_per_row_copy_remove_columns(page):
    # gauntlet r8: Copy below and Remove act on the selected row from the side panel (labelled
    # buttons), so the grid carries no icon columns; round 9 adds one quiet Row actions menu
    # button at the row end (a hidden-text header), drawn only on the selected or hovered row.
    ev(page, """() => { current().switches = [{ id: 'sw-a', values: { HOSTNAME: 'A-01' }, ports: {} }]; showView('switches'); }""")
    ths = ev(page, "() => [...$('swHead').querySelectorAll('th')].map((t) => t.textContent)")
    assert ths[-2:] == ["Ports", "Row actions"] and "Copy" not in ths and "Remove" not in ths
    assert ev(page, "() => [...$('swRows').querySelectorAll('button')].map((b) => b.className)") == ["sw-ports", "sw-more"]
    assert ev(page, "() => getComputedStyle($('swRows').querySelector('button.sw-more')).visibility") == "hidden"
    assert ev(page, "() => [$('swCopyRow').textContent, $('swRemoveRow').textContent]") == ["Copy below", "Remove"]


def test_bulk_export_records_rows_before_a_failure(page):
    _cards_setup(page)
    ev(page, """() => { window.__n = 0; download = () => { if (++window.__n === 2) throw Error('blocked'); }; dirty = false; }""")
    page.click("#cdAll")
    page.check("dialog[open] input[type=checkbox]")
    click_dialog(page, "Download ZIPs")
    page.wait_for_function("() => !busy && $('status').textContent.includes('blocked')", timeout=10000)
    assert ev(page, "() => Object.keys(current().exports)") == ["ie3100-demo-01"]
    assert ev(page, "() => Object.keys(current().exportStates)") == ["ie3100-demo-01"]
    assert ev(page, "() => dirty") is True
    page.problems.clear()
