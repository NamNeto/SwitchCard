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

// Resolves with the clicked action's value, or null on Esc. Resolved by our own handlers,
// not the native close event (automated browsers can defer that indefinitely).
function showDialog({ title, body, actions, onOpen }) {
  return new Promise((resolve) => {
    const dlg = el("dialog", { className: "dlg" });
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      dlg.remove();
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
  });
}

function confirmDialog(title, textOrNode, opts) {
  const o = Object.assign({ ok: "OK", cancel: "Cancel", danger: false }, opts || {});
  const body = typeof textOrNode === "string" ? el("p", {}, textOrNode) : textOrNode;
  return showDialog({
    title, body,
    actions: [{ label: o.cancel, value: false }, { label: o.ok, value: true, primary: true, danger: o.danger }],
  }).then((v) => v === true);
}

function infoDialog(title, textOrNode) {
  const body = typeof textOrNode === "string" ? el("p", {}, textOrNode) : textOrNode;
  return showDialog({ title, body, actions: [{ label: "Close", value: true, primary: true }] }).then(() => undefined);
}

// Review-before-download gate: the primary action stays disabled until the box is ticked.
function writeDialog({ title, summary, primary }) {
  const text = String(summary).replace(/\s*Cancel = no download\.\s*$/, "");
  const check = el("input", { type: "checkbox", id: "dlgReviewed" });
  const copy = el("button", {
    type: "button",
    textContent: "Copy summary",
    onclick: async () => {
      const ok = await copyText(text);
      copy.textContent = ok ? "Copied" : "Copy failed";
    },
  });
  const body = el("div", {},
    el("pre", { className: "dlg-summary", textContent: text }),
    el("p", {}, copy),
    el("label", { className: "row" }, check, " I reviewed this configuration and the baseline selection."));
  return showDialog({
    title, body,
    actions: [{ label: "Cancel", value: false }, { label: primary, value: true, primary: true, disabled: true }],
    onOpen: (dlg) => {
      const btn = dlg.querySelector(".dialog-actions button.primary");
      check.addEventListener("change", () => { btn.disabled = !check.checked; });
    },
  }).then((v) => v === true);
}
