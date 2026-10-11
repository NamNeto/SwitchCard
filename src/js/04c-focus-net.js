/* ============================================================
   Focus safety net: focus never silently falls to <body> (operator round 6, review round 11)
   ============================================================ */
// A click or an activation key (Enter, Space) often rebuilds, hides or disables the control it
// was on (Transliterate hides its own panel, Discard hides its own button, a render replaces a
// row), and the browser then drops focus to <body> or leaves it on a dead control: a keyboard
// user loses their place and the next Tab starts from the page top. After every such event,
// after a dialog closes, and after a DOM change that removes, hides or disables the focused
// control (a MutationObserver on childList plus the disabled and hidden attributes; nothing
// else is watched), the net checks: if focus is lost AND the control it came from is gone,
// hidden or disabled, focus moves to a sensible neighbour (the same control by id, else the
// first enabled control of its group, else, after a user action only, the view heading).
//
// It rescues only focus that died with its control. Focus the user released on purpose (a click
// on empty space, a wheel scroll that closed a menu, a selection started on plain text) is noted
// on focusout while the control could still take focus, and nothing is done for that control
// afterwards, however the page changes, until focus lands on a control again. The observer path
// never scrolls: it focuses with preventScroll and skips the heading. The net does nothing while
// a dialog is open or a task runs (those put focus back themselves), never runs on a typing key,
// and never for a control inside a hidden view (showView places focus itself).
const focusNet = (() => {
  let last = null; // the control that last had focus (the event target of the last focusin)
  let lastGroup = null; // its group, noted while it was in the page (a removed node has no ancestors)
  let prev = null; // the one before it: where a dismissed status message hands focus back to
  // true once focus left `last` while it was still live: the user let it go, so a later change
  // that removes or rebuilds that control is not a loss to make good. Cleared on the next focusin.
  let released = false;
  let holds = 0; // a caller that will place focus itself after async work holds the net off
  const GROUP = ".dialog-actions, .actions, .sw-toolbar, .sw-panel-actions, .notice, .gate, .field, .card, section";
  const groupOf = (n) => (n && n.closest && n.isConnected ? n.closest(GROUP) : null);
  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (!t || t === document.body || t === document.documentElement) return;
    released = false;
    if (t === last) return;
    prev = last;
    last = t;
    lastGroup = groupOf(t);
  }, true);
  document.addEventListener("focusout", (e) => {
    // A control that is still in the page, enabled and shown after focus left it was left on
    // purpose (or by a focus move that focusin notes next). One that is gone, disabled or hidden
    // by then died under the focus: that is what the net is for. Decided a microtask later: the
    // browser blurs a control it is removing while that control is still in the page.
    const t = e.target;
    if (!t || t !== last) return;
    queueMicrotask(() => {
      if (t === last && t.isConnected && canFocus(t)) released = true;
    });
  }, true);
  const idle = () => holds > 0 || (typeof busy !== "undefined" && busy) || (typeof openDialogs !== "undefined" && openDialogs.length > 0);
  // Lost: on <body>, or on a control that cannot take focus any more (disabled, hidden).
  const lost = () => focusLost() || !canFocus(document.activeElement);
  // The heading of the open view, as the last resort (tabindex -1: focusable by script only).
  const heading = () => {
    const h = document.getElementById("viewTitle");
    return h && !h.closest("[hidden]") ? h : null;
  };
  // Where focus goes for a control that is gone: the same id, else its group's first enabled
  // control, else the heading. Returns the element it focused, or null.
  // quiet (the observer path): no scrolling and no heading; the page never jumps for a change
  // the user did not ask for.
  function rescue(from, group, quiet) {
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
    if (!canFocus(t)) t = quiet ? null : heading();
    if (!t) return null;
    t.focus({ preventScroll: true });
    if (!quiet && t.scrollIntoView) t.scrollIntoView({ block: "nearest" });
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
    if (released || !last || idle() || !lost() || canFocus(last)) return;
    // A whole view hidden (showView) is not a lost control: the view switch places focus itself.
    if (last.isConnected && last.closest("section[hidden]")) return;
    rescue(last, lastGroup, true);
  };
  if (typeof MutationObserver === "function")
    new MutationObserver(() => {
      // No layout here (this runs after every batch of changes): the attribute checks suffice.
      if (pending || released || !last || (last.isConnected && !last.disabled && !last.closest("[hidden]"))) return;
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
    // The user let the focused control go (a menu closed by a scroll or a click elsewhere): no
    // rescue for it, whatever happens to it next.
    release: () => { released = true; },
    // Hold the net off while a caller finishes async work and places focus itself; returns the
    // function that lets go (safe to call twice).
    hold: () => {
      holds++;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        holds--;
      };
    },
  };
})();
