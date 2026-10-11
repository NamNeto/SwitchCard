/* ============================================================
   In-page dialogs (replace confirm/alert): native <dialog>, promise-based
   ============================================================ */

// Tiny DOM builder: attrs are properties; on* listeners; data* -> dataset; aria* -> attributes.
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k.startsWith("data") && k.length > 4) node.dataset[k[4].toLowerCase() + k.slice(5)] = v;
    else if (k.startsWith("aria") && k.length > 4) node.setAttribute("aria-" + k.slice(4).toLowerCase(), v);
    else node[k] = v;
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// Focus that would otherwise fall to <body> after an action goes back to the control that started
// it. A control that was rebuilt is found again by id; one that is now disabled or hidden hands
// focus to the nearest enabled control in its group. Nothing moves while something else has focus.
function canFocus(n) {
  return !!(n && n.isConnected && !n.disabled && !n.closest("[hidden]") && n.getClientRects().length);
}
function focusLost() {
  const a = document.activeElement;
  return !a || a === document.body || a === document.documentElement;
}
function restoreFocus(opener, nearest) {
  if (!opener || opener === document.body || !focusLost()) return;
  let t = canFocus(opener) ? opener : opener.id ? document.getElementById(opener.id) : null;
  if (!canFocus(t) && nearest !== false) {
    const box = opener.isConnected ? opener.closest(".actions, .sw-toolbar, .card, section") : null;
    t = box ? [...box.querySelectorAll("button, input, select, textarea")].find(canFocus) : null;
  }
  if (canFocus(t)) t.focus({ preventScroll: true });
}

// Resolves with the clicked action's value, or null on Esc. Resolved by our own handlers,
// not the native close event (automated browsers can defer that indefinitely).
// note: a short sentence at the left of the action bar (what the buttons do or do not save).
//
// The dialog is a <dialog> shown with show(), not showModal(): a modal makes the whole document
// inert, which restyles every element on open and again on close (with 200 switches, 2000 grid
// cells: 20-30 ms each way, the larger part of opening the Ports dialog). Modality is provided
// here instead: a veil over the page takes the clicks, Tab and Shift+Tab wrap inside the dialog
// from anywhere, Esc cancels, focus that lands outside is brought back, and aria-modal says so
// to assistive technology. The dialog keeps its open attribute (dialog[open]).
const openDialogs = [];
let dialogSeq = 0;
// While any dialog is open the page behind it is hidden from assistive technology (aria-hidden on
// everything but the veils and the dialogs), and a click or an activation key (Enter, Space)
// whose target is outside the topmost dialog is swallowed in the capture phase: a screen reader
// or voice control cannot activate a background control, and neither can a synthetic click.
function setPageHidden(hidden) {
  for (const n of document.body.children) {
    if (n.matches("dialog, .dlg-veil")) continue;
    if (hidden) n.setAttribute("aria-hidden", "true");
    else n.removeAttribute("aria-hidden");
  }
}
function topDialog() {
  return openDialogs[openDialogs.length - 1] || null;
}
function outsideTopDialog(target) {
  const top = topDialog();
  return !!top && !(target instanceof Node && top.contains(target));
}
document.addEventListener("click", (e) => {
  if (outsideTopDialog(e.target)) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && outsideTopDialog(e.target)) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
function showDialog({ title, body, actions, onOpen, note }) {
  return new Promise((resolve) => {
    const titleId = "dlgTitle" + ++dialogSeq;
    const dlg = el("dialog", { className: "dlg", ariaModal: "true", ariaLabelledby: titleId });
    const veil = el("div", { className: "dlg-veil" });
    const opener = document.activeElement;
    let done = false;
    let lastInside = null; // the control that last had focus inside: where focus comes back to
    const controls = () => [...dlg.querySelectorAll("button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex='-1'])")]
      .filter((n) => canFocus(n) && n.tabIndex >= 0);
    const topmost = () => openDialogs[openDialogs.length - 1] === dlg;
    const onKey = (e) => {
      if (!dlg.open || !topmost()) return;
      // A key that ends an IME composition is not a command (Esc cancels the composition only).
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
        return;
      }
      // Tab wraps inside the dialog: from the last control to the first and back, never via <body>.
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
      const list = controls();
      if (!list.length) return;
      const first = list[0],
        last = list[list.length - 1],
        a = document.activeElement;
      if (e.shiftKey ? a === first || !dlg.contains(a) : a === last || !dlg.contains(a)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    // Focus that lands behind the veil (a click on it, a script) comes back to the dialog; focus
    // inside is remembered, so it comes back to the same control, not to the first one.
    const onFocus = (e) => {
      if (!dlg.open || !topmost()) return;
      // Only a control counts (the browser may first focus the scrolling body, see keepInside).
      if (dlg.contains(e.target)) {
        if (e.target.matches("button, input, select, textarea, a[href], summary, [tabindex]")) lastInside = e.target;
      } else keepInside();
    };
    const finish = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus, true);
      const at = openDialogs.indexOf(dlg);
      if (at >= 0) openDialogs.splice(at, 1);
      if (!openDialogs.length) setPageHidden(false);
      if (dlg.open) dlg.close();
      dlg.remove();
      veil.remove();
      // Back to the opener when it can take focus now; inside run() (opener disabled) run()
      // puts it back once the work is done.
      restoreFocus(opener, false);
      resolve(value);
    };
    const bar = el("div", { className: "dialog-actions" });
    if (note) bar.appendChild(el("span", { className: "dialog-note" }, note));
    for (const a of actions) {
      bar.appendChild(el("button", {
        type: "button",
        // aside: a destructive secondary action set apart at the left end of the bar.
        className: (a.primary ? "primary " : "") + (a.danger ? "danger " : "") + (a.aside ? "aside" : ""),
        disabled: !!a.disabled,
        textContent: a.label,
        onclick: () => finish(a.value),
      }));
    }
    dlg.append(el("h2", { id: titleId }, title), el("div", { className: "dialog-body" }, body), bar);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(null); });
    // A click on the veil is not a dismissal (Esc and Cancel are): focus just comes back.
    veil.addEventListener("mousedown", (e) => { e.preventDefault(); keepInside(); });
    // Focus stays inside the open (topmost) dialog: back to the control that last had it, else
    // the first one. The browser may first focus the scrolling body, which stops being focusable
    // once a wide layout no longer overflows; focus then falls to <body>.
    const keepInside = () => {
      if (!dlg.open || !topmost() || (!focusLost() && dlg.contains(document.activeElement))) return;
      const t = canFocus(lastInside) && dlg.contains(lastInside) ? lastInside
        : [...dlg.querySelectorAll("button, input, select, textarea")].find(canFocus);
      if (t) t.focus({ preventScroll: true });
    };
    document.body.append(veil, dlg);
    if (!openDialogs.length) setPageHidden(true);
    openDialogs.push(dlg);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus, true);
    dlg.show();
    if (onOpen) onOpen(dlg);
    keepInside();
    requestAnimationFrame(() => setTimeout(keepInside, 0));
  });
}

function confirmDialog(title, textOrNode, opts) {
  const o = Object.assign({ ok: "OK", cancel: "Cancel", danger: false }, opts || {});
  const body = typeof textOrNode === "string" ? el("p", {}, textOrNode) : textOrNode;
  return showDialog({
    title, body, note: o.note,
    actions: [{ label: o.cancel, value: false }, { label: o.ok, value: true, primary: true, danger: o.danger }],
    // opts.focusOk: start on the OK button instead of Cancel (only where OK is the safe choice).
    onOpen: o.focusOk ? (dlg) => dlg.querySelector(".dialog-actions button.primary").focus() : undefined,
  }).then((v) => v === true);
}

function infoDialog(title, textOrNode) {
  const body = typeof textOrNode === "string" ? el("p", {}, textOrNode) : textOrNode;
  return showDialog({ title, body, actions: [{ label: "Close", value: true, primary: true }] }).then(() => undefined);
}

// The summary laid out for reading: "Key: value" lines become a key/value table (hostname and
// management IP highlighted, as the values that put a switch on the wrong address), the numbered
// switch list of a bulk export becomes a table with each card's export state, and every other
// line stays a sentence. Copy summary still copies the plain text.
const EXPORT_STATE_PILL = {
  current: ["pill-ok", "up to date"], changed: ["pill-warn", "changed"], new: ["pill-new", "new"], nohost: ["pill-muted", "not tracked"],
};
// A long list (200 switches) is built in chunks: the rows that fit the scrolling box come with
// the dialog, the rest follow after its first paint, so opening stays quick.
const DLG_ROWS_FIRST = 40, DLG_ROWS_CHUNK = 80;
// onDone is called once every row is in the table (the table is aria-busy until then).
function summaryRowsTable(rows, onDone) {
  const tbody = el("tbody");
  let table = null;
  const fill = (from, to) => {
    for (const x of rows.slice(from, to)) {
      const [cls, label] = EXPORT_STATE_PILL[x.state] || EXPORT_STATE_PILL.nohost;
      tbody.append(el("tr", {},
        el("td", { className: "num" }, String(x.n)),
        el("td", {}, x.host || "(no hostname)"),
        el("td", { className: "mono" }, x.ip || ""),
        el("td", {}, el("span", { className: "pill " + cls }, label)),
        el("td", { className: "num" }, String(x.lines)),
        // The first 24 hex characters in mono; the whole hash is the cell's title and what Copy copies.
        el("td", { className: "mono dlg-sha", title: x.sha256 }, x.sha256.slice(0, 24) + "…"),
        el("td", { className: "dlg-sha-copy" }, el("button", {
          type: "button", className: "dlg-copy-sha", title: "Copy the full SHA-256 of this card's editcontent.txt",
          onclick: async (e) => { e.target.textContent = (await copyText(x.sha256)) ? "Copied" : "Copy failed"; },
        }, "Copy"))));
    }
    if (to < rows.length) setTimeout(() => fill(to, to + DLG_ROWS_CHUNK), 0);
    else {
      if (table) table.removeAttribute("aria-busy");
      if (onDone) onDone();
    }
  };
  table = el("table", { className: "dlg-rows", ariaBusy: rows.length > DLG_ROWS_FIRST ? "true" : null },
    el("thead", {}, el("tr", {}, ["#", "Hostname", "Mgmt IP", "State", "Lines", "SHA-256", ""].map((h) => el("th", {}, h)))),
    tbody);
  fill(0, DLG_ROWS_FIRST);
  return table;
}
function summaryView(text, rows, onRowsDone) {
  const box = el("div", { className: "dlg-summary" });
  let kv = null,
    listDone = false;
  for (const line of String(text).split("\n")) {
    if (!line.trim()) {
      kv = null;
      continue;
    }
    if (rows && /^\s*\d+\. /.test(line)) {
      if (!listDone) box.append(summaryRowsTable(rows, onRowsDone));
      listDone = true;
      continue;
    }
    if (rows && /^… and \d+ more/.test(line)) continue; // the table lists every row
    const m = /^([A-Za-z][\w .\-/]{0,40}): (.*)$/.exec(line);
    if (!m) {
      box.append(el("p", {}, line));
      continue;
    }
    if (!kv) box.append((kv = el("table", { className: "dlg-kv" })));
    // A hash never breaks inside (it is compared with a manifest by eye): one line that scrolls.
    kv.append(el("tr", { className: /^(Hostname|MGMT_IP)$/.test(m[1]) ? "dlg-key" : /DIFFERS/.test(m[2]) ? "dlg-differs" : "" }, el("th", { scope: "row" }, summaryKeyLabel(m[1])),
      el("td", { className: /^[0-9a-f]{64}$/i.test(m[2]) ? "dlg-hash" : "" }, m[2])));
  }
  return box;
}
// One label style on every row: the plain-language name, with the template placeholder in mono
// beside it ("Default gateway GATEWAY"). The plain-text summary (Copy summary) keeps the keys.
function summaryKeyLabel(key) {
  const code = (k) => el("code", { className: "dlg-ph" }, k);
  if (key === "Hostname") return ["Hostname ", code("HOSTNAME")];
  if (key === "Management interface") return ["Management interface ", code("MGMT_INTERFACE")];
  if (/^[A-Z][A-Z0-9_]*$/.test(key) && typeof fieldLabel === "function") {
    const label = fieldLabel(key);
    return label === key.replaceAll("_", " ") ? [code(key)] : [label + " ", code(key)];
  }
  return [key];
}
// Review-before-download gate: the primary action stays disabled until the box is ticked.
// rows (bulk exports): [{ n, host, ip, sha256, lines, state }] for the switch table.
// warning: a review note shown above the summary (the baseline fingerprint differs from the
// project's record); it does not block, the tick still decides.
function writeDialog({ title, summary, primary, rows, warning }) {
  const text = String(summary).replace(/\s*Cancel = no download\.\s*$/, "");
  const check = el("input", { type: "checkbox" });
  const copy = el("button", {
    type: "button",
    textContent: "Copy summary",
    onclick: async () => {
      const ok = await copyText(text);
      copy.textContent = ok ? "Copied" : "Copy failed";
    },
  });
  // A long switch table is still filling in after the first paint: the primary waits for the
  // last chunk, so what is downloaded is never more than what the table showed.
  let filling = !!(rows && rows.length > DLG_ROWS_FIRST);
  let btn = null;
  const sync = () => {
    if (!btn) return;
    btn.disabled = !check.checked || filling;
    btn.title = check.checked ? (filling ? "The switch list is still loading" : "") : "Tick the review box first";
  };
  // The tick is a boxed safety step of its own, and gets the first focus.
  const body = el("div", {},
    warning ? el("p", { className: "dlg-warning", role: "note" }, el("strong", {}, "Review: "), warning) : null,
    summaryView(text, rows, () => { filling = false; sync(); }),
    el("div", { className: "dlg-copy" }, copy),
    el("label", { className: "review-tick" }, check,
      el("span", {}, "I reviewed this configuration and the baseline selection.",
        el("small", {}, primary + " stays off until this box is ticked."))));
  return showDialog({
    title, body,
    actions: [{ label: "Cancel", value: false }, { label: primary, value: true, primary: true, disabled: true }],
    onOpen: (dlg) => {
      dlg.classList.add("dlg-write");
      btn = dlg.querySelector(".dialog-actions button.primary");
      check.addEventListener("change", sync);
      sync();
      check.focus();
    },
  }).then((v) => v === true);
}
