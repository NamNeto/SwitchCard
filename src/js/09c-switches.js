// --- Switch list (v0.8.0): recipe.switches[] = { id, values, ports }. Pure apart from reading
//     teamPolicies. A row is a switch: Device details are its defaults, its own non-empty values
//     and port settings override them. This is exactly the fleet-CSV rule, so checkFleet() is the
//     CSV parser below plus checkSwitchRows(). ---
function newSwitchId() {
  return "sw-" + crypto.randomUUID();
}
// A row's port settings as cells for applyPortCells: interfaces in recipe order (unknown names
// after, in their own order), attributes in PORT_ATTRS order; empty values are skipped.
function switchPortCells(r, row) {
  const ports = (row && row.ports) || {};
  const names = Object.keys(ports);
  const lower = (s) => String(s).toLowerCase();
  const ordered = [];
  for (const iface of r.interfaces || []) {
    const hit = names.find((n) => n === iface) || names.find((n) => lower(n) === lower(iface));
    if (hit !== undefined && !ordered.includes(hit)) ordered.push(hit);
  }
  for (const n of names) if (!ordered.includes(n)) ordered.push(n);
  const cells = [];
  for (const n of ordered) {
    const set = ports[n] || {};
    const name = resolvePortName(n, r.interfaces) || n;
    for (const attr of PORT_ATTRS) {
      const v = set[attr];
      if (v != null && String(v) !== "") cells.push({ name, attr, value: String(v) });
    }
  }
  return cells;
}
// The recipe one row stands for. Shallow copy: values and ports are copied (generate() trims port
// addresses in place), everything else is shared read-only. Export history stays on the recipe.
function switchRowRecipe(r, row) {
  const own = {};
  for (const [k, v] of Object.entries((row && row.values) || {})) if (v != null && String(v) !== "") own[k] = String(v);
  const rr = {
    ...r,
    values: { ...(r.values || {}), ...own },
    ports: (r.ports || []).map((p) => ({ ...p })),
    roles: { ...(r.roles || {}) }, // generate() fills missing roles in place (ensureRoles)
    exports: {},
    switches: undefined,
  };
  normalizePorts(rr);
  const cells = switchPortCells(r, row);
  // One cell at a time in applyPortCells' own order (role first), so each error keeps its location.
  const order = { role: 0, vlan: 1, description: 2, ip: 3, mask: 4 };
  const portErrors = [],
    portFindings = [];
  for (const c of [...cells].sort((a, b) => order[a.attr] - order[b.attr]))
    for (const text of applyPortCells(rr.ports, [c])) {
      portErrors.push(text);
      portFindings.push({ level: "error", text, where: { kind: "port", name: c.name, attr: c.attr } });
    }
  return { rr, portErrors, portFindings, portSettings: cells };
}
// Per-row generate() results for the current recipe state; cleared whenever the recipe changes.
// The stamp is the full recipe JSON (not a hash), so a changed recipe can never reuse old text.
let switchRowCache = { stamp: null, map: new Map() };
function switchRecipeStamp(r) {
  const { exports: _history, switches: _list, ...rest } = r;
  return JSON.stringify(rest);
}
// Checks every row: { rows: RowResult[], warnings }. Messages are v0.7.3 checkFleet's.
// extraIpPorts (internal): port names whose ip a CSV column sets even when every cell is empty.
function checkSwitchRows(r, rows, extraIpPorts) {
  const stamp = switchRecipeStamp(r);
  if (switchRowCache.stamp !== stamp || switchRowCache.map.size > 4 * CONFIG.MAX_FLEET_ROWS)
    switchRowCache = { stamp, map: new Map() };
  const dkeys = deviceKeys(r);
  const fields = fleetColumns(r);
  const seenHost = new Map(),
    seenIp = new Map();
  const out = [];
  (rows || []).forEach((row, idx) => {
    const n = idx + 1;
    const ckey = JSON.stringify(row);
    let hit = switchRowCache.map.get(ckey);
    if (!hit) {
      const sr = switchRowRecipe(r, row);
      hit = { ...sr, g: generate(sr.rr) };
      hit.sha256 = sha256Hex(hit.g.text);
      switchRowCache.map.set(ckey, hit);
    }
    const { rr, g } = hit;
    const errors = [...hit.portErrors, ...g.errors];
    const findings = [...hit.portFindings, ...g.findings];
    const dup = (text, key) => (errors.push(text), findings.push({ level: "error", text, where: { kind: "row", key } }));
    const values = {};
    for (const k of fields) values[k] = String(rr.values[k] || "");
    const rv = (row && row.values) || {};
    const own = fields.filter((k) => rv[k] != null && String(rv[k]) !== "");
    const inherited = fields.filter((k) => !own.includes(k)); // taken from Device details
    const host = String(rr.values.HOSTNAME || "").trim(),
      ip = String(rr.values.MGMT_IP || "").trim();
    if (dkeys.includes("HOSTNAME") && host) {
      const k = host.toLowerCase();
      if (seenHost.has(k)) dup("duplicate HOSTNAME (also row " + seenHost.get(k) + ")", "HOSTNAME");
      else seenHost.set(k, n);
    }
    if (dkeys.includes("MGMT_IP") && ip) {
      if (seenIp.has(ip)) dup("duplicate MGMT_IP (also row " + seenIp.get(ip) + ")", "MGMT_IP");
      else seenIp.set(ip, n);
    }
    const policy = errors.length ? [] : policyViolations(g.text, teamPolicies);
    out.push({
      n, row, values, own, inherited, host, ip, errors, findings, policy, warnings: g.warnings, text: g.text,
      sha256: hit.sha256, lines: previewLineCount(g.text), bytes: previewByteLength(g.text), recipe: rr,
      portSettings: hit.portSettings,
    });
  });
  const warnings = [];
  // Routed port addresses live in the shared port table, so a multi-switch list repeats them.
  if (out.length > 1 && keys(r.template || "").includes("PORTS")) {
    const ifaceSet = new Set((r.interfaces || []).map((x) => String(x).toLowerCase()));
    const perSwitchIp = new Set((extraIpPorts || []).map((x) => String(x).toLowerCase()));
    for (const res of out) for (const c of res.portSettings) if (c.attr === "ip") perSwitchIp.add(String(c.name).toLowerCase());
    const routed = (r.ports || []).filter(
      (p) =>
        p.role === "routed" && ifaceSet.has(String(p.name || "").toLowerCase()) && String(p.ip || "").trim() &&
        !perSwitchIp.has(String(p.name || "").toLowerCase()),
    );
    if (routed.length)
      warnings.push(
        "Routed port addresses come from the shared port table, so every switch in this fleet gets the same ones (" +
          routed.map((p) => p.name + " " + String(p.ip).trim() + " " + String(p.mask || "").trim()).join(", ") +
          "). Confirm that is intended, for example for identical cells behind NAT, or add a column such as " +
          routed[0].name + " ip to set it per switch.",
      );
  }
  return { rows: out, warnings };
}
// A fleet CSV -> rows { id, values (non-empty bound cells), ports { iface: { attr: value } } }.
// Header rules and messages are v0.7.3 checkFleet's. decodeProblems counts cells holding U+FFFD
// (text that was not valid in the encoding it was read with).
function switchRowsFromCsv(r, text) {
  const result = { errors: [], warnings: [], rows: [], header: [], portCols: [], decodeProblems: 0 };
  const parsed = parseCsv(text);
  if (!parsed.header.length) {
    result.errors.push("Paste a CSV with a header row first.");
    return result;
  }
  const dkeys = deviceKeys(r);
  // Port columns ("Gi1/3 description") set one switch's port; every other column is a placeholder.
  const portCols = [],
    plainIdx = [],
    badPorts = [];
  (parsed.rawHeader || parsed.header).forEach((raw, i) => {
    const pc = portColumnOf(raw);
    if (!pc) return plainIdx.push(i);
    const name = resolvePortName(pc.iface, r.interfaces);
    if (name) portCols.push({ name, attr: pc.attr, i, label: name + " " + pc.attr });
    else badPorts.push(raw);
  });
  if (badPorts.length) {
    result.errors.push("Port columns name interfaces this recipe does not have: " + badPorts.join(", ") + ".");
    return result;
  }
  const plain = plainIdx.map((i) => parsed.header[i]);
  const bad = plain.filter((h) => !/^[A-Z][A-Z0-9_]*$/.test(h));
  if (bad.length) {
    result.errors.push("Header names must be placeholder names such as HOSTNAME, or port columns such as Gi1/3 description (got: " + bad.join(", ") + ").");
    return result;
  }
  const allNames = plain.concat(portCols.map((c) => c.label.toLowerCase()));
  if (new Set(allNames).size !== allNames.length) {
    result.errors.push("Duplicate column names in the header.");
    return result;
  }
  if (portCols.length && !keys(r.template || "").includes("PORTS"))
    result.warnings.push("Port columns have no effect: this recipe's template has no {{PORTS}}.");
  result.portCols = portCols.map((c) => c.label);
  const reserved = plain.filter((h) => CONFIG.RESERVED_VALUE_KEYS.includes(h) || CONFIG.DERIVED_KEYS.includes(h) || ["PORTS", "VLANS"].includes(h));
  if (reserved.length) {
    result.errors.push("Columns " + reserved.join(", ") + " are filled by SwitchCard and cannot be set per switch.");
    return result;
  }
  const unknown = plain.filter((h) => !dkeys.includes(h));
  if (unknown.length) result.warnings.push("Columns not used by this recipe are ignored: " + unknown.join(", ") + ".");
  if (!parsed.rows.length) {
    result.errors.push("The CSV has a header but no switch rows.");
    return result;
  }
  if (parsed.rows.length > CONFIG.MAX_FLEET_ROWS) {
    result.errors.push("At most " + CONFIG.MAX_FLEET_ROWS + " switches per fleet (got " + parsed.rows.length + ").");
    return result;
  }
  const usedCols = plainIdx.map((i) => [parsed.header[i], i]).filter(([h]) => dkeys.includes(h));
  if (!usedCols.length && !portCols.length) {
    result.errors.push("No column matches a field of this recipe (" + dkeys.join(", ") + ").");
    return result;
  }
  result.header = usedCols.map(([h]) => h);
  for (const cells of parsed.rows) {
    for (const c of cells) if (c.includes("�")) result.decodeProblems++;
    const row = { id: newSwitchId(), values: {}, ports: {} };
    for (const [h, i] of usedCols) {
      const c = cells[i] === undefined ? "" : cells[i];
      if (c !== "") row.values[h] = c;
    }
    for (const c of portCols) {
      const v = cells[c.i];
      if (v === undefined || v === "") continue;
      (row.ports[c.name] = row.ports[c.name] || {})[c.attr] = v;
    }
    result.rows.push(row);
  }
  return result;
}
// Rows -> CSV: the recipe's bound columns, then "<iface> <attr>" for every port setting some row
// has, in interface then PORT_ATTRS order. Cells are the row's own values; empty stays empty.
function switchRowsToCsv(r, rows) {
  const columns = fleetColumns(r);
  const list = rows || [];
  const ifaces = [];
  const lower = (s) => String(s).toLowerCase();
  const all = list.flatMap((row) => Object.keys((row && row.ports) || {}));
  for (const n of r.interfaces || []) if (all.some((x) => lower(x) === lower(n))) ifaces.push(n);
  for (const n of all) if (!ifaces.some((x) => lower(x) === lower(n))) ifaces.push(n);
  const portOf = (row, iface) => {
    const ports = (row && row.ports) || {};
    const k = Object.keys(ports).find((x) => x === iface) || Object.keys(ports).find((x) => lower(x) === lower(iface));
    return k === undefined ? {} : ports[k] || {};
  };
  const portCols = [];
  for (const iface of ifaces)
    for (const attr of PORT_ATTRS)
      if (list.some((row) => { const v = portOf(row, iface)[attr]; return v != null && String(v) !== ""; }))
        portCols.push([iface, attr]);
  const header = columns.concat(portCols.map(([i, a]) => i + " " + a));
  const cells = list.map((row) => {
    const o = {};
    const v = (row && row.values) || {};
    for (const k of columns) o[k] = v[k] == null ? "" : String(v[k]);
    for (const [i, a] of portCols) {
      const pv = portOf(row, i)[a];
      o[i + " " + a] = pv == null ? "" : String(pv);
    }
    return o;
  });
  return { columns: header, text: header.length ? toCsv(header, cells) : "" };
}
// n new rows that count HOSTNAME and MGMT_IP up. An empty list starts with the Build-a-card switch
// itself; otherwise counting continues from the last row's effective values. New rows carry only
// HOSTNAME and MGMT_IP, so everything else keeps following Device details.
function countedUpRows(r, rows, n) {
  const list = rows || [];
  const count = Number(String(n == null ? "" : n).trim());
  if (!Number.isInteger(count) || count < 1 || count > CONFIG.MAX_FLEET_ROWS)
    return { error: "Enter a number of switches from 1 to " + CONFIG.MAX_FLEET_ROWS + "." };
  if (list.length + count > CONFIG.MAX_FLEET_ROWS)
    return {
      error: "At most " + CONFIG.MAX_FLEET_ROWS + " switches per recipe; the list has " + list.length +
        ", so at most " + Math.max(0, CONFIG.MAX_FLEET_ROWS - list.length) + " more fit.",
    };
  const make = (vals) => {
    const values = {};
    for (const k of ["HOSTNAME", "MGMT_IP"]) if (vals[k] != null && vals[k] !== "") values[k] = vals[k];
    return { id: newSwitchId(), values, ports: {} };
  };
  if (!list.length) {
    if (count === 1) {
      const dkeys = deviceKeys(r);
      const v = r.values || {};
      const row = {};
      for (const k of ["HOSTNAME", "MGMT_IP"]) if (dkeys.includes(k)) row[k] = String(v[k] || "").trim();
      return { rows: [make(row)] };
    }
    const res = fleetCopyRows(r, count);
    return res.error ? { error: res.error } : { rows: res.rows.map(make) };
  }
  const last = list[list.length - 1];
  const eff = switchRowRecipe(r, last).rr;
  const res = fleetCopyRows(eff, count + 1);
  if (res.error) {
    let error = res.error.replace(/in Device details/g, "in the last row");
    // fleetCopyRows counts the last row too; say how many NEW rows fit.
    const m = /^Only (\d+) switch(?:es)? fit between (\S+) and/.exec(error);
    if (m) {
      const more = Number(m[1]) - 1;
      error = error.replace(m[0].slice(0, m[0].indexOf(" fit")), "Only " + more + " more switch" + (more === 1 ? "" : "es"));
    }
    return { error };
  }
  return { rows: res.rows.slice(1).map(make) };
}
// Export state of one switch's text against the recipe's export history (keyed by hostname).
function exportState(r, host, sha256) {
  const key = exportHistoryKey(host);
  if (!key || !deviceKeys(r).includes("HOSTNAME")) return { state: "nohost" };
  const entry = r.exports && typeof r.exports === "object" ? r.exports[key] : null;
  if (!entry) return { state: "new" };
  return { state: entry.sha256 === sha256 ? "current" : "changed", at: entry.at, entry };
}
