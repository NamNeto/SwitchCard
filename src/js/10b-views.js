// --- Views: the left rail (Build a card / Switches / Cards / Manage) and its status chips ---
let currentView = "build";
const VIEW_TITLES = {
  build: "Prepare a switch card",
  switches: "Switches",
  cards: "Cards",
  manage: "Manage recipes & baseline",
};
const VIEW_SECTIONS = { build: "build", switches: "switches", cards: "cards", manage: "maintain" };
const VIEW_RAIL = { build: "railBuild", switches: "railSwitches", cards: "railCards", manage: "railManage" };
let railTimer = null;
// Build's subtitle, restored when leaving a view that shows its own line.
const BUILD_SUBTITLE = [...$("viewSubtitle").childNodes].map((n) => n.cloneNode(true));
const VIEW_SUBTITLES = { switches: "Empty cells use Device details from Build a card." };
// Shows one view. Leaving the recipe editor is refused while it holds an unapplied draft.
function showView(name) {
  if (!VIEW_SECTIONS[name]) return false;
  if (name !== "manage" && editorPending) {
    message("Apply your recipe changes before leaving the recipe editor.");
    return false;
  }
  currentView = name;
  for (const v of Object.keys(VIEW_SECTIONS)) {
    $(VIEW_SECTIONS[v]).hidden = v !== name;
    const b = $(VIEW_RAIL[v]);
    if (v === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  $("viewTitle").textContent = VIEW_TITLES[name];
  if (VIEW_SUBTITLES[name]) $("viewSubtitle").textContent = VIEW_SUBTITLES[name];
  else $("viewSubtitle").replaceChildren(...BUILD_SUBTITLE.map((n) => n.cloneNode(true)));
  if (name === "manage" && !editorPending) loadEditor();
  if (name === "switches" && typeof renderSwitches === "function") renderSwitches();
  if (name === "cards" && typeof renderCards === "function") renderCards();
  scheduleRailUpdate();
  return true;
}
// Chip texts are recomputed 250 ms after the last change, not on every keystroke.
function scheduleRailUpdate() {
  clearTimeout(railTimer);
  railTimer = setTimeout(updateRail, 250);
}
function updateRail() {
  let r;
  try {
    r = current();
  } catch (e) {
    return;
  }
  const rows = r.switches || [];
  const res = rows.length ? checkSwitchRows(r, rows) : { rows: [] };
  const bad = res.rows.filter((x) => x.errors.length).length;
  $("chipSwitches").textContent = rows.length + (bad ? " · " + bad + (bad === 1 ? " error" : " errors") : "");
  const up = res.rows.filter((x) => exportState(r, x.host, x.sha256).state === "current").length;
  $("chipCards").textContent = up + " of " + rows.length + " up to date";
  $("chipManage").textContent = baseline ? baseline.version : "no baseline";
}

// --- Switches view: one row per switch (Device details are the defaults), CSV in and out,
//     a Ports dialog per switch and a side panel for the selected row. The table body is rebuilt
//     only when the recipe, its columns or the row ids change; edits patch cells in place, so the
//     focused input keeps its caret. ---
let swSelectedId = null;
let swGridKey = null; // recipe id + columns + row ids the table body was built for
function renderSwitches() {
  const r = current();
  const rows = r.switches || [];
  const cols = fleetColumns(r);
  const gridKey = JSON.stringify([r.id, cols, rows.map((x) => x.id)]);
  if (gridKey !== swGridKey) buildSwitchGrid(cols, rows);
  swGridKey = gridKey;
  patchSwitchGrid(r);
}
function buildSwitchGrid(cols, rows) {
  $("swHead").replaceChildren(
    el("tr", {},
      el("th", {}, "#"),
      cols.map((k) => el("th", { dataKey: k, title: "{{" + k + "}}" }, fieldLabel(k))),
      el("th", {}, "Ports"), el("th", {}, "Status"), el("th", {}, ""), el("th", {}, "")),
  );
  const body = [
    el("tr", { className: "defaults" },
      el("td", { title: "Device details on Build a card" }, "Defaults"),
      cols.map((k) => el("td", { dataKey: k })),
      el("td", { colSpan: 4 }, "from Build a card")),
  ];
  rows.forEach((row, i) => {
    body.push(
      el("tr", { dataRow: row.id },
        el("td", { className: "num" }, String(i + 1)),
        cols.map((k) =>
          el("td", {}, el("input", { dataRow: row.id, dataKey: k, autocomplete: "off", ariaLabel: fieldLabel(k) + ", switch " + (i + 1) }))),
        el("td", {}, el("button", { type: "button", className: "sw-ports", title: "Port settings of this switch" })),
        el("td", { className: "status" }),
        el("td", {}, el("button", { type: "button", className: "sw-copy", title: "Copy this switch below itself" }, "Copy")),
        el("td", {}, el("button", { type: "button", className: "sw-remove danger" }, "Remove"))),
    );
  });
  $("swRows").replaceChildren(...body);
}
// Status text for one checked row: "OK", "OK · 2 notes" or "3 errors"; the title lists them all.
function switchStatus(x) {
  const notes = x.warnings.length + x.policy.length;
  const n = x.errors.length;
  return {
    text: n ? n + (n === 1 ? " error" : " errors") : "OK" + (notes ? " · " + notes + (notes === 1 ? " note" : " notes") : ""),
    title: [...x.errors, ...x.warnings, ...x.policy.map((p) => "Team policy: " + p)].join("\n"),
    bad: n > 0,
  };
}
// Re-checks the list (cached per row) and updates values, placeholders, inherit marks, port
// counts, statuses and the side panel in the existing table.
function patchSwitchGrid(r) {
  const rows = r.switches || [];
  const res = rows.length ? checkSwitchRows(r, rows) : { rows: [], warnings: [] };
  const byId = new Map(res.rows.map((x) => [x.row.id, x]));
  const defs = r.values || {};
  const defaults = $("swRows").querySelector("tr.defaults");
  if (defaults) for (const td of defaults.querySelectorAll("td[data-key]")) td.textContent = String(defs[td.dataset.key] || "");
  for (const tr of $("swRows").querySelectorAll("tr[data-row]")) {
    const x = byId.get(tr.dataset.row);
    if (!x) continue;
    const vals = x.row.values || {};
    for (const input of tr.querySelectorAll("input[data-key]")) {
      const k = input.dataset.key;
      const own = vals[k] == null ? "" : String(vals[k]);
      if (input !== document.activeElement && input.value !== own) input.value = own;
      const inherited = String(defs[k] || "");
      if (input.placeholder !== inherited) input.placeholder = inherited;
      input.classList.toggle("inherit", own === "");
    }
    const set = Object.values(x.row.ports || {}).filter((p) => p && Object.keys(p).length).length;
    tr.querySelector("button.sw-ports").textContent = set ? set + " set" : "table";
    const st = switchStatus(x);
    const td = tr.querySelector("td.status");
    td.textContent = st.text;
    td.title = st.title;
    td.className = "status " + (st.bad ? "bad" : "ok");
    tr.classList.toggle("selected", tr.dataset.row === swSelectedId);
  }
  $("swEmpty").hidden = rows.length > 0;
  $("swNotes").textContent = res.warnings.join(" ");
  $("swNotes").hidden = !res.warnings.length;
  if (!byId.has(swSelectedId)) swSelectedId = null;
  renderSwitchPanel(r, swSelectedId ? byId.get(swSelectedId) : null);
  scheduleRailUpdate();
}
// Side panel: the selected row's checks, its editcontent.txt and changes since its last export.
function renderSwitchPanel(r, x) {
  const checks = $("swChecks");
  checks.replaceChildren();
  $("swDiffPanel").hidden = true;
  if (!x) {
    $("swPanelTitle").textContent = "Selected switch";
    $("swPreview").textContent = "Select a row to see its checks and its editcontent.txt.";
    return;
  }
  $("swPanelTitle").textContent = "Switch " + x.n + (x.host ? " · " + x.host : "");
  const items = [
    ...x.findings.map((f) => ({ level: f.level, text: f.text, where: f.where })),
    ...x.policy.map((p) => ({ level: "warning", text: "Team policy: " + p, where: null })),
  ];
  // Each check carries its location (data-where) for the clickable checks.
  for (const f of items)
    checks.append(el("li", { className: f.level === "error" ? "bad" : "warn", dataWhere: f.where ? JSON.stringify(f.where) : null }, f.text));
  if (!items.length) checks.append(el("li", { className: "ok" }, "No problems found."));
  $("swPreview").textContent = x.text || "No output: fix the errors above.";
  const key = exportHistoryKey(x.host);
  const prev = key && r.exports && Object.hasOwn(r.exports, key) ? r.exports[key] : null;
  if (prev && !x.errors.length) {
    $("swDiffPanel").hidden = false;
    fillDiff($("swDiffSummary"), $("swDiff"), prev, x.text);
  }
}
function selectSwitch(id) {
  if (id === swSelectedId) return;
  swSelectedId = id;
  for (const tr of $("swRows").querySelectorAll("tr[data-row]")) tr.classList.toggle("selected", tr.dataset.row === id);
  const r = current();
  const x = checkSwitchRows(r, r.switches || []).rows.find((y) => y.row.id === id);
  renderSwitchPanel(r, x || null);
}
// Sets (or, when empty, deletes) one cell of a row and patches the table.
function setSwitchCell(input, value) {
  const r = current();
  const row = (r.switches || []).find((x) => x.id === input.dataset.row);
  if (!row) return;
  if (!row.values) row.values = {};
  if (value === "") delete row.values[input.dataset.key];
  else row.values[input.dataset.key] = value;
  touch();
  patchSwitchGrid(r);
}
function copySwitchRow(id) {
  const r = current();
  const rows = r.switches || [];
  const i = rows.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (rows.length >= CONFIG.MAX_FLEET_ROWS) {
    message("At most " + CONFIG.MAX_FLEET_ROWS + " switches per recipe.");
    return;
  }
  const copy = { ...structuredClone(rows[i]), id: newSwitchId() };
  rows.splice(i + 1, 0, copy);
  swSelectedId = copy.id;
  touch();
  renderSwitches();
  message("Copied switch " + (i + 1) + ". The copy is flagged as a duplicate until you change its hostname and management IP.");
}
async function removeSwitchRow(id) {
  const r = current();
  const rows = r.switches || [];
  const i = rows.findIndex((x) => x.id === id);
  if (i < 0) return;
  const host = String((rows[i].values && rows[i].values.HOSTNAME) || (r.values && r.values.HOSTNAME) || "").trim();
  const what = "switch " + (i + 1) + (host ? " (" + host + ")" : "");
  if (!(await confirmDialog("Remove this switch?", "Remove " + what + " from the list?", { ok: "Remove", danger: true }))) return;
  const j = rows.findIndex((x) => x.id === id);
  if (j >= 0) rows.splice(j, 1);
  touch();
  renderSwitches();
  message("Removed " + what + ".");
}
// Columns of a CSV header that are neither used by the recipe nor port columns.
function ignoredCsvColumns(text, parsed) {
  const p = parseCsv(text);
  const raw = p.rawHeader || p.header;
  return p.header.filter((h, i) => !portColumnOf(raw[i]) && !parsed.header.includes(h));
}
// Import CSV: paste, Load file or Start from template, a live summary, then Add after / Replace.
function openImportDialog() {
  const r = current();
  normalizePorts(r);
  const columns = el("p", { className: "muted fleet-columns" });
  const ex = fillFleetColumnsLine(columns, r);
  const box = el("textarea", { rows: 8, placeholder: ex.text, ariaLabel: "CSV text" });
  box.spellcheck = false;
  const file = el("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain", className: "fileinput" });
  const summary = el("div", { className: "sw-import-summary", ariaLive: "polite" });
  let parsed = null,
    loadError = "",
    buttons = [];
  const refresh = () => {
    const text = box.value;
    parsed = text.trim() ? switchRowsFromCsv(r, text) : null;
    const room = CONFIG.MAX_FLEET_ROWS - (r.switches || []).length;
    const ok = !!parsed && !parsed.errors.length && parsed.rows.length > 0;
    const p = (cls, t) => summary.append(el("p", { className: cls }, t));
    summary.replaceChildren();
    if (loadError) p("bad", loadError);
    if (!parsed) p("muted", "Paste a CSV, load a file or start from the template.");
    else if (parsed.errors.length) for (const e of parsed.errors) p("bad", e);
    else {
      p("", parsed.rows.length + (parsed.rows.length === 1 ? " row" : " rows") + " found.");
      p("", "Columns used: " + (parsed.header.join(", ") || "none") + ".");
      const ignored = ignoredCsvColumns(text, parsed);
      if (ignored.length) p("", "Ignored columns: " + ignored.join(", ") + ".");
      if (parsed.portCols.length) p("", "Port columns: " + parsed.portCols.join(", ") + ".");
      for (const w of parsed.warnings) if (!w.startsWith("Columns not used")) p("warn", w);
      if (parsed.rows.length > room)
        p("warn", "Add after would pass " + CONFIG.MAX_FLEET_ROWS + " switches (the list has " + (r.switches || []).length + "); use Replace.");
    }
    if (parsed && parsed.decodeProblems)
      p("bad", parsed.decodeProblems + (parsed.decodeProblems === 1 ? " cell" : " cells") + " could not be read as UTF-8 — save the CSV as UTF-8.");
    if (buttons.length) {
      buttons[1].disabled = !ok || parsed.rows.length > room;
      buttons[2].disabled = !ok;
    }
  };
  file.addEventListener("change", async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      loadError = "";
      if (f.size > 2 * 1024 * 1024) loadError = "CSV file is too large (max 2 MiB).";
      else box.value = await f.text();
    } finally {
      file.value = "";
    }
    refresh();
  });
  box.addEventListener("input", () => {
    loadError = "";
    refresh();
  });
  const fromTemplate = el("button", {
    type: "button",
    onclick: () => {
      box.value = fleetCsvTemplate(r, $("swTemplateMode").value).text;
      loadError = "";
      refresh();
    },
  }, "Start from template");
  const body = el("div", {},
    columns, box,
    el("div", { className: "actions even" }, el("label", { className: "filebutton" }, "Load file", file), fromTemplate),
    summary);
  return showDialog({
    title: "Import CSV",
    body,
    actions: [
      { label: "Cancel", value: null },
      { label: "Add after", value: "add", disabled: true },
      { label: "Replace", value: "replace", primary: true, disabled: true },
    ],
    onOpen: (dlg) => {
      dlg.classList.add("dlg-wide");
      buttons = [...dlg.querySelectorAll(".dialog-actions button")];
      refresh();
      box.focus();
    },
  }).then((choice) => {
    if (!choice || !parsed || parsed.errors.length || !parsed.rows.length) return;
    const before = (r.switches || []).length;
    r.switches = choice === "replace" ? parsed.rows : (r.switches || []).concat(parsed.rows);
    swSelectedId = null;
    touch();
    if (currentView === "switches") renderSwitches();
    const n = parsed.rows.length;
    message("Imported " + n + " switch" + (n === 1 ? "" : "es") +
      (choice === "replace" ? (before ? ", replacing the " + before + " in the list." : ".") : " after the " + before + " in the list."));
  });
}
// Ports dialog for one row: effective values per port (grey when they come from the port table);
// typing sets this switch's own value, Use table clears that port's settings.
function openPortsDialog(row, focus) {
  const r = current();
  normalizePorts(r);
  const lower = (s) => String(s).toLowerCase();
  const ownKey = (name) => {
    const ks = Object.keys(row.ports || {});
    const k = ks.find((x) => x === name);
    return k !== undefined ? k : ks.find((x) => lower(x) === lower(name));
  };
  const ownSet = (name) => {
    const k = ownKey(name);
    return k === undefined ? {} : row.ports[k] || {};
  };
  const setOwn = (name, attr, value) => {
    if (!row.ports) row.ports = {};
    const found = ownKey(name);
    const k = found === undefined ? name : found;
    const set = { ...(row.ports[k] || {}) };
    if (value === "") delete set[attr];
    else set[attr] = value;
    if (attr === "role" && value !== "routed") {
      delete set.ip;
      delete set.mask;
    }
    if (Object.keys(set).length) row.ports[k] = set;
    else delete row.ports[k];
    touch();
  };
  const changed = () => {
    if (currentView === "switches") patchSwitchGrid(r);
  };
  const wrap = el("div", {});
  const draw = (want) => {
    const eff = switchRowRecipe(r, row).rr.ports;
    const tbody = el("tbody");
    for (const name of r.interfaces || []) {
      const e = eff.find((p) => lower(p.name) === lower(name)) || { name, role: "unused" };
      const own = ownSet(name);
      const effRole = own.role || e.role;
      const role = el("select", { dataPort: name, dataAttr: "role", ariaLabel: name + " role" },
        ROLE_NAMES.map((v) => option(v, v[0].toUpperCase() + v.slice(1))));
      if (own.role && !ROLE_NAMES.includes(own.role)) role.append(option(own.role, own.role + " (unknown)"));
      role.value = effRole;
      role.classList.toggle("inherit", !own.role);
      role.addEventListener("change", () => {
        setOwn(name, "role", role.value);
        draw({ name, attr: "role" });
        changed();
      });
      const cell = (attr) => {
        const input = el("input", { dataPort: name, dataAttr: attr, ariaLabel: name + " " + attr, autocomplete: "off" });
        input.value = own[attr] == null ? "" : String(own[attr]);
        input.placeholder = String(e[attr] || "");
        input.classList.toggle("inherit", input.value === "");
        input.disabled = (attr === "ip" || attr === "mask") && effRole !== "routed";
        input.addEventListener("input", () => {
          const v = cleanInput(input, name + " " + attr, attr !== "description");
          setOwn(name, attr, v);
          input.classList.toggle("inherit", v === "");
          changed();
        });
        return el("td", {}, input);
      };
      const useTable = el("button", {
        type: "button", className: "use-table", dataPort: name, disabled: !Object.keys(own).length,
        onclick: () => {
          const k = ownKey(name);
          if (k !== undefined) delete row.ports[k];
          touch();
          draw();
          changed();
        },
      }, "Use table");
      tbody.append(el("tr", {}, el("td", {}, name), el("td", {}, role), cell("vlan"), cell("description"), cell("ip"), cell("mask"), el("td", {}, useTable)));
    }
    const unknown = Object.keys(row.ports || {}).filter((k) => switchOverrideIface(k, r.interfaces) === null);
    wrap.replaceChildren(
      el("p", { className: "muted" },
        "Grey values come from the port table on Build a card; typing sets the value for this switch only. Use table clears the settings of this switch for that port."),
      (r.interfaces || []).length
        ? el("div", { className: "scroll" },
          el("table", { className: "sw-ports-table" },
            el("thead", {}, el("tr", {}, ["Interface", "Role", "VLAN", "Description", "IP", "Mask", ""].map((h) => el("th", {}, h)))),
            tbody))
        : el("p", {}, "This recipe has no ports."),
      unknown.length ? el("p", {}, "Settings for interfaces this recipe does not have:") : "",
      unknown.length
        ? el("ul", { className: "sw-unknown" }, unknown.map((k) =>
          el("li", {},
            k + ": " + Object.entries(row.ports[k] || {}).map(([a, v]) => a + " " + v).join(", ") + " ",
            el("button", {
              type: "button", className: "remove-unknown danger", dataPort: k,
              onclick: () => {
                delete row.ports[k];
                touch();
                draw();
                changed();
              },
            }, "Remove"))))
        : "",
    );
    if (want) {
      const t = [...wrap.querySelectorAll("[data-port]")].find((n) => lower(n.dataset.port) === lower(want.name) && n.dataset.attr === want.attr);
      if (t) t.focus();
    }
  };
  draw();
  const n = (r.switches || []).indexOf(row) + 1;
  const host = String((row.values && row.values.HOSTNAME) || (r.values && r.values.HOSTNAME) || "").trim();
  return showDialog({
    title: "Ports · switch " + n + (host ? " (" + host + ")" : ""),
    body: wrap,
    actions: [{ label: "Close", value: true, primary: true }],
    onOpen: (dlg) => {
      dlg.classList.add("dlg-wide");
      if (focus) draw(focus);
    },
  }).then(() => {
    if (currentView === "switches") renderSwitches();
  });
}
// --- Switches view wiring ---
$("swRows").addEventListener("input", (e) => {
  const t = e.target;
  if (t.matches("input[data-key]")) setSwitchCell(t, cleanInput(t, fieldLabel(t.dataset.key)));
});
// Trim when the cell loses focus, not while typing.
$("swRows").addEventListener("change", (e) => {
  const t = e.target;
  if (!t.matches("input[data-key]")) return;
  const v = t.value.trim();
  if (v !== t.value) {
    t.value = v;
    setSwitchCell(t, v);
  }
});
// Arrow Up/Down and Enter (Shift+Enter up) move to the same column of the next row.
$("swRows").addEventListener("keydown", (e) => {
  const t = e.target;
  if (!t.matches("input[data-key]")) return;
  const dir = e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey) ? 1 : e.key === "ArrowUp" || e.key === "Enter" ? -1 : 0;
  if (!dir) return;
  const trs = [...$("swRows").querySelectorAll("tr[data-row]")];
  const next = trs[trs.indexOf(t.closest("tr")) + dir];
  e.preventDefault();
  if (next) next.querySelector('input[data-key="' + CSS.escape(t.dataset.key) + '"]').focus();
});
$("swRows").addEventListener("focusin", (e) => {
  const tr = e.target.closest("tr[data-row]");
  if (tr) selectSwitch(tr.dataset.row);
});
$("swRows").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-row]");
  if (!tr) return;
  const id = tr.dataset.row;
  selectSwitch(id);
  if (e.target.closest("button.sw-copy")) copySwitchRow(id);
  else if (e.target.closest("button.sw-remove")) removeSwitchRow(id);
  else if (e.target.closest("button.sw-ports")) {
    const row = (current().switches || []).find((x) => x.id === id);
    if (row) openPortsDialog(row);
  }
});
$("swAdd").onclick = () => {
  const r = current();
  const res = countedUpRows(r, r.switches || [], $("swCount").value);
  if (res.error) {
    message(res.error);
    return;
  }
  r.switches = (r.switches || []).concat(res.rows);
  touch();
  renderSwitches();
  const n = res.rows.length;
  message("Added " + n + " switch" + (n === 1 ? "" : "es") + ". Empty cells follow Device details on Build a card.");
};
$("swCount").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("swAdd").click();
  }
});
$("swImport").onclick = () => openImportDialog();
$("swExport").onclick = () => {
  const r = current();
  const rows = r.switches || [];
  if (!rows.length) {
    message("No switches to export yet.");
    return;
  }
  const csv = switchRowsToCsv(r, rows);
  if (!csv.text) {
    message("This recipe has no per-switch fields to put in a CSV.");
    return;
  }
  downloadCsv(csv.text, "switchcard-switches-" + csvFileStem(r) + ".csv");
  message("Exported " + rows.length + " switch" + (rows.length === 1 ? "" : "es") + " as CSV (" + csv.columns.length +
    " columns; empty cells follow Device details).");
};
$("swTemplate").onclick = () => {
  const r = current();
  normalizePorts(r);
  const t = fleetCsvTemplate(r, $("swTemplateMode").value);
  if (!t.text) {
    message("This recipe has no per-switch fields or ports to put in a CSV.");
    return;
  }
  downloadCsv(t.text, "switchcard-fleet-template-" + csvFileStem(r) + ".csv");
  message("CSV template downloaded (" + t.columns.length + " columns, row 1 is the switch on Build a card). Fill one row per switch, then Import CSV.");
};
$("swRemoveAll").onclick = async () => {
  const r = current();
  const n = (r.switches || []).length;
  if (!n) {
    message("The switch list is already empty.");
    return;
  }
  if (!(await confirmDialog("Remove all switches?",
    "Remove all " + n + " switch" + (n === 1 ? "" : "es") + ' of recipe "' + r.name + '"? Device details on Build a card stay as they are.',
    { ok: "Remove all", danger: true }))) return;
  r.switches = [];
  swSelectedId = null;
  touch();
  renderSwitches();
  message("Removed all " + n + " switch" + (n === 1 ? "" : "es") + ".");
};
// The shared recipe picker re-renders the list (its onchange, set earlier, switches the recipe).
$("swRecipe").addEventListener("change", () => {
  if (currentView === "switches") renderSwitches();
});
