// --- Cards view: one line per switch with its export state; single and bulk exports. Rebuilt on
//     every render (showView, and updateRail while the view is open), so it follows the recipe,
//     its switches, its template, the baseline and the team policies without a reload. ---

// "YYYY-MM-DD HH:MM" in local time, for the Last export column.
function formatExportAt(iso) {
  const d = new Date(iso);
  if (typeof iso !== "string" || isNaN(d)) return "unknown time";
  const p = (v) => String(v).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
// Team-policy hits block export, so a row with them counts as a row with errors (fail closed).
function cardRowBad(x) {
  return x.errors.length > 0 || x.policy.length > 0;
}
// The checked rows plus their export states, for the current recipe.
function cardRows(r) {
  const rows = r.switches || [];
  const res = rows.length ? checkSwitchRows(r, rows) : { rows: [] };
  return res.rows.map((x) => ({ x, st: exportState(r, x.host, x.sha256) }));
}
function renderCards() {
  let r;
  try {
    r = current();
  } catch (e) {
    return;
  }
  const items = cardRows(r);
  const gates = blockers(r);
  const blocked = gates.length > 0 || busy;
  const body = items.map(({ x, st }) => {
    const status = switchStatus(x);
    let last;
    if (st.state === "current") last = el("td", { className: "cd-last cd-current" }, "up to date · " + formatExportAt(st.at));
    else if (st.state === "changed")
      last = el("td", { className: "cd-last" },
        el("button", { type: "button", className: "cd-diff", title: "Show the changes since the last export" }, "changed since " + formatExportAt(st.at)));
    else if (st.state === "new") last = el("td", { className: "cd-last" }, "not exported");
    else last = el("td", { className: "cd-last muted", title: "The recipe does not use HOSTNAME, so exports are not remembered." }, "not tracked");
    return el("tr", { dataRow: x.row.id },
      el("td", { className: "num" }, String(x.n)),
      el("td", {}, x.host || "(no hostname)"),
      el("td", {}, x.ip),
      el("td", {},
        el("button", { type: "button", className: "cd-status " + (status.bad ? "cd-bad" : "cd-ok"), title: status.title || "Open this switch in Switches" }, status.text)),
      last,
      el("td", {},
        el("button", {
          type: "button", className: "cd-card", disabled: blocked || cardRowBad(x),
          title: cardRowBad(x) ? "Fix this switch's errors first." : gates[0] || "Download the SD-card ZIP of this switch",
        }, "Card ZIP")));
  });
  $("cdRows").replaceChildren(...body);
  $("cdTable").hidden = !items.length;
  $("cdEmpty").hidden = items.length > 0;
  const badRows = items.filter(({ x }) => cardRowBad(x)).map(({ x }) => x.n);
  const policyRows = items.filter(({ x }) => x.policy.length).map(({ x }) => x.n);
  const reasons = [...gates];
  if (badRows.length)
    reasons.push("Rows with errors: " + badRows.join(", ") + (policyRows.length ? " (team policy: " + policyRows.join(", ") + ")" : "") + ".");
  const gl = $("cdGates");
  if (!items.length) gl.textContent = "";
  else if (reasons.length) gl.textContent = "Export blocked: " + reasons.join(" · ");
  else gl.textContent = "Ready to export " + items.length + " card" + (items.length === 1 ? "" : "s") + ".";
  gl.className = "cd-gates " + (reasons.length ? "cd-bad" : "cd-ok");
  const changed = items.filter(({ st }) => st.state === "new" || st.state === "changed").length;
  $("cdChanged").textContent = "Changed and new only (" + changed + ")";
  $("cdAll").disabled = blocked || !items.length;
  $("cdText").disabled = blocked || !items.length;
  $("cdChanged").disabled = blocked || changed === 0;
}
// One switch's SD-card ZIP, with the same write dialog as Build's Export SD-card ZIP. Runs inside run().
async function exportOneCard(r, result) {
  if (editorPending) throw Error("Apply recipe changes or Discard unapplied draft first.");
  const gates = blockers(r);
  if (gates.length) throw Error(gates[0]);
  if (cardRowBad(result)) throw Error("Switch " + result.n + " has errors; nothing was exported.");
  const g = { text: result.text };
  if (!(await writeDialog({ title: "Export SD-card ZIP?", summary: exportConfirmSummary(result.recipe, g), primary: "Download ZIP" }))) {
    message("SD-card ZIP export cancelled.");
    return false;
  }
  const name = (deviceKeys(r).includes("HOSTNAME") ? exportHostnameForFile(result.recipe) : "switch-" + result.n) +
    "-switchcard-" + RELEASE + "-sdcard.zip";
  download(await zip(buildCardFiles(g), new Date()), name);
  recordExport(r, result.host, result.text);
  touch();
  message("SD-card ZIP exported for switch " + result.n + " (" + previewSizeLabel(result.text) + ", editcontent.txt SHA-256 " +
    result.sha256.slice(0, 16) + "…). Extract ZIP contents to the card ROOT.");
  return true;
}
// Bulk: which = "all" | "changed" | "text". Rows are re-checked at click time; an included row with
// errors stops the export before any dialog and is named in the status line.
function exportCardsBulk(which) {
  return run(async () => {
    const r = current();
    const items = cardRows(r).filter(({ st }) => which !== "changed" || st.state === "new" || st.state === "changed");
    if (!items.length) {
      message(which === "changed" ? "Every card is up to date." : "No switches to export yet.");
      return;
    }
    const bad = items.filter(({ x }) => cardRowBad(x)).map(({ x }) => x.n);
    if (bad.length) {
      message("Rows with errors: " + bad.join(", ") + ". Fix them in Switches; nothing was exported.");
      return;
    }
    await exportSwitchCards(r, items.map(({ x }) => x), { textOnly: which === "text" });
  });
}
// "Changed since" dialog: the diff of the remembered text against the current one.
function showCardDiff(r, x) {
  const st = exportState(r, x.host, x.sha256);
  if (!st.entry) return;
  const summary = el("p", {});
  const out = el("pre", { className: "diff" });
  fillDiff(summary, out, st.entry, x.text);
  infoDialog("Changes since the last export · switch " + x.n, el("div", {}, summary, out));
}

// --- Cards view wiring ---
$("cdRows").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-row]");
  if (!tr) return;
  const r = current();
  const x = checkSwitchRows(r, r.switches || []).rows.find((y) => y.row.id === tr.dataset.row);
  if (!x) return;
  if (e.target.closest("button.cd-status")) {
    if (showView("switches")) selectSwitch(x.row.id);
  } else if (e.target.closest("button.cd-diff")) showCardDiff(r, x);
  else if (e.target.closest("button.cd-card")) run(() => exportOneCard(r, x));
});
$("cdAll").onclick = () => exportCardsBulk("all");
$("cdChanged").onclick = () => exportCardsBulk("changed");
$("cdText").onclick = () => exportCardsBulk("text");
// The shared recipe picker re-renders the list (its onchange, set earlier, switches the recipe).
$("cdRecipe").addEventListener("change", () => {
  if (currentView === "cards") renderCards();
});
