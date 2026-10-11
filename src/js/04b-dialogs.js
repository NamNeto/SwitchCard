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
function showDialog({ title, body, actions, onOpen }) {
  return new Promise((resolve) => {
    const dlg = el("dialog", { className: "dlg" });
    const opener = document.activeElement;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      // Back to the opener when it can take focus now; inside run() (opener disabled) run()
      // puts it back once the work is done.
      restoreFocus(opener, false);
      resolve(value);
    };
    const bar = el("div", { className: "dialog-actions" });
    for (const a of actions) {
      // a.kbd ("Esc"): the key that also takes this choice, drawn after the label by CSS (the
      // button's text stays the label alone).
      bar.appendChild(el("button", {
        type: "button",
        className: (a.primary ? "primary " : "") + (a.danger ? "danger" : ""),
        disabled: !!a.disabled,
        textContent: a.label,
        dataKbd: a.kbd || null,
        ariaKeyshortcuts: a.kbd === "Esc" ? "Escape" : a.kbd || null,
        onclick: () => finish(a.value),
      }));
    }
    dlg.append(el("h2", {}, title), el("div", { className: "dialog-body" }, body), bar);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(null); });
    // Tab wraps inside the dialog: from the last control to the first and back, never via <body>.
    dlg.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
      const list = [...dlg.querySelectorAll("button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex='-1'])")]
        .filter((n) => canFocus(n) && n.tabIndex >= 0);
      if (!list.length) return;
      const first = list[0],
        last = list[list.length - 1],
        a = document.activeElement;
      if (e.shiftKey ? a === first || !dlg.contains(a) : a === last || !dlg.contains(a)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    if (onOpen) onOpen(dlg);
    // Focus stays inside the open dialog. The browser may first focus the scrolling body, which
    // stops being focusable once a wide layout no longer overflows; focus then falls to <body>.
    const keepInside = () => {
      if (!dlg.open || (!focusLost() && dlg.contains(document.activeElement))) return;
      const first = [...dlg.querySelectorAll("button, input, select, textarea")].find(canFocus);
      if (first) first.focus({ preventScroll: true });
    };
    keepInside();
    requestAnimationFrame(() => setTimeout(keepInside, 0));
  });
}

function confirmDialog(title, textOrNode, opts) {
  const o = Object.assign({ ok: "OK", cancel: "Cancel", danger: false }, opts || {});
  const body = typeof textOrNode === "string" ? el("p", {}, textOrNode) : textOrNode;
  return showDialog({
    title, body,
    // opts.cancelKbd: show that Esc takes the cancel choice (where the cancel label is not "Cancel").
    actions: [{ label: o.cancel, value: false, kbd: o.cancelKbd }, { label: o.ok, value: true, primary: true, danger: o.danger }],
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
function summaryRowsTable(rows) {
  return el("table", { className: "dlg-rows" },
    el("thead", {}, el("tr", {}, ["#", "Hostname", "Mgmt IP", "State", "SHA-256", "Lines"].map((h) => el("th", {}, h)))),
    el("tbody", {}, rows.map((x) => {
      const [cls, label] = EXPORT_STATE_PILL[x.state] || EXPORT_STATE_PILL.nohost;
      return el("tr", {},
        el("td", { className: "num" }, String(x.n)),
        el("td", {}, x.host || "(no hostname)"),
        el("td", { className: "mono" }, x.ip || ""),
        el("td", {}, el("span", { className: "pill " + cls }, label)),
        el("td", { className: "mono", title: x.sha256 }, x.sha256.slice(0, 16) + "…",
          el("button", {
            type: "button", className: "dlg-copy-sha", title: "Copy the full SHA-256 of this card's editcontent.txt",
            onclick: async (e) => { e.target.textContent = (await copyText(x.sha256)) ? "Copied" : "Copy failed"; },
          }, "Copy")),
        el("td", { className: "num" }, String(x.lines)));
    })));
}
function summaryView(text, rows) {
  const box = el("div", { className: "dlg-summary" });
  let kv = null,
    listDone = false;
  for (const line of String(text).split("\n")) {
    if (!line.trim()) {
      kv = null;
      continue;
    }
    if (rows && /^\s*\d+\. /.test(line)) {
      if (!listDone) box.append(summaryRowsTable(rows));
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
    kv.append(el("tr", { className: /^(Hostname|MGMT_IP)$/.test(m[1]) ? "dlg-key" : "" }, el("th", { scope: "row" }, summaryKeyLabel(m[1])),
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
function writeDialog({ title, summary, primary, rows }) {
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
  // The tick is a boxed safety step of its own, and gets the first focus.
  const body = el("div", {},
    summaryView(text, rows),
    el("div", { className: "dlg-copy" }, copy),
    el("label", { className: "review-tick" }, check,
      el("span", {}, "I reviewed this configuration and the baseline selection.",
        el("small", {}, primary + " stays off until this box is ticked."))));
  return showDialog({
    title, body,
    actions: [{ label: "Cancel", value: false }, { label: primary, value: true, primary: true, disabled: true }],
    onOpen: (dlg) => {
      dlg.classList.add("dlg-write");
      const btn = dlg.querySelector(".dialog-actions button.primary");
      btn.title = "Tick the review box first";
      check.addEventListener("change", () => {
        btn.disabled = !check.checked;
        btn.title = check.checked ? "" : "Tick the review box first";
      });
      check.focus();
    },
  }).then((v) => v === true);
}
