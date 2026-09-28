"""Tests for v0.7.1: Duplicate switch, the fleet CSV column hint, aligned controls."""
from helpers import ev


def test_bump_trailing_number(page):
    r = ev(page, r"""() => [
        bumpTrailingNumber('IE3100-DEMO-01', 1), bumpTrailingNumber('SW-09', 1), bumpTrailingNumber('SW-99', 1),
        bumpTrailingNumber('SW7', 3), bumpTrailingNumber('EDGE', 1), bumpTrailingNumber('A1B2', 0),
        bumpTrailingNumber('SW-0099', 1), bumpTrailingNumber('SW-00', 0)]""")
    assert r == ["IE3100-DEMO-02", "SW-10", "SW-100", "SW10", None, "A1B2", "SW-0100", "SW-00"]


def test_fleet_copy_rows(page):
    r = ev(page, r"""() => {
        const svi = structuredClone(recipes[0]); normalizePorts(svi);
        const ok = fleetCopyRows(svi, '4');
        const noNum = structuredClone(svi); noNum.values.HOSTNAME = 'EDGE';
        const top = structuredClone(svi); top.values.MGMT_IP = '192.0.2.252';
        const bcast = structuredClone(svi); bcast.values.MGMT_IP = '192.0.2.255';
        const noIp = structuredClone(svi); noIp.values.MGMT_IP = '';
        const loop = structuredClone(recipes[3]); normalizePorts(loop); loop.values.MGMT_IP = '198.51.100.254';
        const noFields = structuredClone(svi); noFields.template = 'vlan 10\n';
        return {
          ok, csv: toCsv(ok.columns, ok.rows),
          noNum: fleetCopyRows(noNum, 3).error, one: fleetCopyRows(svi, 1).error, many: fleetCopyRows(svi, 501).error,
          text: fleetCopyRows(svi, 'x').error, top: fleetCopyRows(top, 4).error, topFits: fleetCopyRows(top, 3).rows.length,
          bcast: fleetCopyRows(bcast, 2).error, noIp: fleetCopyRows(noIp, 2).error,
          loop: fleetCopyRows(loop, 4).rows.map((x) => x.MGMT_IP), noFields: fleetCopyRows(noFields, 2).error,
        };
    }""")
    assert r["ok"]["columns"] == ["HOSTNAME", "MGMT_IP"]
    assert r["csv"] == ("HOSTNAME,MGMT_IP\nIE3100-DEMO-01,192.0.2.10\nIE3100-DEMO-02,192.0.2.11\n"
                        "IE3100-DEMO-03,192.0.2.12\nIE3100-DEMO-04,192.0.2.13\n")
    assert "does not end in a number" in r["noNum"]
    assert all("from 2 to 500" in r[k] for k in ("one", "many", "text"))
    assert "Only 3 switches fit" in r["top"] and "192.0.2.254" in r["top"] and r["topFits"] == 3
    assert "not a usable host address" in r["bcast"]
    assert "valid Management IP" in r["noIp"]
    # Loopback mode: every switch owns its /32, so there is no shared subnet to stay inside.
    assert r["loop"] == ["198.51.100.254", "198.51.100.255", "198.51.101.0", "198.51.101.1"]
    assert "no Hostname or Management IP" in r["noFields"]


def test_fleet_csv_example_and_column_hint(page):
    r = ev(page, r"""() => {
        const custom = structuredClone(recipes[0]);
        custom.template = custom.template.replace('hostname {{HOSTNAME}}', 'hostname {{HOSTNAME}}\nntp server {{NTP_SERVER}}');
        const blank = structuredClone(recipes[0]); blank.values.HOSTNAME = ''; blank.values.MGMT_IP = '';
        return { svi: fleetCsvExample(recipes[0]), loop: fleetCsvExample(recipes[3]).columns, custom: fleetCsvExample(custom),
                 blank: fleetCsvExample(blank).text.split('\n')[1],
                 line: $('fleetColumns').textContent, placeholder: $('fleetCsv').placeholder,
                 frameHidden: $('fleetScroll').hidden };
    }""")
    assert r["svi"]["columns"] == ["HOSTNAME", "MGMT_IP", "MGMT_MASK", "MGMT_VLAN", "GATEWAY", "SITE"]
    assert r["svi"]["text"] == ("HOSTNAME,MGMT_IP,MGMT_MASK,MGMT_VLAN,GATEWAY,SITE\n"
                                "IE3100-DEMO-01,192.0.2.10,255.255.255.0,100,192.0.2.1,Example site\n"
                                "IE3100-DEMO-02,192.0.2.11,,,,\n")
    assert r["loop"] == ["HOSTNAME", "MGMT_IP", "MGMT_MASK", "MGMT_LOOPBACK", "GATEWAY", "SITE"]
    assert r["custom"]["columns"][-1] == "NTP_SERVER" and ",ntp-server\n" in r["custom"]["text"]
    assert r["blank"].startswith("EXAMPLE-SW-01,192.0.2.11,")
    assert "Columns for this recipe: HOSTNAME, MGMT_IP, MGMT_MASK, MGMT_VLAN, GATEWAY, SITE." in r["line"]
    assert r["placeholder"] == r["svi"]["text"]
    assert r["frameHidden"]


def test_duplicate_button_fills_csv_and_checks(page):
    r = ev(page, r"""() => {
        $('fleetPanel').open = true;
        $('fleetCount').value = '3';
        $('fillCopies').click();
        const first = { text: $('fleetCsv').value, rows: $('fleetRows').children.length, status: $('status').textContent,
                        heads: [...$('fleetHead').querySelectorAll('th')].map((th) => th.textContent),
                        cells: [...$('fleetRows').children[0].children].map((td) => td.className),
                        frameHidden: $('fleetScroll').hidden };
        $('fleetCount').value = '2';
        $('fillCopies').click(); // replaces the CSV after a confirm (the test harness accepts dialogs)
        return { first, second: $('fleetCsv').value, rows2: $('fleetRows').children.length };
    }""")
    f = r["first"]
    assert f["text"] == "HOSTNAME,MGMT_IP\nIE3100-DEMO-01,192.0.2.10\nIE3100-DEMO-02,192.0.2.11\nIE3100-DEMO-03,192.0.2.12\n"
    assert f["rows"] == 3 and not f["frameHidden"]
    assert f["heads"] == ["#", "HOSTNAME", "MGMT_IP", "MGMT_MASK", "MGMT_VLAN", "GATEWAY", "SITE", "Result", "Lines", "SHA-256"]
    assert f["cells"][1] == "" and f["cells"][2] == "" and f["cells"][3] == "inherit" and f["cells"][7] == "ok"
    assert "Filled 3 switches: IE3100-DEMO-01 … IE3100-DEMO-03, 192.0.2.10 … 192.0.2.12." in f["status"]
    assert "Fleet checked: 3 switches ready." in f["status"]
    assert r["second"].count("\n") == 3 and r["rows2"] == 2


def test_fleet_warns_about_shared_routed_addresses(page):
    r = ev(page, r"""() => {
        const r = structuredClone(recipes[3]); normalizePorts(r);
        const two = checkFleet(r, 'HOSTNAME,MGMT_IP\nIE3X00-LOOP-01,198.51.100.10\nIE3X00-LOOP-02,198.51.100.11\n');
        const one = checkFleet(r, 'HOSTNAME,MGMT_IP\nIE3X00-LOOP-01,198.51.100.10\n');
        return { two: two.warnings, one: one.warnings, errors: two.rows.map((x) => x.errors) };
    }""")
    assert any("same ones" in w and "GigabitEthernet1/1 192.0.2.2 255.255.255.252" in w for w in r["two"])
    assert not any("Routed port addresses" in w for w in r["one"])
    assert r["errors"] == [[], []]


def test_controls_sharing_a_row_line_up(page):
    r = ev(page, r"""() => {
        for (const d of document.querySelectorAll('details')) d.open = true;
        const sel = 'button, .filebutton, select, input:not([type=checkbox]):not([type=file])';
        const check = () => {
            const bad = [];
            for (const row of document.querySelectorAll('.actions, .bulk, .bulk-group')) {
                if (!row.getClientRects().length) continue;
                const boxes = [...row.children].filter((c) => c.matches(sel) && c.getClientRects().length)
                    .map((c) => ({ id: c.id || c.textContent.trim().slice(0, 24), b: c.getBoundingClientRect() }));
                for (const a of boxes) for (const o of boxes) {
                    if (a === o || Math.abs(a.b.top - o.b.top) >= a.b.height / 2) continue; // other line of a wrapped row
                    if (Math.abs(a.b.top - o.b.top) > 1 || Math.abs(a.b.height - o.b.height) > 1)
                        bad.push(a.id + ' / ' + o.id + ': top ' + Math.round(a.b.top) + ' vs ' + Math.round(o.b.top) +
                                 ', height ' + Math.round(a.b.height) + ' vs ' + Math.round(o.b.height));
                }
            }
            return bad;
        };
        const build = check();
        tab(true);
        const maintain = check();
        const sku = [$('customSkuName'), $('saveSkuPreset')].map((e) => e.getBoundingClientRect());
        tab(false);
        const rect = (e) => e.getBoundingClientRect();
        const load = document.querySelector('#fleetPanel .filebutton');
        return {
          build, maintain,
          sku: [Math.round(sku[0].top - sku[1].top), Math.round(sku[0].height - sku[1].height)],
          // stacked "even" rows in the fleet panel share their column edges
          lefts: [$('fleetCount'), load, $('exportFleet')].map((e) => rect(e).left),
          mids: [$('fillCopies'), $('checkFleet'), $('exportFleetText')].map((e) => rect(e).left),
          rights: [$('fillCopies'), $('checkFleet'), $('exportFleetText')].map((e) => rect(e).right),
        };
    }""")
    assert r["build"] == [] and r["maintain"] == []
    assert r["sku"] == [0, 0]
    for group in (r["lefts"], r["mids"], r["rights"]):
        assert max(group) - min(group) <= 1, group
