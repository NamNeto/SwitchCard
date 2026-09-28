"""Tests for v0.7.2: port columns in the fleet CSV, the port CSV on the page, Set role on checked."""
from helpers import ev


def test_resolve_port_names(page):
    r = ev(page, r"""() => {
        const ifs = ['GigabitEthernet1/1', 'GigabitEthernet1/10', 'TenGigabitEthernet1/0/25', 'GigabitEthernet1/0/25'];
        return ['Gi1/1', 'gigabitethernet1/10', 'Te1/0/25', 'G1/0/25', 'Gi1/99', 'Vlan1', ''].map((t) => resolvePortName(t, ifs));
    }""")
    assert r == ["GigabitEthernet1/1", "GigabitEthernet1/10", "TenGigabitEthernet1/0/25", "GigabitEthernet1/0/25", None, None, None]


def test_fleet_port_columns_set_ports_per_switch(page):
    r = ev(page, r"""() => {
        const svi = structuredClone(recipes[0]); normalizePorts(svi);
        const res = checkFleet(svi, 'HOSTNAME,MGMT_IP,Gi1/2 role,Gi1/2 vlan,Gi1/2 description,GigabitEthernet1/3 description\n' +
          'SW-01,192.0.2.11,access,10,PLC-01,HMI-01\nSW-02,192.0.2.12,,,,\n');
        const badIf = checkFleet(svi, 'HOSTNAME,Gi1/99 description\nSW-01,x\n');
        const badRole = checkFleet(svi, 'HOSTNAME,Gi1/2 role\nSW-01,edge\n');
        const dup = checkFleet(svi, 'HOSTNAME,Gi1/2 description,GigabitEthernet1/2 description\nSW-01,a,b\n');
        return {
          errors: res.errors, portCols: res.portCols, rowErrors: res.rows.map((x) => x.errors),
          set: res.rows.map((x) => x.portCells.length),
          t1: res.rows[0].text, t2: res.rows[1].text, w1: res.rows[0].warnings,
          badIf: badIf.errors, badRole: badRole.rows.map((x) => x.errors), dup: dup.errors,
        };
    }""")
    assert r["errors"] == [] and r["rowErrors"] == [[], []] and r["set"] == [4, 0]
    assert r["portCols"] == ["GigabitEthernet1/2 role", "GigabitEthernet1/2 vlan", "GigabitEthernet1/2 description", "GigabitEthernet1/3 description"]
    assert "interface GigabitEthernet1/2\r\n description PLC-01\r\n switchport mode access\r\n switchport access vlan 10\r\n" in r["t1"]
    # Gi1/3 stays Unused: the default Unused role has no {{DESCRIPTION}}, so the text is dropped with a note
    assert "HMI-01" not in r["t1"] and any("GigabitEthernet1/3: its description is not used" in w for w in r["w1"])
    assert "PLC-01" not in r["t2"] and "interface GigabitEthernet1/2\r\n shutdown\r\n" in r["t2"]
    assert any("Gi1/99 description" in e for e in r["badIf"])
    assert any('role "edge"' in e for e in r["badRole"][0])
    assert any("Duplicate column" in e for e in r["dup"])


def test_fleet_per_switch_routed_ip_silences_shared_note(page):
    r = ev(page, r"""() => {
        const loop = structuredClone(recipes[3]); normalizePorts(loop);
        const res = checkFleet(loop, 'HOSTNAME,MGMT_IP,Gi1/1 ip\nIE3X00-LOOP-01,198.51.100.10,192.0.2.2\nIE3X00-LOOP-02,198.51.100.11,192.0.2.6\n');
        return { w: res.warnings, errors: res.rows.map((x) => x.errors), t2: res.rows[1].text };
    }""")
    assert not any("Routed port addresses" in w for w in r["w"])
    assert r["errors"] == [[], []]
    assert " ip address 192.0.2.6 255.255.255.252\r\n" in r["t2"]


def test_port_csv_round_trip_and_apply(page):
    r = ev(page, r"""() => {
        const x = structuredClone(recipes[0]); normalizePorts(x);
        const csv = portTableCsv(x);
        const same = applyPortCsv(x, csv);
        const ok = applyPortCsv(x, 'interface,role,vlan,description\nGi1/2,access,10,"PLC-01, line 3"\nGi1/3,,,HMI-01\n');
        const bad = applyPortCsv(x, 'INTERFACE,DESCRIPTION\nGi1/2,ok\nGi1/77,nope\n');
        const noIf = applyPortCsv(x, 'DESCRIPTION\nx\n');
        return { head: csv.split('\n')[0], same: same.portsChanged, ok: { changed: ok.changed, n: ok.portsChanged, p2: ok.ports[1], p3: ok.ports[2] },
                 bad: bad.errors, noIf: noIf.errors, untouched: x.ports[1].description };
    }""")
    assert r["head"] == "INTERFACE,ROLE,VLAN,DESCRIPTION" and r["same"] == 0
    assert r["ok"]["n"] == 2 and r["ok"]["changed"]["description"] == 2 and r["ok"]["changed"]["role"] == 1
    assert r["ok"]["p2"]["role"] == "access" and r["ok"]["p2"]["vlan"] == "10" and r["ok"]["p2"]["description"] == "PLC-01, line 3"
    assert r["ok"]["p3"]["role"] == "unused" and r["ok"]["p3"]["description"] == "HMI-01"
    assert any("Gi1/77" in e for e in r["bad"]) and r["untouched"] == ""
    assert any("INTERFACE column" in e for e in r["noIf"])


def test_port_csv_panel_and_bulk_role_in_ui(page):
    r = ev(page, r"""() => {
        $('portCsv').value = 'INTERFACE,DESCRIPTION\nGi1/4,Camera-01\n';
        $('applyPortCsv').click();
        const desc = current().ports[3].description;
        const picks = ['GigabitEthernet1/5', 'GigabitEthernet1/6', 'GigabitEthernet1/7'];
        document.querySelectorAll('#ports input.portPick').forEach((c) => { c.checked = picks.includes(c.dataset.port); });
        $('bulkRole').value = 'access';
        $('applyBulkRole').click();
        const roles = current().ports.slice(4, 7).map((p) => p.role);
        const still = [...document.querySelectorAll('#ports input.portPick:checked')].map((c) => c.dataset.port);
        $('bulkVlan').value = '20';
        $('applyBulkVlan').click();
        return { desc, roles, still, vlans: current().ports.slice(4, 7).map((p) => p.vlan), panel: !$('portCsvPanel').hidden,
                 errors: generate(current()).errors, status: $('status').textContent };
    }""")
    assert r["desc"] == "Camera-01" and r["panel"]
    assert r["roles"] == ["access", "access", "access"]
    assert r["still"] == ["GigabitEthernet1/5", "GigabitEthernet1/6", "GigabitEthernet1/7"]
    assert r["vlans"] == ["20", "20", "20"] and r["errors"] == []
    assert "Updated VLAN on 3 ports" in r["status"]
