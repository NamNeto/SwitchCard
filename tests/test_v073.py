"""Tests for v0.7.3: the fleet CSV template for any recipe."""
from helpers import ev


def test_fleet_csv_template_modes(page):
    r = ev(page, r"""() => {
        const x = structuredClone(recipes[0]); normalizePorts(x);
        x.ports[1].description = 'PLC-01, line 3';
        const none = fleetCsvTemplate(x, 'none');
        const desc = fleetCsvTemplate(x, 'description');
        const all = fleetCsvTemplate(x, 'all');
        const loop = structuredClone(recipes[3]); normalizePorts(loop);
        return { none: none.text, descCols: desc.columns, descRow: desc.text.split('\n')[1],
                 allCols: all.columns.slice(6, 12), loopCols: fleetCsvTemplate(loop, 'all').columns.slice(6, 11) };
    }""")
    assert r["none"] == "HOSTNAME,MGMT_IP,MGMT_MASK,MGMT_VLAN,GATEWAY,SITE\nIE3100-DEMO-01,192.0.2.10,255.255.255.0,100,192.0.2.1,Example site\n"
    assert len(r["descCols"]) == 16 and r["descCols"][6] == "GigabitEthernet1/1 description"
    assert r["descRow"].startswith("IE3100-DEMO-01,") and ',"PLC-01, line 3",' in r["descRow"]
    assert r["allCols"] == ["GigabitEthernet1/1 role", "GigabitEthernet1/1 vlan", "GigabitEthernet1/1 description",
                            "GigabitEthernet1/2 role", "GigabitEthernet1/2 vlan", "GigabitEthernet1/2 description"]
    assert r["loopCols"] == ["GigabitEthernet1/1 role", "GigabitEthernet1/1 vlan", "GigabitEthernet1/1 description",
                             "GigabitEthernet1/1 ip", "GigabitEthernet1/1 mask"]


def test_fleet_template_round_trips_to_the_page_switch(page):
    r = ev(page, r"""() => {
        const out = {};
        for (const mode of ['description', 'all']) {
            const x = structuredClone(current()); normalizePorts(x);
            x.ports[2].role = 'access'; x.ports[2].vlan = '30'; x.ports[2].description = 'HMI-02';
            const res = checkFleet(x, fleetCsvTemplate(x, mode).text);
            out[mode] = { errors: res.errors, rowErrors: res.rows[0].errors, same: res.rows[0].text === generate(x).text };
        }
        return out;
    }""")
    for mode in ("description", "all"):
        assert r[mode] == {"errors": [], "rowErrors": [], "same": True}


def test_insert_template_button(page):
    r = ev(page, r"""() => {
        $('fleetPanel').open = true;
        $('fleetTemplatePorts').value = 'description';
        $('insertFleetTemplate').click();
        return { head: $('fleetCsv').value.split('\n')[0], status: $('status').textContent };
    }""")
    assert r["head"].startswith("HOSTNAME,MGMT_IP,MGMT_MASK,MGMT_VLAN,GATEWAY,SITE,GigabitEthernet1/1 description,")
    assert "CSV template inserted: 16 columns" in r["status"]
