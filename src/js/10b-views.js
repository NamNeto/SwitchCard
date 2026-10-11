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
const VIEW_SUBTITLES = {
  switches: "Empty cells use Device details from Build a card.",
  cards: "One SD-card ZIP per switch; Last export shows what changed since.",
  manage: "Firmware baseline, recipes, templates and team rules. Recipe edits take effect after Apply recipe changes.",
};
// Shows one view. Leaving the recipe editor is refused while it holds an unapplied draft.
function showView(name) {
  if (!VIEW_SECTIONS[name]) return false;
  if (typeof cardRun !== "undefined" && cardRun && name !== currentView) {
    message("A card export is running (" + cardRun.step + "). Other views open again when it ends; use Cancel after this card to stop early.");
    return false;
  }
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
  if (name === "manage" && typeof growEditorTextareas === "function") growEditorTextareas();
  if (name === "build" && typeof sizeBuildPane === "function") sizeBuildPane();
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
  // Team-policy hits block export, so they count as errors here too (fail closed).
  const bad = res.rows.filter((x) => x.errors.length || x.policy.length).length;
  // One format on every chip ("12 switches · 4 errors", "6 of 12 up to date"); the error count is
  // its own red span, so the number of switches keeps the chip colour.
  const chip = $("chipSwitches");
  chip.replaceChildren(rows.length ? rows.length + (rows.length === 1 ? " switch" : " switches") : "no switches yet");
  if (bad) chip.append(" · ", el("span", { className: "chip-err" }, bad + (bad === 1 ? " error" : " errors")));
  chip.classList.toggle("chip-bad", bad > 0);
  const up = res.rows.filter((x) => exportState(r, x.host, x.sha256).state === "current").length;
  $("chipCards").textContent = rows.length ? up + " of " + rows.length + " up to date" : "nothing to export yet";
  $("chipManage").textContent = baseline ? baseline.version : "no baseline";
  // The open Cards view follows the same changes (recipe, switches, template, baseline, policies).
  if (currentView === "cards" && typeof renderCards === "function") renderCards();
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
// Short column headers for the common fields, so headers stay on one line; the title has the rest.
const SW_SHORT_LABELS = { MGMT_IP: "Mgmt IP", MGMT_MASK: "Mask", MGMT_VLAN: "VLAN", GATEWAY: "Gateway", MGMT_LOOPBACK: "Loopback" };
function buildSwitchGrid(cols, rows) {
  // Every cell carries its column as a class (c-HOSTNAME, c-ports, c-copy, ...) for the widths
  // and for the narrow layout, which folds the two icon columns into the selected row's line.
  $("swHead").replaceChildren(
    el("tr", {},
      el("th", {}, "#"),
      el("th", {}, "Status"),
      cols.map((k) => el("th", { className: "c-" + k, dataKey: k, title: fieldLabel(k) + " {{" + k + "}}" }, SW_SHORT_LABELS[k] || fieldLabel(k))),
      el("th", { className: "c-ports" }, "Ports"),
      el("th", { className: "c-copy" }, el("span", { className: "visually-hidden" }, "Copy")),
      el("th", { className: "c-remove" }, el("span", { className: "visually-hidden" }, "Remove"))),
  );
  const body = [
    el("tr", { className: "defaults" },
      el("td", { colSpan: 2, title: "Device details and the port table on Build a card" }, "Defaults"),
      cols.map((k) => el("td", { className: "c-" + k, dataKey: k })),
      el("td", { className: "c-ports", title: "The port table on Build a card" }, "Build"),
      el("td", { className: "c-copy" }),
      el("td", { className: "c-remove" })),
  ];
  rows.forEach((row, i) => {
    body.push(
      el("tr", { dataRow: row.id },
        el("td", { className: "num" }, String(i + 1)),
        el("td", { className: "status" }),
        cols.map((k) =>
          // size 12: the cell's CSS width rules, not the input's 20-character default.
          el("td", { className: "c-" + k }, el("input", { dataRow: row.id, dataKey: k, size: 12, autocomplete: "off", ariaLabel: fieldLabel(k) + ", switch " + (i + 1) }))),
        el("td", { className: "c-ports" }, el("button", { type: "button", className: "sw-ports", title: "Port settings of this switch" })),
        // Compact icon buttons (their words stay for screen readers), so the row fits beside the panel.
        el("td", { className: "c-copy" }, el("button", { type: "button", className: "sw-copy sw-icon", title: "Copy this switch below itself", ariaLabel: "Copy switch " + (i + 1) + " below itself" },
          el("span", { className: "visually-hidden" }, "Copy"))),
        el("td", { className: "c-remove" }, el("button", { type: "button", className: "sw-remove sw-icon", title: "Remove this switch", ariaLabel: "Remove switch " + (i + 1) },
          el("span", { ariaHidden: "true" }, "×"), el("span", { className: "visually-hidden" }, "Remove")))),
    );
  });
  $("swRows").replaceChildren(...body);
}
// Status text for one checked row: "OK", "OK · 2 notes" or "3 errors"; the title lists them all.
// Team-policy hits block export, so they count as errors (fail closed).
function switchStatus(x) {
  const notes = x.warnings.length;
  const n = x.errors.length + x.policy.length;
  // A duplicate says so under the count ("1 error · duplicate"): its red cell alone would not say
  // what is wrong with it. Read off the checks, which keep their own wording.
  const dup = x.errors.some((e) => /^duplicate /.test(e));
  return {
    text: n
      ? n + (n === 1 ? " error" : " errors") + (dup ? " · duplicate" : "")
      : "OK" + (notes ? " · " + notes + (notes === 1 ? " note" : " notes") : ""),
    title: [...x.errors, ...x.policy.map((p) => "Team policy: " + p), ...x.warnings].join("\n"),
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
    // The cells a check is about (a field or a duplicate), outlined in red with the check as title.
    const cellErrors = new Map();
    for (const f of x.findings)
      if (f.level === "error" && f.where && (f.where.kind === "field" || f.where.kind === "row") && !cellErrors.has(f.where.key))
        cellErrors.set(f.where.key, f.text);
    for (const input of tr.querySelectorAll("input[data-key]")) {
      const k = input.dataset.key;
      const own = vals[k] == null ? "" : String(vals[k]);
      if (input !== document.activeElement && input.value !== own) input.value = own;
      const inherited = String(defs[k] || "");
      if (input.placeholder !== inherited) input.placeholder = inherited;
      input.classList.toggle("inherit", own === "");
      const err = cellErrors.get(k);
      input.classList.toggle("cell-bad", !!err);
      // The title holds the check, else the whole value (a long one ends in an ellipsis in the cell).
      const title = err || own;
      if (err) input.setAttribute("aria-invalid", "true");
      else if (input.hasAttribute("aria-invalid")) input.removeAttribute("aria-invalid");
      if (title) {
        if (input.title !== title) input.title = title;
      } else if (input.hasAttribute("title")) input.removeAttribute("title");
    }
    const set = Object.values(x.row.ports || {}).filter((p) => p && Object.keys(p).length).length;
    const pb = tr.querySelector("button.sw-ports");
    pb.textContent = set ? set + " set" : "table";
    pb.classList.toggle("has-set", set > 0);
    const st = switchStatus(x);
    const td = tr.querySelector("td.status");
    // A clean row stays quiet: "OK" in muted text, the note count fainter still (same text). On
    // an error row the kind of error sits under the count ("1 error" / "duplicate"); the cell's
    // text is still "1 error · duplicate" (the separator is there, only not drawn).
    const sepAt = st.text.indexOf(" · ");
    const head = sepAt < 0 ? st.text : st.text.slice(0, sepAt);
    const tail = sepAt < 0 ? "" : st.text.slice(sepAt + 3);
    const pill = el("span", { className: "pill " + (st.bad ? "pill-bad" : "pill-quiet") },
      !tail || st.bad ? head : el("span", {}, head, el("span", { className: "st-notes" }, " · " + tail)));
    td.replaceChildren(pill, tail && st.bad ? el("span", { className: "st-what" }, el("span", { className: "visually-hidden" }, " · "), tail) : "");
    td.title = st.title;
    td.className = "status " + (st.bad ? "bad" : "ok");
    tr.classList.toggle("row-bad", st.bad);
    tr.classList.toggle("selected", tr.dataset.row === swSelectedId);
  }
  $("swEmpty").hidden = rows.length > 0;
  // An empty list shows the empty state alone (no placeholder side panel).
  const layout = $("swPanel").closest(".sw-layout");
  if (layout) layout.classList.toggle("sw-none", !rows.length);
  // Nothing to export or remove from an empty list: the two buttons stay where they are (the
  // toolbar keeps one shape) but are disabled, and their title says why.
  $("swExport").disabled = !rows.length;
  $("swExport").title = rows.length ? "Download the list as CSV" : "No switches to export yet";
  $("swRemoveAll").disabled = !rows.length;
  $("swRemoveAll").title = rows.length ? "Remove every switch from the list" : "The list is already empty";
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
  $("swPanelEmpty").hidden = !!x;
  $("swPreview").hidden = !x;
  const old = $("swRows").querySelector("tr.sw-detail");
  if (old) old.remove();
  if (!x) {
    $("swPanelTitle").textContent = "Selected switch";
    $("swPreview").textContent = "Select a row to see its checks and its editcontent.txt.";
    return;
  }
  const title = "Switch " + x.n + (x.host ? " · " + x.host : "");
  $("swPanelTitle").textContent = title;
  const items = [
    ...x.findings.map((f) => ({ level: f.level, text: f.text, where: f.where })),
    // Team-policy results are listed even while the row has other errors (the row check stops at
    // the first kind; the panel shows both, as Build does).
    ...(x.policy.length ? x.policy : x.errors.length && x.text ? policyViolations(x.text, teamPolicies) : [])
      .map((p) => ({ level: "error", text: "Team policy: " + p, where: { kind: "policy" } })),
  ].sort((a, b) => (a.level === "error" ? 0 : 1) - (b.level === "error" ? 0 : 1)); // errors first (stable)
  // Each check is a button that jumps to what it is about (this row's cell, its Ports dialog, ...).
  const ctx = { view: "switches", rowId: x.row.id };
  const checkList = (ul) => {
    for (const f of items)
      ul.append(el("li", { className: f.level === "error" ? "bad" : "warn" },
        el("button", { type: "button", className: "finding-link", onclick: () => focusFinding(f.where, ctx) }, f.text)));
    if (!items.length) ul.append(el("li", { className: "ok" }, "No problems found."));
    return ul;
  };
  checkList(checks);
  // The same checks inline under the row: shown by CSS only while the panel sits below the grid
  // (narrow windows), so the reason for an error is never out of view.
  const tr = [...$("swRows").querySelectorAll("tr[data-row]")].find((t) => t.dataset.row === x.row.id);
  if (tr) {
    const cols = tr.children.length;
    // Copy and Remove here too: below 1000 px the icon columns are hidden and these show instead.
    tr.after(el("tr", { className: "sw-detail" },
      el("td", { colSpan: cols },
        el("span", { className: "sw-detail-title" }, title),
        checkList(el("ul", { className: "sw-checks" })),
        el("div", { className: "sw-detail-actions" },
          el("button", { type: "button", title: "Copy this switch below itself", onclick: () => copySwitchRow(x.row.id) }, "Copy below"),
          el("button", { type: "button", className: "danger", title: "Remove this switch", onclick: () => removeSwitchRow(x.row.id) }, "Remove")))));
  }
  fillConfigPre($("swPreview"), x.text || "No output: fix the errors above.");
  const prev = lastExport(r, x.host);
  if (prev && !x.errors.length) {
    $("swDiffPanel").hidden = false;
    fillDiff($("swDiffSummary"), $("swDiff"), prev, x.text);
  }
}
// IOS text in the side panel: every line is a block that wraps only at spaces (a token such as
// 2026-10-01 or 255.255.255.0 is never split) with a hanging indent and a continuation bar, so a
// continued line can never read as a second command. The box's textContent stays the text byte
// for byte (the newline ends each block).
function fillConfigPre(pre, text) {
  const lines = String(text).split("\n");
  pre.replaceChildren(...lines.map((line, i) => {
    const b = el("span", { className: "pl" });
    for (const part of line.split(/( +)/)) if (part) b.append(/^ +$/.test(part) ? part : el("span", { className: "tok" }, part));
    if (i < lines.length - 1) b.append("\n");
    return b;
  }).filter((b, i) => i < lines.length - 1 || lines[i] !== ""));
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
  focusSwitchRow(copy.id);
  message("Copied switch " + (i + 1) + ". The copy is flagged as a duplicate until you change its hostname and management IP.");
}
// Puts focus on a row's first cell and scrolls it to the middle of the list.
function focusSwitchRow(id) {
  const tr = [...$("swRows").querySelectorAll("tr[data-row]")].find((t) => t.dataset.row === id);
  const input = tr && tr.querySelector("input[data-key]");
  if (!input) return false;
  input.focus();
  input.scrollIntoView({ block: "center" });
  return true;
}
async function removeSwitchRow(id) {
  const r = current();
  const rows = r.switches || [];
  const i = rows.findIndex((x) => x.id === id);
  if (i < 0) return;
  const host = String((rows[i].values && rows[i].values.HOSTNAME) || (r.values && r.values.HOSTNAME) || "").trim();
  const what = "switch " + (i + 1) + (host ? " (" + host + ")" : "");
  if (!(await confirmDialog("Remove this switch?", "Remove " + what + " from the list? This cannot be undone.", { ok: "Remove", danger: true }))) return;
  const j = rows.findIndex((x) => x.id === id);
  if (j >= 0) rows.splice(j, 1);
  touch();
  renderSwitches();
  // Focus the next row (or the previous one, or Add counted up when the list is empty).
  const next = rows[Math.min(Math.max(j, 0), rows.length - 1)];
  if (next) focusSwitchRow(next.id);
  else $("swAdd").focus();
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
      const have = (r.switches || []).length;
      if (have) p("notice warning", "Replace drops the " + have + " switch" + (have === 1 ? "" : "es") + " in the list.");
    }
    if (parsed && parsed.decodeProblems)
      p("bad", parsed.decodeProblems + (parsed.decodeProblems === 1 ? " cell" : " cells") + " could not be read as UTF-8 — save the CSV as UTF-8." +
        (parsed.decodeWhere && parsed.decodeWhere.length ? " Where: " + listFew(parsed.decodeWhere, 5) + "." : ""));
    const btn = (label) => buttons.find((b) => b.textContent === label);
    if (buttons.length) {
      const add = btn("Add after"),
        replace = btn("Replace");
      add.disabled = !ok || parsed.rows.length > room;
      replace.disabled = !ok;
      // Replace drops the rows in the list: never the filled primary while it would.
      replace.classList.toggle("danger", (r.switches || []).length > 0);
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
      { label: "Replace", value: "replace", disabled: true },
      { label: "Add after", value: "add", primary: true, disabled: true },
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
// "a, b, c and 4 more": the first few items of a list.
function listFew(items, few) {
  return items.slice(0, few).join(", ") + (items.length > few ? " and " + (items.length - few) + " more" : "");
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
  // baseRole: the port table's role; ip/mask go when the resulting role is not Routed.
  const setOwn = (name, attr, value, baseRole) => {
    if (!row.ports) row.ports = {};
    const found = ownKey(name);
    const k = found === undefined ? name : found;
    const set = { ...(row.ports[k] || {}) };
    if (value === "") delete set[attr];
    else set[attr] = value;
    if (attr === "role" && (value || baseRole) !== "routed") {
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
    const ports = (r.interfaces || []).map((name) => {
      const e = eff.find((p) => lower(p.name) === lower(name)) || { name, role: "unused" };
      const own = ownSet(name);
      return { name, e, own, effRole: own.role || e.role };
    });
    // Address columns only when a port is Routed (as on Build); other ports never take an address.
    const showAddr = ports.some((p) => p.effRole === "routed" || p.own.ip !== undefined || p.own.mask !== undefined);
    for (const { name, e, own, effRole } of ports) {
      const role = el("select", { dataPort: name, dataAttr: "role", ariaLabel: name + " role" },
        ROLE_NAMES.map((v) => option(v, v[0].toUpperCase() + v.slice(1))));
      if (own.role && !ROLE_NAMES.includes(own.role)) role.append(option(own.role, own.role + " (unknown)"));
      role.value = effRole;
      role.classList.toggle("inherit", !own.role);
      const baseRole = (r.ports.find((p) => lower(p.name) === lower(name)) || { role: "unused" }).role;
      role.addEventListener("change", () => {
        // Choosing the table's own role follows the table again instead of pinning a copy.
        setOwn(name, "role", role.value === baseRole ? "" : role.value, baseRole);
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
      // Use table only where this switch sets something; other ports just follow the table.
      const isOwn = Object.keys(own).length > 0;
      const useTable = isOwn
        ? el("button", {
          type: "button", className: "use-table", dataPort: name, title: "Drop this switch's settings for " + name + " and follow the port table",
          onclick: () => {
            const k = ownKey(name);
            if (k !== undefined) delete row.ports[k];
            touch();
            // The button is gone now; focus stays in the dialog on this port's Role.
            draw({ name, attr: "role" });
            changed();
          },
        }, "Use table")
        : el("span", { className: "muted" }, "follows the table");
      const addr = (attr) => (effRole === "routed" ? cell(attr) : el("td", { className: "muted-cell", title: "Only a Routed port takes an address" }, "—"));
      tbody.append(el("tr", { className: isOwn ? "own" : "" },
        el("td", {}, name), el("td", {}, role), cell("vlan"), cell("description"),
        showAddr ? [addr("ip"), addr("mask")] : [], el("td", {}, useTable)));
    }
    const unknown = Object.keys(row.ports || {}).filter((k) => switchOverrideIface(k, r.interfaces) === null);
    const heads = ["Interface", "Role", "VLAN", "Description", ...(showAddr ? ["IP", "Mask"] : []), "Own settings"];
    wrap.replaceChildren(
      el("p", { className: "muted" },
        "Typing sets a value for this switch only; everything else follows the port table on Build a card. Use table drops this switch's settings for that port."),
      el("p", { className: "sw-ports-legend" },
        el("span", {}, el("span", { className: "swatch inherit" }), "dashed, italic: from the port table"),
        el("span", {}, el("span", { className: "swatch" }), "solid: set for this switch")),
      (r.interfaces || []).length
        ? el("div", { className: "scroll" },
          el("table", { className: "sw-ports-table" },
            el("thead", {}, el("tr", {}, heads.map((h) => el("th", {}, h)))),
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
                const close = wrap.closest("dialog") && wrap.closest("dialog").querySelector(".dialog-actions button");
                if (close) close.focus();
              },
            }, "Remove"))))
        : "",
    );
    watchScrollHints(wrap);
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
    note: "Changes apply as you type. Use table puts a port back on the table.",
    onOpen: (dlg) => {
      dlg.classList.add("dlg-wide");
      if (focus) draw(focus);
    },
  }).then(() => {
    if (currentView !== "switches") return;
    renderSwitches();
    // A fixed check removes the button that opened the dialog: focus goes to this row's Ports button.
    if (focusLost() || !canFocus(document.activeElement)) {
      const tr = [...$("swRows").querySelectorAll("tr[data-row]")].find((t) => t.dataset.row === row.id);
      const pb = tr && tr.querySelector("button.sw-ports");
      if (canFocus(pb)) pb.focus({ preventScroll: true });
    }
  });
}
// --- Clickable checks: a check's location -> the control it is about ---
// where: see generate() plus {kind:"policy"} and {kind:"row",key}. ctx: {view:"build"} or
// {view:"switches", rowId}. Locations are resolved now, so a target that no longer exists
// opens the template instead. Returns the focused element, or null when the view could not change.
function focusFinding(where, ctx) {
  const w = where || {};
  const lower = (s) => String(s).toLowerCase();
  const r = current();
  const row = ctx && ctx.view === "switches" ? (r.switches || []).find((x) => x.id === ctx.rowId) : null;
  const go = (view) => currentView === view || showView(view);
  const swCell = (key) => {
    if (!row || !go("switches")) return null;
    return [...$("swRows").querySelectorAll("input[data-row][data-key]")]
      .find((n) => n.dataset.row === row.id && n.dataset.key === key) || null;
  };
  const buildPort = (name, attr) => {
    const cells = [...$("ports").querySelectorAll("[data-port][data-attr]")].filter((n) => lower(n.dataset.port) === lower(name));
    // An address cell that is not shown (port not Routed) falls back to the port's role.
    return cells.find((n) => n.dataset.attr === attr) || cells.find((n) => n.dataset.attr === "role") || null;
  };
  let target = null,
    pre = null;
  switch (w.kind) {
    case "field":
    case "row":
      target = swCell(w.key);
      if (!target && go("build")) target = $("value_" + w.key);
      break;
    case "port":
      if (row && switchPortCells(r, row).some((c) => lower(c.name) === lower(w.name) && c.attr === w.attr)) {
        // The row sets this value itself: open its Ports dialog on that cell.
        if (!go("switches")) return null;
        openPortsDialog(row, { name: w.name, attr: w.attr });
        const t = document.activeElement;
        if (t && t.closest("dialog") && t.dataset.port) {
          t.scrollIntoView({ block: "center" });
          return flashTarget(t);
        }
        return null; // the dialog is open, but has no such cell (an interface the recipe lacks)
      }
      if (go("build")) target = buildPort(w.name, w.attr);
      break;
    case "ports":
      if (go("build")) target = $("ports").querySelector('select[data-attr="role"]');
      break;
    case "interfaces":
    case "template":
    case "sources":
      if (go("manage")) target = $({ interfaces: "interfaces", template: "template", sources: "mgmtSources" }[w.kind]);
      break;
    case "policy":
      if (go("manage")) {
        $("teamHintsPanel").open = true;
        target = $("teamPoliciesEditor");
      }
      break;
    case "file":
      pre = row ? $("swPreview") : $("preview");
      if (go(row ? "switches" : "build")) target = pre;
      break;
  }
  if (!target || target.closest("[hidden]")) {
    if (!go("manage")) return null;
    target = $("template");
    pre = null;
  }
  // Open the collapsed sections around the target (Management sources, team rules, ...).
  for (let d = target.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center" });
  if (pre && w.line) highlightPreviewLine(pre, w.line);
  return flashTarget(target);
}
// Outlines an element for 1.2 s; a repeated click restarts the outline.
const flashTimers = new WeakMap();
function flashTarget(t) {
  clearTimeout(flashTimers.get(t));
  t.classList.remove("flash");
  void t.offsetWidth; // restart the CSS animation
  t.classList.add("flash");
  flashTimers.set(t, setTimeout(() => t.classList.remove("flash"), 1200));
  return t;
}
// Selects line `line` (1-based) of a preview <pre> and scrolls it to the middle of the box.
function highlightPreviewLine(pre, line) {
  const text = pre.textContent;
  let start = 0;
  for (let i = 1; i < line; i++) {
    const nl = text.indexOf("\n", start);
    if (nl < 0) return false;
    start = nl + 1;
  }
  let end = text.indexOf("\n", start);
  if (end < 0) end = text.length;
  if (end > start && text[end - 1] === "\r") end--;
  const node = pre.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const box = pre.getBoundingClientRect(),
    at = range.getBoundingClientRect();
  pre.scrollTop += at.top - box.top - (pre.clientHeight - at.height) / 2;
  return true;
}
// --- Switches view wiring ---
$("swRows").addEventListener("input", (e) => {
  const t = e.target;
  if (!t.matches("input[data-key]")) return;
  // Addresses and numbers are trimmed while typing, as on Build a card.
  const k = t.dataset.key;
  setSwitchCell(t, cleanInput(t, fieldLabel(k), /(?:^|_)(?:IP|MASK|VLAN|LOOPBACK)$|^GATEWAY$/.test(k)));
});
// Several lines or spreadsheet cells pasted into one cell would join into one value: refused with
// a pointer to Import CSV. Surrounding spaces and line breaks alone are fine (trimmed as before).
$("swRows").addEventListener("paste", (e) => {
  const t = e.target;
  if (!t.matches("input[data-key]") || !e.clipboardData) return;
  const text = e.clipboardData.getData("text/plain").trim();
  if (!/[\r\n\t]/.test(text)) return;
  e.preventDefault();
  message("Not pasted: that text holds several lines or cells, and one cell takes one value. To fill many switches, use Import CSV (a header row, then one row per switch).");
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
// The empty state's own buttons run the toolbar's actions.
$("swEmptyAdd").onclick = () => $("swAdd").click();
$("swEmptyImport").onclick = () => openImportDialog();

// --- Tables that scroll sideways: .more-left / .more-right fade the side that has more ---
function updateScrollHint(box) {
  const max = box.scrollWidth - box.clientWidth;
  box.classList.toggle("more-left", max > 1 && box.scrollLeft > 1);
  box.classList.toggle("more-right", max > 1 && box.scrollLeft < max - 1);
  // The hint sits above the box (in view at the top of a long list) or, elsewhere, under it.
  const hint = [box.previousElementSibling, box.nextElementSibling].find((n) => n && n.classList.contains("scroll-hint"));
  if (hint) hint.hidden = !(max > 1 && box.scrollLeft < max - 1);
}
function watchScrollHints(root) {
  for (const box of (root || document).querySelectorAll(".scroll")) {
    if (box.__hint) continue;
    box.__hint = true;
    box.addEventListener("scroll", () => updateScrollHint(box), { passive: true });
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => updateScrollHint(box));
      ro.observe(box);
      if (box.firstElementChild) ro.observe(box.firstElementChild);
    }
    updateScrollHint(box);
  }
}
watchScrollHints();
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
  // The mode is in the name, so the three kinds of template never overwrite each other.
  const suffix = { description: "-port-descriptions", all: "-all-port-settings", none: "-fields-only" }[$("swTemplateMode").value] || "";
  downloadCsv(t.text, "switchcard-fleet-template-" + csvFileStem(r) + suffix + ".csv");
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
    "Remove all " + n + " switch" + (n === 1 ? "" : "es") + ' of recipe "' + r.name + '"? Device details on Build a card stay as they are.' +
      "\nThis cannot be undone. Save project first to keep a copy.",
    { ok: "Remove all", danger: true }))) return;
  r.switches = [];
  swSelectedId = null;
  touch();
  renderSwitches();
  // Remove all is hidden with the list: focus goes to the empty state's Add switches.
  if ((focusLost() || !canFocus(document.activeElement)) && canFocus($("swEmptyAdd"))) $("swEmptyAdd").focus({ preventScroll: true });
  message("Removed all " + n + " switch" + (n === 1 ? "" : "es") + ".");
};
// The shared recipe picker re-renders the list (its onchange, set earlier, switches the recipe).
$("swRecipe").addEventListener("change", () => {
  if (currentView === "switches") renderSwitches();
});
