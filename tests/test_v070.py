"""Tests for the v0.7.0 features: team policies, fleet export, export history + diff, baseline
fingerprints, interface-brief parsing, transliteration, theme. Uses the fixtures in test_switchcard.py."""
import pytest

from helpers import ev


# ---------------------------------------------------------------- team policy rules

def test_policy_rules_block_and_fail_closed(page):
    r = ev(page, """() => {
        const t = generate(recipes[0]).text;
        return {
          none: policyViolations(t, []),
          ok: policyViolations(t, ['require ^hostname ', 'forbid snmp-server community', '# a comment', '']),
          missing: policyViolations(t, ['require transport input ssh  # vty hardening']),
          forbidden: policyViolations(t, ['forbid ^ip default-gateway']),
          noLine: policyViolations('interface Vlan100\\r\\n no ip proxy-arp\\r\\n', ['forbid proxy-arp']),
          comment: policyViolations('! password in a comment\\r\\n', ['forbid password']),
          invalid: policyViolations(t, ['require (unclosed']),
          garbage: policyViolations(t, ['must have ssh']),
        };
    }""")
    assert r["none"] == [] and r["ok"] == []
    assert len(r["missing"]) == 1 and "vty hardening" in r["missing"][0]
    assert len(r["forbidden"]) == 1 and "forbidden pattern present" in r["forbidden"][0]
    assert r["noLine"] == [] and r["comment"] == []
    assert len(r["invalid"]) == 1 and "Invalid pattern" in r["invalid"][0]
    assert len(r["garbage"]) == 1 and "must start with" in r["garbage"][0]


def test_policy_violation_gates_export_in_ui(page):
    r = ev(page, """() => {
        $('teamPoliciesEditor').value = 'require transport input ssh';
        $('teamPoliciesEditor').dispatchEvent(new Event('input'));
        const g = generate(current());
        const blocked = blockers(current(), g).filter(x => x.startsWith('Team policy:'));
        const shown = $('checks').textContent.includes('team policy rule blocks export');
        const why = $('exportWhy').textContent;
        $('teamPoliciesEditor').value = '';
        $('teamPoliciesEditor').dispatchEvent(new Event('input'));
        const after = blockers(current(), generate(current())).filter(x => x.startsWith('Team policy:'));
        return { blocked, shown, why, after, saveTextDisabled: $('downloadConfig').disabled };
    }""")
    assert len(r["blocked"]) == 1 and r["shown"] and "Team policy" in r["why"] and r["after"] == []


def test_policies_round_trip_project(page):
    r = ev(page, """() => {
        teamPolicies = ['require ^hostname '];
        const p = JSON.parse(JSON.stringify(projectPayload()));
        const v = validateProject(p);
        const p2 = JSON.parse(JSON.stringify(projectPayload())); delete p2.teamPolicies;
        const v2 = validateProject(p2);
        let bad = '';
        try { const p3 = JSON.parse(JSON.stringify(projectPayload())); p3.teamPolicies = 'require x'; validateProject(p3); } catch (e) { bad = e.message; }
        teamPolicies = [];
        return { version: p.version, rules: v.teamPolicies, missing: v2.teamPolicies, bad };
    }""")
    # rule lines are trimmed on the way in (use \s or \b for a space at a pattern edge)
    assert r["version"] == 5 and r["rules"] == ["require ^hostname"] and r["missing"] == [] and "teamPolicies" in r["bad"]


# ---------------------------------------------------------------- interface brief

def test_parse_interface_brief(page):
    r = ev(page, r"""() => parseInterfaceBrief(`Interface              IP-Address      OK? Method Status                Protocol
Vlan1                  unassigned      YES unset  up                    up
GigabitEthernet0/0     unassigned      YES unset  down                  down
GigabitEthernet1/1     unassigned      YES unset  up                    up
GigabitEthernet1/2     unassigned      YES unset  down                  down
TenGigabitEthernet1/0/25 unassigned    YES unset  down                  down
AppGigabitEthernet1/1  unassigned      YES unset  up                    up
Loopback0              198.51.100.10   YES manual up                    up
Port-channel1          unassigned      YES unset  down                  down
Gi2/1                  unassigned      YES unset  down                  down
Te1/1.100              unassigned      YES unset  down                  down
gigabitethernet1/1     unassigned      YES unset  up                    up
`)""")
    assert r["names"] == ["GigabitEthernet1/1", "GigabitEthernet1/2", "TenGigabitEthernet1/0/25", "GigabitEthernet2/1"]
    joined = " ".join(r["skipped"])
    assert "GigabitEthernet0/0 (out-of-band" in joined and "AppGigabitEthernet1/1 (app-hosting" in joined
    assert "Vlan1" in joined and "Loopback0" in joined and "Port-channel1" in joined and "(subinterface)" in joined


# ---------------------------------------------------------------- transliteration

def test_transliterate_ascii(page):
    r = ev(page, """() => ({
        de: transliterateAscii('M\\u00fcnchen Stra\\u00dfe \\u00c4\\u00d6\\u00dc'),
        fr: transliterateAscii('r\\u00e9seau \\u00e0 c\\u00f4t\\u00e9'),
        punct: transliterateAscii('a \\u2013 b \\u2014 c \\u2018q\\u2019 \\u201cd\\u201d \\u2026'),
        hidden: transliterateAscii('a\\u200bb\\u00a0c'),
        stays: transliterateAscii('\\u4e2d'),
    })""")
    assert r["de"] == "Muenchen Strasse AeOeUe"
    assert r["fr"] == "reseau a cote"
    assert r["punct"] == "a - b - c 'q' \"d\" ..."
    assert r["hidden"] == "ab c"
    assert r["stays"] == "中"


def test_ascii_fix_button_appears_and_transliterates_values(page):
    r = ev(page, """() => {
        const r = current();
        r.values.SITE = 'M\\u00fcnchen';
        renderAll();
        const shown = !$('asciiFix').hidden;
        $('fixAscii').click();
        return { shown, site: current().values.SITE, hiddenAfter: $('asciiFix').hidden, errors: generate(current()).errors };
    }""")
    assert r["shown"] and r["site"] == "Muenchen" and r["hiddenAfter"] and r["errors"] == []


# ---------------------------------------------------------------- diff and export history

def test_line_diff(page):
    r = ev(page, """() => {
        const a = 'a\\r\\nb\\r\\nc\\r\\n', b = 'a\\r\\nx\\r\\nc\\r\\nd\\r\\n';
        const ops = lineDiff(a, b).map(o => o.t + o.s);
        const same = lineDiff(a, a).every(o => o.t === ' ');
        return { ops, same, empty: lineDiff('', '').length };
    }""")
    assert r["ops"] == [" a", "-b", "+x", " c", "+d"] and r["same"] and r["empty"] == 1


def test_export_history_records_and_diffs(page):
    r = ev(page, """() => {
        const r = current();
        const before = generate(r).text;
        recordExport(r, r.values.HOSTNAME, before);
        r.values.SITE = 'Other site';
        renderPreview();
        const summary = $('diffSummary').textContent;
        const shown = !$('diffPanel').hidden;
        const out = $('diffOut').textContent;
        const key = Object.keys(r.exports)[0];
        const dup = structuredClone(r); dup.id = 'x';
        const p = JSON.parse(JSON.stringify(projectPayload()));
        const v = validateProject(p);
        const kept = Object.keys(v.recipes[0].exports).length;
        p.recipes[0].exports[key].text += 'tampered';
        const v2 = validateProject(p);
        return { summary, shown, out, key, kept, tamperedKept: Object.keys(v2.recipes[0].exports).length, notes: v2._migrationNotes };
    }""")
    assert r["shown"] and "+1 / -1 lines" in r["summary"] and "- ! Site: Example site" in r["out"] and "+ ! Site: Other site" in r["out"]
    assert r["key"] == "ie3100-demo-01" and r["kept"] == 1 and r["tamperedKept"] == 0 and any("export history" in n for n in r["notes"])


def test_export_history_is_bounded(page):
    r = ev(page, """() => {
        const r = structuredClone(current());
        for (let i = 0; i < 60; i++) recordExport(r, 'host-' + i, 'x'.repeat(1000));
        const n = Object.keys(r.exports).length;
        const big = structuredClone(current());
        for (let i = 0; i < 3; i++) recordExport(big, 'big-' + i, 'y'.repeat(300 * 1024));
        return { n, big: Object.keys(big.exports).length };
    }""")
    assert r["n"] == 50 and r["big"] == 1


# ---------------------------------------------------------------- fleet

FLEET_CSV = "HOSTNAME,MGMT_IP,IGNORED\\nEXAMPLE-SW1,192.0.2.11,x\\nEXAMPLE-SW2,192.0.2.12,y\\n"


def test_parse_csv_quotes_and_delimiters(page):
    r = ev(page, '''() => ({
        comma: parseCsv('HOSTNAME,SITE\\nsw1,"Site, with comma"\\nsw2,"say ""hi"""\\n'),
        semi: parseCsv('hostname;mgmt ip\\r\\nsw1;192.0.2.1\\r\\n'),
        tab: parseCsv('HOSTNAME\\tMGMT_IP\\nsw1\\t192.0.2.1\\n\\n'),
        bom: parseCsv('\\uFEFFHOSTNAME\\nsw1'),
    })''')
    assert r["comma"]["rows"] == [["sw1", "Site, with comma"], ["sw2", 'say "hi"']]
    assert r["semi"]["header"] == ["HOSTNAME", "MGMT_IP"] and r["semi"]["rows"] == [["sw1", "192.0.2.1"]]
    assert r["tab"]["delimiter"] == "\t" and r["tab"]["rows"] == [["sw1", "192.0.2.1"]]
    assert r["bom"]["header"] == ["HOSTNAME"]


def test_check_fleet_rows_inherit_and_detect_duplicates(page):
    r = ev(page, """(csv) => {
        const res = checkFleet(current(), csv);
        const dup = checkFleet(current(), 'HOSTNAME,MGMT_IP\\nA1,192.0.2.11\\na1,192.0.2.12\\nA3,192.0.2.11\\n');
        const bad = checkFleet(current(), 'HOSTNAME,PORTS\\nx,y\\n');
        const none = checkFleet(current(), '');
        return {
          header: res.header, errors: res.errors, warnings: res.warnings,
          rows: res.rows.map(x => ({ host: x.host, ip: x.ip, errors: x.errors, inherited: x.inherited, ok: /hostname EXAMPLE-SW/.test(x.text) })),
          unique: new Set(res.rows.map(x => x.sha256)).size,
          dupErrors: dup.rows.map(x => x.errors),
          bad: bad.errors, none: none.errors,
        };
    }""", FLEET_CSV.replace("\\n", "\n"))
    assert r["header"] == ["HOSTNAME", "MGMT_IP"] and r["errors"] == [] and any("IGNORED" in w for w in r["warnings"])
    assert [x["host"] for x in r["rows"]] == ["EXAMPLE-SW1", "EXAMPLE-SW2"] and all(x["errors"] == [] and x["ok"] for x in r["rows"])
    assert r["unique"] == 2
    assert r["dupErrors"][0] == [] and any("duplicate HOSTNAME" in e for e in r["dupErrors"][1]) and any("duplicate MGMT_IP" in e for e in r["dupErrors"][2])
    assert any("cannot be set per switch" in e for e in r["bad"]) and any("header row" in e for e in r["none"])


def test_fleet_ui_gates(page):
    r = ev(page, """(csv) => {
        $('fleetCsv').value = csv;
        $('checkFleet').click();
        const afterCheck = { rows: $('fleetRows').children.length, why: $('fleetWhy').textContent, disabled: $('exportFleet').disabled };
        $('reviewed').checked = true; renderPreview();
        const reviewed = { why: $('fleetWhy').textContent, disabled: $('exportFleet').disabled };
        return { afterCheck, reviewed };
    }""", FLEET_CSV.replace("\\n", "\n"))
    assert r["afterCheck"]["rows"] == 2 and r["afterCheck"]["disabled"]
    # the examples are still example recipes without a baseline, so the gates keep the button off
    assert r["reviewed"]["disabled"] and "Example recipe" in r["reviewed"]["why"]


# ---------------------------------------------------------------- fingerprints

def test_fingerprint_digest_and_compare(page):
    r = ev(page, """async () => {
        const files = [{ path: 'b.bin', blob: new Blob(['22']) }, { path: 'A/a.bin', blob: new Blob(['1']) }];
        const fp = await fingerprintFiles(files);
        const fp2 = await fingerprintFiles(files.slice().reverse());
        const changed = await fingerprintFiles([{ path: 'b.bin', blob: new Blob(['23']) }, { path: 'A/a.bin', blob: new Blob(['1']) }, { path: 'c', blob: new Blob(['']) }]);
        const cmp = compareFingerprints(fp, changed);
        const rec = baselineRecord({ model: 'IE3100', version: 'v1', fingerprint: fp });
        const p = JSON.parse(JSON.stringify(projectPayload())); p.baseline = rec;
        const v = validateProject(p);
        const kept = v.baseline.fingerprint.digest === fp.digest && v.baseline.fingerprint.files.length === 2;
        p.baseline.fingerprint.digest = 'zz'; // validateProject works in place, so read `kept` first
        const v2 = validateProject(JSON.parse(JSON.stringify(p)));
        return { count: fp.fileCount, bytes: fp.totalBytes, same: fp.digest === fp2.digest, sha: fp.files[0].sha256,
                 cmp: { same: cmp.same, changed: cmp.changed, added: cmp.added, removed: cmp.removed },
                 kept, dropped: v2.baseline.fingerprint === undefined, notes: v2._migrationNotes };
    }""")
    assert r["count"] == 2 and r["bytes"] == 3 and r["same"]
    assert r["sha"] == "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b"  # sha256("1")
    assert r["cmp"] == {"same": False, "changed": ["b.bin"], "added": ["c"], "removed": []}
    assert r["kept"] and r["dropped"] and any("fingerprint" in n for n in r["notes"])


# ---------------------------------------------------------------- literal L3 + theme

def test_literal_l3_subnets_and_theme(page):
    r = ev(page, """() => {
        const t = 'interface Vlan10\\r\\n ip address 192.0.2.2 255.255.255.252\\r\\n!\\r\\ninterface Loopback0\\r\\n ip address 198.51.100.1 255.255.255.255\\r\\n!\\r\\nip route 0.0.0.0 0.0.0.0 192.0.2.1\\r\\n';
        const subs = literalL3Subnets(t, 'Loopback0').map(s => s.label);
        applyTheme('light'); const light = document.documentElement.dataset.theme;
        applyTheme('auto'); const auto = document.documentElement.dataset.theme;
        return { subs, light, auto, sel: $('themeSelect').value };
    }""")
    assert r["subs"] == ["Vlan10 (literal)"] and r["light"] == "light" and r["auto"] is None and r["sel"] == "auto"
