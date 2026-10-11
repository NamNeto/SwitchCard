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
// What is wrong with a row, in a few words, for the gate and bulk status lines: the first error
// (duplicates name the shared value), else the first team-policy hit.
function rowProblem(x) {
  const e = x.errors[0];
  if (!e) return x.policy.length ? "team policy: " + String(x.policy[0]).replace(/\.$/, "") : "";
  // A row that repeats both the hostname and the address of another says both at once.
  if (/^duplicate HOSTNAME/.test(e) && x.errors.some((y) => /^duplicate MGMT_IP/.test(y)))
    return "duplicate HOSTNAME " + x.host + " and MGMT_IP " + x.ip;
  if (/^duplicate HOSTNAME/.test(e)) return "duplicate HOSTNAME " + x.host;
  if (/^duplicate MGMT_IP/.test(e)) return "duplicate MGMT_IP " + x.ip;
  if (/^The template still contains the example header line/.test(e)) return "template still contains the example header";
  const t = String(e).replace(/\.$/, "");
  // An address check names the value it refused, so the bad cell is found without a hunt.
  const bad = /^(MGMT_IP|GATEWAY|MGMT_MASK) must be a valid IPv4 address/.exec(e);
  const got = bad && x.values && x.values[bad[1]] ? ' (got "' + x.values[bad[1]] + '")' : "";
  return (t.length > 70 ? clauseCut(t, 67) + "…" : t) + got;
}
// A message cut for a short line ends at a clause boundary (", " / "; " / " — " / " (") when one
// sits past the first third, so the cut never lands in the middle of the part that matters.
function clauseCut(t, max) {
  const head = t.slice(0, max);
  let at = -1;
  for (const sep of [" — ", "; ", ", ", " ("]) at = Math.max(at, head.lastIndexOf(sep));
  return at > max / 3 ? head.slice(0, at) : head;
}
// "2, 3 (duplicate MGMT_IP 10.20.30.13) · 5 (template still contains the example header)": rows
// grouped by problem, the first three problems, then "and N more rows".
function badRowsSummary(xs) {
  const groups = new Map();
  for (const x of xs) {
    const why = rowProblem(x);
    if (groups.has(why)) groups.get(why).push(x.n);
    else groups.set(why, [x.n]);
  }
  const list = (ns) => (ns.length > 6 ? ns.slice(0, 5).join(", ") + " +" + (ns.length - 5) + " more" : ns.join(", "));
  const all = [...groups];
  const shown = all.slice(0, 3).map(([why, ns]) => list(ns) + (why ? " (" + why + ")" : ""));
  const rest = all.slice(3).reduce((sum, [, ns]) => sum + ns.length, 0);
  return shown.join(" · ") + (rest ? " · and " + rest + " more row" + (rest === 1 ? "" : "s") : "");
}
// Where the fix is: a row's own values (and a team-policy hit on its text, which the side panel
// names) are fixed in Switches; the example header still in the template is fixed in Manage.
function badRowsFixHint(xs) {
  const recipeLevel = (x) =>
    x.errors.length > 0 && x.errors.every((e) => /^The template still contains the example header line/.test(e));
  const all = xs.every(recipeLevel), none = !xs.some(recipeLevel);
  if (all) return "Fix the recipe in Manage recipes & baseline";
  if (none) return "Fix them in Switches";
  return "Fix them in Switches and the recipe in Manage recipes & baseline";
}
// The checked rows plus their export states, for the current recipe.
function cardRows(r) {
  const rows = r.switches || [];
  const res = rows.length ? checkSwitchRows(r, rows) : { rows: [] };
  return res.rows.map((x) => ({ x, st: exportState(r, x.host, x.sha256) }));
}
// The row button that last had focus ({ row, kind }), so a rebuild can put focus back. Kept while
// focus sits on <body> (a closed dialog, or a button run() disabled), cleared when focus moves
// elsewhere on the page.
let cdFocus = null;
const CD_BUTTONS = ["cd-status", "cd-diff", "cd-card"];
function cardFocusOf(node) {
  const tr = node && node.closest ? node.closest("#cdRows tr[data-row]") : null;
  const kind = tr && node.matches("button") ? CD_BUTTONS.find((k) => node.classList.contains(k)) : null;
  return kind ? { row: tr.dataset.row, kind } : null;
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
    // One pill grammar for the export state: green up to date, amber changed (opens the diff),
    // blue not exported, grey not tracked.
    if (st.state === "current")
      last = el("td", { className: "cd-last cd-current" },
        el("span", { className: "pill pill-ok" }, "up to date"), el("span", { className: "cd-when" }, " · " + formatExportAt(st.at)));
    // "changed" is the pill (it opens the diff); the date sits beside it in the same muted text
    // as an up-to-date row's.
    else if (st.state === "changed")
      last = el("td", { className: "cd-last" },
        el("button", { type: "button", className: "cd-diff", title: "Show the changes since the last export on " + formatExportAt(st.at) }, "changed"),
        el("span", { className: "cd-when" }, " since " + formatExportAt(st.at)));
    else if (st.state === "new") last = el("td", { className: "cd-last" }, el("span", { className: "pill pill-new" }, "not exported"));
    else
      last = el("td", { className: "cd-last", title: "The recipe does not use HOSTNAME, so exports are not remembered." },
        el("span", { className: "pill pill-muted" }, "not tracked"));
    return el("tr", { dataRow: x.row.id },
      el("td", { className: "num" }, String(x.n)),
      el("td", {}, x.host || "(no hostname)"),
      el("td", {}, x.ip),
      el("td", {},
        el("button", { type: "button", className: "cd-status " + (status.bad ? "cd-bad" : "cd-ok"),
          title: (status.title ? status.title + "\n" : "") + "Open this switch in Switches" }, status.text)),
      last,
      el("td", {},
        el("button", {
          type: "button", className: "cd-card", disabled: blocked || cardRowBad(x),
          title: cardRowBad(x) ? "Fix this switch's errors first." : gates[0] || "Download the SD-card ZIP of this switch",
        }, "Card ZIP")));
  });
  const a = document.activeElement;
  const want = cardFocusOf(a) || (!a || a === document.body ? cdFocus : null);
  $("cdRows").replaceChildren(...body);
  if (want) {
    const tr = [...$("cdRows").querySelectorAll("tr[data-row]")].find((t) => t.dataset.row === want.row);
    const b = tr && tr.querySelector("button." + want.kind);
    if (b && !b.disabled) b.focus();
  }
  $("cdTable").hidden = !items.length;
  $("cdTable").classList.toggle("is-blocked", blocked);
  $("cdEmpty").hidden = items.length > 0;
  const badRows = items.filter(({ x }) => cardRowBad(x)).map(({ x }) => x.n);
  const reasons = [...gates];
  if (badRows.length)
    reasons.push("Rows with errors: " + badRowsSummary(items.filter(({ x }) => cardRowBad(x)).map(({ x }) => x)) + ".");
  renderGate($("cdGates"), reasons, items.length ? "Ready to export " + items.length + " card" + (items.length === 1 ? "" : "s") + "." : "", "cdFixGate",
    null, items.length ? [baselineDiffersWarning()].filter(Boolean) : []);
  const changed = items.filter(({ st }) => st.state === "new" || st.state === "changed").length;
  // Counts at a glance: "12 switches · 6 up to date · 3 changed · 3 not exported · 1 with errors".
  const count = (state) => items.filter(({ st }) => st.state === state).length;
  const sum = [["sum-total", items.length + (items.length === 1 ? " switch" : " switches")]];
  if (count("current")) sum.push(["sum-ok", count("current") + " up to date"]);
  if (count("changed")) sum.push(["sum-warn", count("changed") + " changed"]);
  if (count("new")) sum.push(["sum-new", count("new") + " not exported"]);
  if (count("nohost")) sum.push(["sum-muted", count("nohost") + " not tracked"]);
  if (badRows.length) sum.push(["sum-bad", badRows.length + " with errors"]);
  $("cdSummary").replaceChildren(...(items.length ? sum.map(([c, t]) =>
    el("span", { className: c }, t)) : []));
  $("cdChanged").textContent = "Changed and not exported (" + changed + ")";
  $("cdAll").disabled = blocked || !items.length;
  $("cdText").disabled = blocked || !items.length;
  $("cdChanged").disabled = blocked || changed === 0;
  // While a gate blocks, the title of each disabled button names the gate (text-only included);
  // otherwise each title says what it exports.
  const why = gates.length ? "Export blocked: " + gates.map(gateLabel).join(" · ") : busy ? "An export is running." : "";
  $("cdAll").title = why || (items.length ? "One SD-card ZIP per switch, plus a manifest" : "No switches to export yet");
  $("cdText").title = why || (items.length ? "One ZIP holding every editcontent.txt (no baseline files)" : "No switches to export yet");
  $("cdChanged").title = why || (changed ? "Only the switches never exported or changed since their last export" : "Nothing is changed or unexported since the last export");
}
// One switch's SD-card ZIP, with the same write dialog as Build's Export SD-card ZIP. Runs inside run().
async function exportOneCard(r, result) {
  if (editorPending) throw Error("Apply recipe changes or Discard unapplied draft first.");
  const gates = blockers(r);
  if (gates.length) throw Error(gates[0]);
  if (cardRowBad(result)) throw Error("Switch " + result.n + " has errors; nothing was exported.");
  const g = { text: result.text };
  if (!(await writeDialog({ title: "Export SD-card ZIP?", summary: exportConfirmSummary(result.recipe, g), primary: "Download ZIP",
    warning: baselineDiffersWarning() }))) {
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
    const bad = items.filter(({ x }) => cardRowBad(x)).map(({ x }) => x);
    if (bad.length) {
      message("Rows with errors: " + badRowsSummary(bad) + ". " + badRowsFixHint(bad) + "; nothing was exported.");
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
    if (showView("switches")) {
      selectSwitch(x.row.id);
      focusSwitchRow(x.row.id);
    }
  } else if (e.target.closest("button.cd-diff")) showCardDiff(r, x);
  else if (e.target.closest("button.cd-card")) run(() => exportOneCard(r, x));
});
document.addEventListener("focusin", (e) => {
  if (e.target.closest && e.target.closest("dialog")) return;
  cdFocus = cardFocusOf(e.target);
});
$("cdAll").onclick = () => exportCardsBulk("all");
$("cdChanged").onclick = () => exportCardsBulk("changed");
$("cdText").onclick = () => exportCardsBulk("text");
// The shared recipe picker re-renders the list (its onchange, set earlier, switches the recipe).
$("cdRecipe").addEventListener("change", () => {
  if (currentView === "cards") renderCards();
});
