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
