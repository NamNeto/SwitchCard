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
      bar.appendChild(el("button", {
        type: "button",
        className: (a.primary ? "primary " : "") + (a.danger ? "danger" : ""),
        disabled: !!a.disabled,
        textContent: a.label,
        onclick: () => finish(a.value),
      }));
    }
    dlg.append(el("h2", {}, title), el("div", { className: "dialog-body" }, body), bar);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(null); });
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
    actions: [{ label: o.cancel, value: false }, { label: o.ok, value: true, primary: true, danger: o.danger }],
    // opts.focusOk: start on the OK button instead of Cancel (only where OK is the safe choice).
    onOpen: o.focusOk ? (dlg) => dlg.querySelector(".dialog-actions button.primary").focus() : undefined,
  }).then((v) => v === true);
}

function infoDialog(title, textOrNode) {
  const body = typeof textOrNode === "string" ? el("p", {}, textOrNode) : textOrNode;
  return showDialog({ title, body, actions: [{ label: "Close", value: true, primary: true }] }).then(() => undefined);
}

// The summary as monospace text; the identity lines (hostname, management IP) stand out.
// textContent stays exactly the summary text.
function summaryPre(text) {
  const pre = el("pre", { className: "dlg-summary" });
  String(text).split("\n").forEach((line, i) => {
    if (i) pre.append("\n");
    pre.append(/^(Hostname|MGMT_IP): /.test(line) ? el("strong", { className: "dlg-key" }, line) : line);
  });
  return pre;
}
// Review-before-download gate: the primary action stays disabled until the box is ticked.
function writeDialog({ title, summary, primary }) {
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
    summaryPre(text),
    el("div", { className: "dlg-copy" }, copy),
    el("label", { className: "review-tick" }, check,
      el("span", {}, "I reviewed this configuration and the baseline selection.",
        el("small", {}, primary + " stays off until this box is ticked."))));
  return showDialog({
    title, body,
    actions: [{ label: "Cancel", value: false }, { label: primary, value: true, primary: true, disabled: true }],
    onOpen: (dlg) => {
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
