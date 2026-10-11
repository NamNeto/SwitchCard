/* ============================================================
   Focus safety net: focus never silently falls to <body> (operator round 6)
   ============================================================ */
// A click or an activation key (Enter, Space) often rebuilds, hides or disables the control it
// was on (Transliterate hides its own panel, Discard hides its own button, a render replaces a
// row), and the browser then drops focus to <body> or leaves it on a dead control: a keyboard
// user loses their place and the next Tab starts from the page top. After every such event,
// after a dialog closes, and after any DOM change that removes, hides or disables the focused
// control, the net checks: if focus is lost AND the control it came from is gone, hidden or
// disabled, focus moves to a sensible neighbour (the same control by id, else the first enabled
// control of its group, else the view heading). It never moves focus that the user has (nothing
// is stolen from a control they just reached, and a deliberate blur stays a blur), does nothing
// while a dialog is open or a task runs (those put focus back themselves), and never runs on a
// typing key.
const focusNet = (() => {
  let last = null; // the control that last had focus (the event target of the last focusin)
  let lastGroup = null; // its group, noted while it was in the page (a removed node has no ancestors)
  let prev = null; // the one before it: where a dismissed status message hands focus back to
  const GROUP = ".dialog-actions, .actions, .sw-toolbar, .sw-panel-actions, .notice, .gate, .field, .card, section";
  const groupOf = (n) => (n && n.closest && n.isConnected ? n.closest(GROUP) : null);
  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (!t || t === document.body || t === document.documentElement || t === last) return;
    prev = last;
    last = t;
    lastGroup = groupOf(t);
  }, true);
  const idle = () => (typeof busy !== "undefined" && busy) || (typeof openDialogs !== "undefined" && openDialogs.length > 0);
  // Lost: on <body>, or on a control that cannot take focus any more (disabled, hidden).
  const lost = () => focusLost() || !canFocus(document.activeElement);
  // The heading of the open view, as the last resort (tabindex -1: focusable by script only).
  const heading = () => {
    const h = document.getElementById("viewTitle");
    return h && !h.closest("[hidden]") ? h : null;
  };
  // Where focus goes for a control that is gone: the same id, else its group's first enabled
  // control, else the heading. Returns the element it focused, or null.
  function rescue(from, group) {
    if (!lost() || idle()) return null;
    const src = from && from !== document.body ? from : last;
    if (!src || src === document.body || src === document.documentElement) return null;
    // Still focusable: the user blurred it on purpose (a click on empty space); leave it.
    if (canFocus(src)) return null;
    let t = src.id ? document.getElementById(src.id) : null;
    if (!canFocus(t)) {
      const box = groupOf(src) || [group, src === last ? lastGroup : null].find((g) => g && g.isConnected && !g.closest("[hidden]"));
      t = box ? [...box.querySelectorAll("button, input, select, textarea, summary, a[href]")].find(canFocus) : null;
    }
    if (!canFocus(t)) t = heading();
    if (!t) return null;
    t.focus({ preventScroll: true });
    if (t.scrollIntoView) t.scrollIntoView({ block: "nearest" });
    return t;
  }
  // After the event's own handlers ran (a macrotask later: a handler that opens a dialog or
  // moves focus itself has done so by then, and the net then sees focus is not lost).
  const later = (src) => {
    const group = groupOf(src);
    setTimeout(() => rescue(src, group), 0);
  };
  const control = (n) => (n && n.closest ? n.closest("button, input, select, textarea, summary, a[href]") : null);
  document.addEventListener("click", (e) => {
    const c = control(e.target);
    if (c) later(c);
  });
  document.addEventListener("keydown", (e) => {
    // Activation keys on a button-like control only; typing in a text field is never touched.
    if (e.key !== "Enter" && e.key !== " ") return;
    const c = control(e.target);
    if (!c || !c.matches("button, summary, a[href], input[type='checkbox'], input[type='radio']")) return;
    later(c);
  });
  // A change that removes, hides or disables the focused control (a render after an awaited
  // dialog, a panel that hides itself): one check per batch of changes, a macrotask later.
  let pending = false;
  const check = () => {
    pending = false;
    // A whole view hidden (showView) is not a lost control: the view switch places focus itself.
    if (last && !idle() && lost() && !canFocus(last) && !(last.isConnected && last.closest("section[hidden]"))) rescue(last, lastGroup);
  };
  if (typeof MutationObserver === "function")
    new MutationObserver(() => {
      // No layout here (this runs after every batch of changes): the attribute checks suffice.
      if (pending || !last || (last.isConnected && !last.disabled && !last.closest("[hidden]"))) return;
      pending = true;
      setTimeout(check, 0);
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden"] });
  return {
    rescue,
    groupOf,
    // The control focused before the current one (the status message's close control hands focus
    // back to the control that raised the message, when it still can take it).
    previous: () => prev,
    last: () => last,
  };
})();
