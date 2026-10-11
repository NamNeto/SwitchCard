// --- Event wiring (buttons, inputs); the boot sequence is in 11-boot.js ---
// The rail and Build's Manage button are the user's own view changes (refused during an export).
$("setup").onclick = () => showView("manage", { user: true });
$("railBuild").onclick = () => showView("build", { user: true });
$("railSwitches").onclick = () => showView("switches", { user: true });
$("railCards").onclick = () => showView("cards", { user: true });
$("railManage").onclick = () => showView("manage", { user: true });
// Hints are bounded to MAX_TEAM_HINTS lines of MAX_TEAM_HINT_CHARS, without control characters.
function boundedHints(text) {
  const all = lines(text).filter((h) => !singleLineBad(h));
  const out = all.slice(0, CONFIG.MAX_TEAM_HINTS).map((h) => h.slice(0, CONFIG.MAX_TEAM_HINT_CHARS));
  return { hints: out, trimmed: out.length !== lines(text).length || all.some((h) => h.length > CONFIG.MAX_TEAM_HINT_CHARS) };
}
$("applyTeamHints").onclick = () => {
  const bh = boundedHints($("teamHintsEditor").value);
  teamHints = bh.hints;
  $("teamHintsEditor").value = teamHints.join("\n");
  touch();
  renderPreview();
  message(
    (teamHints.length
      ? "Team security hints applied (" + teamHints.length + ")."
      : "Team security hints cleared.") +
      (bh.trimmed
        ? " Some hints were shortened or dropped (max " + CONFIG.MAX_TEAM_HINTS + " lines, " + CONFIG.MAX_TEAM_HINT_CHARS + " characters each, no control characters)."
        : ""),
  );
};
$("teamHintsEditor").addEventListener("input", () => {
  // Applied immediately so the Build panel matches the editor; advisory only.
  teamHints = boundedHints($("teamHintsEditor").value).hints;
  touch();
  renderPreview();
  scheduleAutosave();
});
// Team policy rules: same editing model as hints, but they gate export (see policyViolations).
function applyTeamPoliciesFromEditor(announce) {
  const bp = boundedPolicies($("teamPoliciesEditor").value);
  teamPolicies = bp.rules;
  const bad = teamPolicies.map(parsePolicyLine).filter((p) => p && p.error).map((p) => p.error);
  if (announce) {
    $("teamPoliciesEditor").value = teamPolicies.join("\n");
    message(
      (teamPolicies.length ? "Team policy rules applied (" + teamPolicies.length + ")." : "Team policy rules cleared.") +
        (bad.length ? " " + bad.length + " rule(s) cannot be evaluated and block export until fixed: " + bad[0] : "") +
        (bp.trimmed ? " Some rules were shortened or dropped (max " + CONFIG.MAX_TEAM_POLICIES + " lines, " + CONFIG.MAX_TEAM_POLICY_CHARS + " characters each)." : ""),
    );
  }
  touch();
  renderPreview();
}
$("applyTeamPolicies").onclick = () => applyTeamPoliciesFromEditor(true);
$("teamPoliciesEditor").addEventListener("input", () => applyTeamPoliciesFromEditor(false));
// Editor text areas grow with their content (the CSS min/max heights bound them; the resize
// handle still works between keystrokes). Hidden areas are left alone and sized when shown.
const GROWING_TEXTAREAS = ["template", "interfaces", "teamHintsEditor", "teamPoliciesEditor", "mgmtSources"];
function growTextarea(ta) {
  if (!ta || !ta.offsetParent) return;
  // The template is measured from zero, so its rows attribute (24) never pads it below a short
  // text: it ends a line or two after its last line (CSS keeps an 8-line floor).
  ta.style.height = ta.id === "template" ? "0px" : "auto";
  ta.style.height = ta.scrollHeight + 2 + "px";
}
function growEditorTextareas() {
  for (const id of GROWING_TEXTAREAS) growTextarea($(id));
}
for (const id of GROWING_TEXTAREAS) {
  const ta = $(id);
  if (ta) ta.addEventListener("input", () => growTextarea(ta));
}
// Template placeholders as chips above the template: a click inserts the placeholder at the
// caret (replacing a selection) and counts as typing, so the editor holds a draft as usual.
const TEMPLATE_CHIPS = ["HOSTNAME", "MGMT_IP", "MGMT_MASK", "MGMT_VLAN", "GATEWAY", "SITE", "VLANS", "PORTS", "MGMT_INTERFACE", "MGMT_SOURCES"];
function insertAtCaret(ta, text) {
  const start = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
  const end = ta.selectionEnd == null ? start : ta.selectionEnd;
  ta.focus({ preventScroll: true });
  ta.setRangeText(text, start, end, "end");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
(() => {
  const box = $("templateChips");
  if (!box) return;
  for (const k of TEMPLATE_CHIPS)
    box.append(el("button", {
      type: "button", className: "template-chip", title: "Insert {{" + k + "}} at the cursor",
      onclick: () => insertAtCaret($("template"), "{{" + k + "}}"),
    }, "{{" + k + "}}"));
})();
// The Build pane (the sticky preview card): once pinned under the header it may use the whole
// window; at the top of the page it ends above the fold when it can. Below 981 px it is not
// sticky. The preview box takes all the height the rest of the pane leaves, snapped to whole
// lines (n lines of 20 px + the 18 px of border and top band, never half-way through one) and
// never taller than its text. It keeps at least 12 lines while the pane is still unpinned (the
// pane then runs below the fold and the page scrolls to it) and at least 8 once pinned (the
// pane then scrolls inside, with its footer kept in view). The tips banner, a notice or a long
// list of checks never squeeze the box: its height is set here and is final.
const buildPane = document.querySelector("#build .card.pane");
const PREVIEW_MIN_LINES = 12, PREVIEW_MIN_LINES_PINNED = 8;
function sizeBuildPane() {
  if (!buildPane) return;
  const preview = $("preview");
  if ($("build").hidden || window.innerWidth <= 980) {
    buildPane.style.maxHeight = "";
    if (preview) preview.style.height = "";
    updatePreviewCue();
    return;
  }
  const header = document.querySelector("header");
  const pinnedAt = (header ? header.offsetHeight : 0) + 12;
  const top = buildPane.getBoundingClientRect().top;
  const pinned = top <= pinnedAt + 1;
  const limit = Math.max(280, window.innerHeight - Math.max(top, pinnedAt) - 12);
  if (!preview) {
    buildPane.style.maxHeight = limit + "px";
    return;
  }
  // The rest of the pane: every other child with its margins, plus the pane's own padding and
  // border, measured one by one (the box itself may be squeezed or overflowing right now).
  const px = (v) => parseFloat(v) || 0;
  let rest = 0;
  for (const c of buildPane.children) {
    if (c === preview || c.hidden) continue;
    const cs = getComputedStyle(c);
    rest += c.getBoundingClientRect().height + px(cs.marginTop) + px(cs.marginBottom);
  }
  const ps = getComputedStyle(buildPane);
  rest += px(ps.paddingTop) + px(ps.paddingBottom) + px(ps.borderTopWidth) + px(ps.borderBottomWidth);
  // Whole pixels, with 2 px to spare: fractional heights summed could leave the pane a sub-pixel
  // too tall, and the pinned footer would then cover the tails of the "Lines · Bytes" row.
  rest = Math.ceil(rest) + 2;
  // The text's own height in lines (a wrapped line counts as the rows it takes).
  const total = Math.max(1, Math.round((preview.scrollHeight - 36) / 20));
  const fit = Math.floor((limit - rest - 18) / 20);
  const floor = Math.min(total, pinned ? PREVIEW_MIN_LINES_PINNED : PREVIEW_MIN_LINES);
  let lines = Math.min(total, Math.max(fit, floor));
  // One line less when that alone keeps the unpinned pane above the fold.
  if (!pinned && lines > fit && lines === fit + 1 && lines > 2) lines = fit;
  preview.style.height = lines * 20 + 18 + "px";
  // Unpinned, the pane grows to hold the floor; pinned, it never exceeds the window.
  const need = rest + lines * 20 + 18;
  buildPane.style.maxHeight = (pinned ? limit : Math.max(limit, need)) + "px";
  updatePreviewCue();
}
// "Showing lines 1–20 of 76 · scroll for more" under the box while it scrolls; nothing when it all
// fits. Measured from the line blocks that are inside the box now, so it is never a guess: a
// ResizeObserver on the box runs it again whenever the box changes size for any reason.
function updatePreviewCue() {
  const pre = $("preview"), cue = $("previewCue");
  if (!pre || !cue) return;
  const range = visiblePreviewLines(pre);
  if (!range) {
    cue.textContent = "";
    return;
  }
  cue.textContent = "Showing lines " + range.first + "–" + range.last + " of " + range.total +
    (range.last < range.total ? " · scroll for more" : "");
}
// The first and last line blocks that are at least half inside the box, or null when the whole
// text fits. A long line wraps, so this is measured, not counted.
function visiblePreviewLines(pre) {
  const blocks = pre.querySelectorAll(".pl");
  const total = blocks.length;
  if (!total || pre.scrollHeight <= pre.clientHeight + 1) return null;
  const box = pre.getBoundingClientRect();
  const top = box.top + 1 + 16, bottom = box.top + pre.clientHeight + 1;
  let first = 0, last = 0;
  blocks.forEach((b, i) => {
    const r = b.getBoundingClientRect();
    const mid = (r.top + r.bottom) / 2;
    if (mid >= top && mid <= bottom) {
      if (!first) first = i + 1;
      last = i + 1;
    }
  });
  if (!first) first = last = Math.min(total, Math.floor(pre.scrollTop / 20) + 1);
  return { first, last, total };
}
if ($("preview")) $("preview").addEventListener("scroll", updatePreviewCue, { passive: true });
window.addEventListener("scroll", sizeBuildPane, { passive: true });
window.addEventListener("resize", sizeBuildPane);
if (buildPane && typeof ResizeObserver === "function") {
  // The pane's top moves when the tips banner or a notice above it changes: size it again.
  const ro = new ResizeObserver(() => requestAnimationFrame(sizeBuildPane));
  ro.observe(buildPane.parentElement);
  const onboard = $("onboarding");
  if (onboard) ro.observe(onboard);
  // The checks above the box and the gate under it change height with the findings.
  for (const id of ["checks", "exportWhy"]) if ($(id)) ro.observe($(id));
  // The cue follows the box itself, whatever changed its size.
  if ($("preview")) new ResizeObserver(() => requestAnimationFrame(updatePreviewCue)).observe($("preview"));
}
// Theme picker (header).
$("themeSelect").onchange = () => {
  const v = $("themeSelect").value;
  try {
    if (v === "auto") localStorage.removeItem(CONFIG.THEME_KEY);
    else localStorage.setItem(CONFIG.THEME_KEY, v);
  } catch (e) {}
  applyTheme(v);
};
// Transliteration helper: values and descriptions now; template / roles / sources as an editor draft.
$("fixAscii").onclick = () => {
  const r = current();
  const changedValues = [];
  for (const k of Object.keys(r.values || {})) {
    const t = transliterateAscii(r.values[k]);
    if (t !== r.values[k]) {
      r.values[k] = t.trim();
      changedValues.push(k);
    }
  }
  let changedPorts = 0;
  for (const p of r.ports || []) {
    const t = transliterateAscii(p.description || "");
    if (t !== (p.description || "")) {
      p.description = t;
      changedPorts++;
    }
  }
  const tpl = transliterateAscii(r.template);
  const roles = {};
  for (const k of ROLE_NAMES) roles[k] = transliterateAscii(r.roles[k]);
  const src = transliterateAscii(mgmtSourcesText(r));
  const editorNeeds = tpl !== r.template || ROLE_NAMES.some((k) => roles[k] !== r.roles[k]) || src !== mgmtSourcesText(r);
  if (changedValues.length || changedPorts) {
    touch();
    renderAll();
  }
  let msg = "Transliterated " + (changedValues.length ? "values " + changedValues.join(", ") : "no values") + (changedPorts ? " and " + changedPorts + " port description(s)" : "") + ".";
  if (editorNeeds) {
    if (editorPending) msg += " The recipe editor holds an unapplied draft; Apply or Discard it, then run this again for the template.";
    else {
      tab(true);
      $("template").value = tpl;
      const ids = { access: "roleAccess", trunk: "roleTrunk", unused: "roleUnused", routed: "roleRouted" };
      for (const k of ROLE_NAMES) $(ids[k]).value = roles[k];
      $("mgmtSources").value = src;
      editorPending = true;
      updateDiscardButton();
      touch();
      renderPreview();
      msg += " A transliterated template, role templates and source block are loaded in the recipe editor — review them and click Apply recipe changes.";
    }
  } else if (!changedValues.length && !changedPorts) msg += " No translatable characters found; the reported character must be edited by hand.";
  message(msg);
};
// Interface list from pasted show output (recipe editor).
$("useIfaceBrief").onclick = () => {
  const parsed = parseInterfaceBrief($("ifaceBriefPaste").value);
  if (!parsed.names.length) {
    message("No physical Ethernet interface names found in the pasted text.");
    return;
  }
  if (parsed.names.length > MAX_INTERFACES) {
    message("Found " + parsed.names.length + " interfaces; the limit is " + MAX_INTERFACES + ".");
    return;
  }
  $("interfaces").value = parsed.names.join("\n");
  $("skuPreset").value = "";
  updateDeleteSkuPresetButton();
  editorPending = true;
  touch();
  updateDiscardButton();
  renderPreview();
  message(
    "Interface list filled with " + parsed.names.length + " port" + (parsed.names.length === 1 ? "" : "s") + " from the pasted output" +
      (parsed.skipped.length ? "; skipped " + parsed.skipped.length + ": " + parsed.skipped.slice(0, 6).join(", ") + (parsed.skipped.length > 6 ? ", …" : "") : "") +
      ". Click Apply recipe changes to keep it.",
  );
};
// File-name part for a recipe's CSV downloads.
function csvFileStem(r) {
  return String(r.name || "recipe").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60);
}
// A byte-order mark makes Excel read the file as UTF-8; SwitchCard ignores it when loading.
function downloadCsv(text, name) {
  download(new Blob(["\uFEFF" + text.replace(/\n/g, "\r\n")], { type: "text/csv;charset=utf-8" }), name);
}
$("newSwitch").onclick = () => newSwitch();
$("applyBulkVlan").onclick = () => {
  const r = current();
  // Bulk VLAN is an explicit action with its own message; it refuses (never stores) bad input
  const vlan = ($("bulkVlan").value || "").trim();
  if (hasVlanControlChars(vlan) || findInvisibleChar(vlan)) {
    message("VLAN must be on one line (no line breaks or tabs).");
    return;
  }
  if (!vlan) {
    message("Enter a VLAN or VLAN list first.");
    return;
  }
  const picks = [...document.querySelectorAll("#ports input.portPick:checked")].map(
    (c) => c.dataset.port,
  );
  if (!picks.length) {
    message("Check one or more Access/Trunk ports first.");
    return;
  }
  let n = 0,
    skipped = 0;
  for (const p of r.ports) {
    if (!picks.includes(p.name)) continue;
    if (p.role === "access" || p.role === "trunk") {
      p.vlan = vlan;
      n++;
    } else skipped++;
  }
  touch();
  renderFields();
  renderPreview();
  recheckPorts(picks);
  message(
    n
      ? "Updated VLAN on " +
          n +
          " port" +
          (n === 1 ? "" : "s") +
          (skipped ? "; skipped " + skipped + " Unused/Routed." : "") +
          "."
      : "No Access/Trunk ports were checked.",
  );
};
// Checked ports survive a re-render, so role and VLAN can be applied to the same selection.
function recheckPorts(names) {
  document.querySelectorAll("#ports input.portPick").forEach((c) => {
    c.checked = names.includes(c.dataset.port);
  });
}
$("applyBulkRole").onclick = () => {
  const r = current();
  const role = $("bulkRole").value;
  if (!ROLE_NAMES.includes(role)) {
    message("Choose a role first.");
    return;
  }
  const picks = [...document.querySelectorAll("#ports input.portPick:checked")].map((c) => c.dataset.port);
  if (!picks.length) {
    message("Check one or more ports first.");
    return;
  }
  let n = 0;
  for (const p of r.ports) {
    if (!picks.includes(p.name) || p.role === role) continue;
    p.role = role;
    if (role !== "routed") {
      p.ip = "";
      p.mask = "";
    }
    n++;
  }
  touch();
  renderFields();
  renderPreview();
  recheckPorts(picks);
  const label = role[0].toUpperCase() + role.slice(1);
  message(
    n
      ? "Set " + n + " port" + (n === 1 ? "" : "s") + " to " + label + "." +
          (role === "access" ? " Give them an Access VLAN; Apply VLAN to checked works on the same selection." : "") +
          (role === "routed" ? " Fill in the IP and mask of each." : "")
      : "The checked ports are already " + label + ".",
  );
};
// Port CSV on the page: copy the table out, load a file, apply all rows or none.
$("portCsvFromTable").onclick = async () => {
  const r = current();
  normalizePorts(r);
  const text = portTableCsv(r);
  const existing = $("portCsv").value.trim();
  if (
    existing &&
    existing !== text.trim() &&
    !(await confirmDialog("Replace the port CSV text?", "Replace the text in the port CSV box with the current port table?", { ok: "Replace" }))
  ) {
    message("Kept the port CSV text.");
    return;
  }
  $("portCsv").value = text;
  message("Port table copied into the CSV box. Edit it here or in a spreadsheet, then Apply to ports.");
};
$("portCsvInput").onchange = () =>
  run(async () => {
    const f = $("portCsvInput").files[0];
    if (!f) return;
    try {
      if (f.size > 1024 * 1024) throw Error("CSV file is too large (max 1 MiB).");
      $("portCsv").value = await f.text();
      message("CSV loaded (" + f.name + "). Click Apply to ports.");
    } finally {
      $("portCsvInput").value = "";
    }
  });
$("applyPortCsv").onclick = () => {
  const r = current();
  normalizePorts(r);
  const res = applyPortCsv(r, $("portCsv").value);
  if (res.errors.length) {
    message("Port CSV not applied, nothing changed: " + res.errors.slice(0, 3).join(" ") + (res.errors.length > 3 ? " (+" + (res.errors.length - 3) + " more)" : ""));
    return;
  }
  r.ports = res.ports;
  touch();
  renderFields();
  renderPreview();
  const parts = PORT_ATTRS.filter((k) => res.changed[k]).map((k) => res.changed[k] + " " + (k === "ip" || k === "mask" ? k.toUpperCase() : k) + (res.changed[k] === 1 ? "" : "s"));
  message(
    "Port CSV applied: " + res.rows + " row" + (res.rows === 1 ? "" : "s") + ", " +
      (res.portsChanged ? res.portsChanged + " port" + (res.portsChanged === 1 ? "" : "s") + " changed (" + parts.join(", ") + ")." : "no changes.") +
      (res.ignored.length ? " Ignored columns: " + res.ignored.join(", ") + "." : "") + " Review the preview before export.",
  );
};

$("dismissOnboarding").onclick = () => {
  $("onboarding").hidden = true;
  // The button just hid itself: focus moves on to step 1 (the recipe picker), never to <body>.
  if (canFocus($("recipe"))) $("recipe").focus({ preventScroll: true });
  // Storage may be blocked (file:// policies, private mode): never throw here.
  try {
    localStorage.setItem(ONBOARD_KEY, "1");
  } catch (e) {
    message("Tip hidden for this session (browser storage is unavailable, so it may show again).");
  }
};
$("skuPreset").onchange = () => {
  const key = $("skuPreset").value;
  updateDeleteSkuPresetButton();
  const names = resolveSkuPreset(key);
  if (!key || !names) return;
  $("interfaces").value = names.join("\n");
  editorPending = true;
  touch();
  updateDiscardButton();
  renderPreview();
  message(
    "Preset filled the interface list. Click Apply recipe changes to keep it. Always confirm with show ip interface brief on the device.",
  );
};
$("saveSkuPreset").onclick = () => {
  const name = ($("customSkuName").value || "").trim();
  const names = lines($("interfaces").value);
  if (!name) {
    message("Enter a name for the SKU preset.");
    return;
  }
  if (name.length > CONFIG.MAX_PRESET_NAME_CHARS || singleLineBad(name)) {
    message(
      "Preset name must be at most " + CONFIG.MAX_PRESET_NAME_CHARS + " characters with no control characters.",
    );
    return;
  }
  if (!names.length) {
    message("Add at least one interface name before saving a preset.");
    return;
  }
  if (
    new Set(names.map((x) => x.toLowerCase())).size !== names.length ||
    names.some((x) => !/^[A-Za-z][A-Za-z0-9/.:_-]*$/.test(x))
  ) {
    message("Interface names must be unique, start with a letter and contain no spaces or commands.");
    return;
  }
  // Own-property check, so names like "toString" are not mistaken for built-in presets.
  if (Object.hasOwn(SKU_PRESETS, name)) {
    message("That name matches a built-in SKU. Choose a different preset name.");
    return;
  }
  const next = cloneCustomSkuPresets(customSkuPresets);
  next[name] = names;
  setCustomSkuPresets(next);
  $("customSkuName").value = "";
  $("skuPreset").value = "custom:" + name;
  updateDeleteSkuPresetButton();
  message('Saved custom SKU preset "' + name + '". Click Apply recipe changes to keep the list on this recipe.');
};
$("deleteSkuPreset").onclick = async () => {
  const key = $("skuPreset").value;
  if (!key.startsWith("custom:")) return;
  const name = key.slice(7);
  if (!Object.hasOwn(customSkuPresets, name)) return;
  if (!(await confirmDialog("Delete custom SKU preset?", 'Delete custom SKU preset "' + name + '"?', { ok: "Delete", danger: true }))) return;
  const next = cloneCustomSkuPresets(customSkuPresets);
  delete next[name];
  setCustomSkuPresets(next);
  $("skuPreset").value = "";
  updateDeleteSkuPresetButton();
  message('Deleted custom SKU preset "' + name + '".');
};
for (const id of ["recipe", "editRecipe", "swRecipe", "cdRecipe"])
  $(id).onchange = () => {
    if (editorPending) {
      $(id).value = active;
      message("Apply your recipe changes before switching recipes.");
      return;
    }
    // Picking the recipe that is already active changes nothing, so it does not mark the
    // workspace as unsaved (a false "You have unsaved changes" on the next Open).
    if ($(id).value === active) return;
    active = $(id).value;
    touch();
    renderAll();
    loadEditor();
  };
$("applyRecipe").onclick = async () => {
  try {
    await applyRecipe();
  } catch (e) {
    message(e.message);
  }
};
$("duplicate").onclick = () => {
  if (editorPending) {
    message("Apply your recipe changes before duplicating.");
    return;
  }
  if (recipes.length >= MAX_RECIPES) {
    message("Cannot duplicate — recipe limit is " + MAX_RECIPES + ".");
    return;
  }
  const r = structuredClone(current());
  r.id = crypto.randomUUID();
  r.exports = {}; // export history belongs to the original recipe
  r.exportStates = {}; // and so do the export states
  if (Array.isArray(r.switches)) r.switches = copySwitchRows(r.switches); // same switches, new ids
  r.name = (r.name.length + 7 > CONFIG.MAX_RECIPE_NAME_CHARS
    ? r.name.slice(0, CONFIG.MAX_RECIPE_NAME_CHARS - 7)
    : r.name) + " - copy";
  // The copy keeps the example flag; clearing it is a deliberate step after a spare test.
  recipes.push(r);
  active = r.id;
  touch();
  renderAll();
  loadEditor();
  message(
    r.example
      ? "Duplicated (still marked Example — card ZIP blocked until you uncheck Example and Apply)."
      : "Duplicated as a custom recipe (export allowed once baseline + review are ready).",
  );
};
$("deleteRecipe").onclick = async () => {
  if (editorPending) {
    message("Apply or discard your recipe changes before deleting.");
    return;
  }
  if (recipes.length <= 1) {
    message("Cannot delete the last recipe.");
    return;
  }
  const nsw = (current().switches || []).length;
  if (
    !(await confirmDialog(
      "Delete this recipe?",
      'Delete recipe "' +
        current().name +
        '"' +
        (nsw ? " and its " + nsw + " switch" + (nsw === 1 ? "" : "es") : "") +
        "? This cannot be undone in the browser (Save project first if you need a backup).",
      { ok: "Delete recipe", danger: true },
    ))
  ) {
    message("Delete cancelled; the recipe is kept.");
    return;
  }
  const deleted = active;
  recipes = recipes.filter((r) => r.id !== deleted);
  active = recipes[0].id;
  editorPending = false;
  touch();
  renderAll();
  loadEditor();
  updateDiscardButton();
  message("Recipe deleted.");
};
$("discardDraft").onclick = async () => {
  if (!editorPending) {
    message("No unapplied draft to discard.");
    return;
  }
  if (!(await confirmDialog("Discard the draft?", "Discard unapplied draft and reload the applied recipe?", { ok: "Discard", danger: true }))) return;
  editorPending = false;
  loadEditor();
  autosave();
  updateDiscardButton();
  renderPreview();
  message("Unapplied draft discarded. Editor reloaded from the applied recipe.");
};
async function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      /* fall through to textarea */
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
$("copyPreview").onclick = () =>
  run(async () => {
    const g = generate(current());
    if (g.errors.length) throw Error("Fix validation errors before copying.");
    const ok = await copyText(g.text);
    if (ok) message("Configuration preview copied to clipboard.");
    else
      message(
        "Could not copy — clipboard may be restricted on this file:// page. Use Save text only instead.",
      );
  });
// Clear removes EVERY SwitchCard key (current + legacy autosave, all
// backups, presets, onboarding/pin flags), then marks legacy autosave as handled.
function switchcardStorageKeys() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CONFIG.STORAGE_PREFIX)) out.push(k);
  }
  return out.sort();
}
function clearAllSwitchcardStorage() {
  const ks = switchcardStorageKeys();
  for (const k of ks) localStorage.removeItem(k);
  localStorage.setItem(CONFIG.LEGACY_AUTOSAVE_READ_KEY, "1");
  return ks;
}
$("clearAutosave").onclick = async () => {
  let ks = [];
  try {
    ks = switchcardStorageKeys();
  } catch (e) {}
  const nb = listAutosaveBackups().length;
  if (
    !(await confirmDialog(
      "Clear browser data?",
      "Clear ALL SwitchCard data stored in this browser?\n\n" +
        "Removes " + ks.length + " item(s): current and older autosaves, " + nb + " autosave backup(s), custom SKU presets, theme and tips/pin settings." +
        (nb ? "\n\nTip: Cancel and use Download autosave backup first if you may need a backup." : "") +
        "\n\nIn-memory work stays until you reload.",
      { ok: "Clear", danger: true },
    ))
  )
    return;
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  try {
    const removed = clearAllSwitchcardStorage();
    autosavePaused = false; // an explicit clear re-enables autosave on the next edit
    setAutosaveHint("");
    refreshBackupButtons();
    message(
      "Browser storage cleared: removed " + removed.length + " SwitchCard item(s) (autosaves, backups, presets, settings). In-memory recipes and baseline stay until you reload; the next edit starts a new autosave.",
    );
  } catch (e) {
    setAutosaveHint("fail");
    message("Could not clear browser autosave: " + (e && e.message ? e.message : e));
  }
};
$("backupSlot").onchange = () => refreshBackupButtons();
$("restoreBackup").onclick = () => restoreSelectedBackup();
$("downloadBackup").onclick = () => {
  const slot = selectedBackupSlot();
  const b = readAutosaveBackup(slot);
  if (!b) return message("No autosave backup found.");
  download(
    new Blob([b.raw], { type: "application/json" }),
    "switchcard-autosave-backup" + (slot ? "-" + (slot + 1) : "") + ".json",
  );
  message("Autosave backup downloaded. It can be opened with Open project (the autosave wrapper is accepted).");
};
// Two tabs share one autosave: warn when another tab writes it.
window.addEventListener("storage", (e) => {
  if (e.key === AUTOSAVE_KEY && e.newValue)
    message(
      "Another SwitchCard tab just autosaved. Only one tab's work is kept in browser autosave — use Save project to keep both.",
    );
  if (e.key === CONFIG.AUTOSAVE_BACKUP_KEY || CONFIG.AUTOSAVE_BACKUP_KEYS.includes(e.key)) refreshBackupButtons();
});
$("folderInput").onchange = () =>
  run(async () => {
    const model = $("baseModel").value,
      rawVersion = $("baseVersion").value,
      version = sanitizeSingleLine(rawVersion).text.trim();
    // Taken and cleared first, so picking the same folder again after a refusal fires change again.
    const selected = [...$("folderInput").files];
    $("folderInput").value = "";
    $("baseVersion").value = version;
    if (!version)
      throw Error("Enter a firmware / baseline label first, then select the folder again.");
    if (!selected.length) return;
    // webkitRelativePath is "FolderName/rel/path"; slice(1) drops the outer folder name
    const files = selected.map((f) => ({
      path: f.webkitRelativePath.split("/").slice(1).join("/"),
      blob: f,
    }));
    checkFiles(files);
    assertBaselineComplete(files, "Baseline folder");
    // Fingerprint every file (hashes only, never bytes) and compare with the project's record.
    const fingerprint = await fingerprintFiles(files, "Fingerprinting baseline");
    const compare = baselineExpected && baselineExpected.fingerprint ? compareFingerprints(baselineExpected.fingerprint, fingerprint) : null;
    baseline = { model, version, files, fingerprint, compare };
    touch();
    renderBaseline();
    // The fingerprint covers the files only; say so when the model or label differs from the record.
    const recordDiffers = baselineExpected && (baselineExpected.model !== model || baselineExpected.version !== version)
      ? " Note: the project recorded " + baselineExpected.model + " / " + baselineExpected.version + "; this baseline is loaded as " + model + " / " + version + "."
      : "";
    const nonAscii = files.filter((f) => /[^\x20-\x7e]/.test(f.path)).length;
    message(
      "Baseline loaded. Verify its file list and model; automatic firmware identification is not included." +
        (compare
          ? compare.same
            ? " Fingerprint matches the project's recorded baseline."
            : " WARNING: fingerprint " + compare.summary + (compare.changed.length ? "; changed: " + compare.changed.slice(0, 5).join(", ") : "") + ". Use the recorded folder, or Save project to record this one."
          : " Fingerprint recorded (" + fingerprint.digest.slice(0, 12) + "…); Save project keeps it.") +
        recordDiffers +
        (version !== rawVersion ? " Cleaned baseline label; updated value is shown in the editor." : "") +
        (nonAscii
          ? " Note: " + nonAscii + " file name(s) contain non-ASCII characters; the ZIP marks them as UTF-8 but some extractors may still show them incorrectly."
          : ""),
    );
    $("folderInput").value = "";
  });
$("downloadConfig").onclick = () => {
  if (editorPending) {
    message("Apply recipe changes or Discard unapplied draft first.");
    return;
  }
  const r = current();
  if (r.example) {
    message(EXAMPLE_TEXT_BLOCKED);
    return;
  }
  const g = generate(r);
  if (g.errors.length) return;
  const policyHits = policyViolations(g.text, teamPolicies);
  if (policyHits.length) {
    message("Team policy blocks this text: " + policyHits[0]);
    return;
  }
  download(new Blob([g.text], { type: "text/plain;charset=utf-8" }), "editcontent.txt");
  message(
    "Text exported as editcontent.txt (" +
      previewSizeLabel(g.text) +
      "). A browser may append a number if that filename already exists in Downloads.",
  );
};

function assertExportReady() {
  const r = current();
  // Single generate() result used for preview identity and ZIP root editcontent.txt
  const g = generate(r);
  const b = blockers(r, g);
  if (editorPending)
    throw Error("Apply recipe changes or Discard unapplied draft first.");
  if (g.errors.length || b.length)
    throw Error("Complete the checks first.");
  return { r, g };
}
function buildCardFiles(g) {
  // Preview ≡ ZIP: g.text is the same string shown in Configuration preview
  const files = baseline.files.filter((f) => f.path.toLowerCase() !== "editcontent.txt");
  files.push({ path: "editcontent.txt", blob: new Blob([g.text], { type: "text/plain" }) });
  return files;
}

$("downloadCard").onclick = () =>
  run(async () => {
    const { r, g } = assertExportReady();
    if (
      !(await writeDialog({
        title: "Export SD-card ZIP?",
        summary: exportConfirmSummary(r, g),
        primary: "Download ZIP",
        warning: baselineDiffersWarning(),
      }))
    ) {
      message("SD-card ZIP export cancelled.");
      return;
    }
    const files = buildCardFiles(g);
    const out = await zip(files, new Date());
    download(
      out,
      exportHostnameForFile(r) +
        "-switchcard-" +
        RELEASE +
        "-sdcard.zip",
    );
    // Remember this text per hostname so the next build of the same switch shows a diff.
    recordExport(r, String((r.values && r.values.HOSTNAME) || ""), g.text);
    touch();
    message(
      "SD-card ZIP exported (" +
        previewSizeLabel(g.text) +
        ", editcontent.txt SHA-256 " +
        sha256Hex(g.text).slice(0, 16) +
        "…). Extract ZIP contents to the card ROOT (editcontent.txt beside the baseline files — not inside an extra folder).",
    );
  });
$("saveProject").onclick = async () => {
  try {
    if (editorPending) {
      if (
        !(await confirmDialog(
          "Save without the draft?",
          "The unapplied recipe draft is NOT included in Save project (applied recipes only). Continue download anyway?",
          { ok: "Save without the draft" },
        ))
      ) {
        message("Save project cancelled — Apply or Discard the draft first to include those edits.");
        return;
      }
    }
    const payload = project();
    const pretty = JSON.stringify(payload, null, 2);
    if (enc.encode(pretty).length > MAX_PROJECT_BYTES)
      throw Error(
        "Project is too large to save (" +
          enc.encode(pretty).length +
          " bytes; max " +
          MAX_PROJECT_BYTES +
          "). Reduce recipes/templates before saving.",
      );
    download(
      new Blob([pretty], { type: "application/json" }),
      // The local date keeps repeated saves apart in Downloads.
      "switchcard-project-" + RELEASE + "-" + formatExportAt(new Date().toISOString()).slice(0, 10) + ".json",
    );
    dirty = false;
    autosave();
    message(
      "Project JSON downloaded. Reload the firmware folder next session (or use a team package to bundle baseline files)." +
        (baseline && baseline.fingerprint ? " The loaded baseline's fingerprint is recorded, so a different folder is flagged next time." : ""),
    );
  } catch (e) {
    message(e.message || String(e));
  }
};
$("saveProjectDraft").onclick = () => $("saveProject").onclick();
$("projectInput").onchange = () =>
  run(async () => {
    const f = $("projectInput").files[0];
    if (!f) return;
    try {
      if (f.size > MAX_PROJECT_BYTES) throw Error("Project file is too large.");
      if (!(await confirmReplaceUnsavedWork("project"))) {
        message("Open project cancelled — current workspace kept.");
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await f.text());
      } catch (e) {
        if (e instanceof SyntaxError) throw Error("Project JSON is invalid.");
        throw e;
      }
      // Accept an autosave / autosave-backup download too (project inside a wrapper)
      const restoredFile = parseWorkspaceFile(parsed);
      const notes = await acceptProject(restoredFile.p, null, restoredFile);
      let msg =
        "Project opened. Reload its baseline folder or open a team package to include firmware.";
      if (restoredFile.draft) msg += " Unapplied recipe draft restored into the editor; Apply or Discard before export.";
      if (restoredFile.preservedAutosaveRaw) msg += " Earlier stored autosave bytes remain included as preservedAutosaveRaw in the imported wrapper and this workspace.";
      msg += parkedDraftNote(restoredFile);
      if (notes && notes.length) msg += " Migration notes: " + notes.join(" ");
      message(msg);
    } finally {
      $("projectInput").value = "";
    }
  });
$("savePackage").onclick = () =>
  run(async () => {
    if (editorPending)
      throw Error("Apply recipe changes or Discard unapplied draft first.");
    if (!baseline) throw Error("Load a baseline first.");
    assertBaselineComplete(baseline.files, "Team package baseline");
    const manifestJson = assertProjectSaveSize(project());
    const files = [
      { path: "_switchcard.json", blob: new Blob([manifestJson]) },
      ...baseline.files.map((f) => ({ path: "baseline/" + f.path, blob: f.blob })),
    ];
    download(await zip(files), "switchcard-team-package.zip");
    dirty = false;
    autosave();
    message(
      "Team package saved with all recipes, current device details and the selected baseline. Share it privately alongside SwitchCard.html; never publish packages with firmware or secrets to a public repository.",
    );
  });
$("packageInput").onchange = () =>
  run(async () => {
    const f = $("packageInput").files[0];
    if (!f) return;
    try {
      if (!(await confirmReplaceUnsavedWork("team package"))) {
        message("Open team package cancelled — current workspace kept.");
        return;
      }
      const files = await unzip(f),
        manifest = files.find((f) => f.path === "_switchcard.json");
      if (!manifest || manifest.blob.size > MAX_PROJECT_BYTES)
        throw Error("Package manifest is missing or too large.");
      let parsed;
      try {
        parsed = JSON.parse(await manifest.blob.text());
      } catch (e) {
        if (e instanceof SyntaxError) throw Error("Project JSON is invalid.");
        throw e;
      }
      const p = validateProject(parsed);
      if (!p.baseline) throw Error("Package baseline metadata is missing.");
      if (files.some((f) => f.path !== "_switchcard.json" && !f.path.startsWith("baseline/")))
        throw Error("Unexpected package contents.");
      const baseFiles = files
        .filter((f) => f.path.startsWith("baseline/"))
        .map((f) => ({ path: f.path.slice(9), blob: f.blob }));
      checkFiles(baseFiles);
      assertBaselineComplete(baseFiles, "Team package baseline");
      const fingerprint = await fingerprintFiles(baseFiles, "Checking package files");
      if (p.baseline.fingerprint && p.baseline.fingerprint.digest !== fingerprint.digest)
        throw Error(
          "The package's baseline files do not match the fingerprint in its manifest (" + p.baseline.fingerprint.fileCount + " files recorded, " + fingerprint.fileCount + " found). It was altered after Save team package; rebuild it from the original workspace.",
        );
      const notes = await acceptProject(p, { ...p.baseline, files: baseFiles, fingerprint });
      let msg =
        "Team package opened. Baseline integrity checked (complete sync export). Select a recipe to prepare a card.";
      if (notes && notes.length) msg += " Migration notes: " + notes.join(" ");
      message(msg);
    } finally {
      $("packageInput").value = "";
    }
  });
for (const id of [
  "recipeName",
  "recipeModel",
  "firmwareRule",
  "template",
  "interfaces",
  "roleAccess",
  "roleTrunk",
  "roleUnused",
  "roleRouted",
  "mgmtInterface",
  "mgmtSources",
  "exampleFlag",
  "optProvenance",
  "optDefaultInterface",
  // "skuPreset" is not in this list: its onchange handles real presets, and "Custom (keep current)"
  // is a no-op and must not create a pending draft.
])
  $(id).addEventListener("input", () => {
    editorPending = true;
    touch();
    updateDiscardButton();
    renderPreview(); // refresh export reasons and button states
  });
window.addEventListener("beforeunload", (e) => {
  if (dirty || editorPending) {
    e.preventDefault();
    e.returnValue = "";
  }
});
// An edit made within the autosave debounce of a reload or close is written on the way out
// (synchronously, to localStorage); nothing is written while autosave is paused (boot dialog,
// an open Ports dialog), which keeps those cases as they are.
window.addEventListener("pagehide", () => {
  if (autosaveTimer && !autosavePaused) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    autosave();
  }
});
function restorePendingDraft(draft) {
  active = draft.recipeId;
  renderAll();
  loadEditor();
  editorPending = true;
  restoreDraftFields(draft);
  $("editRecipe").value = active;
  tab(true);
  renderPreview();
}
function applyRestoredResult(restored, source) {
  const meta = restored.meta || {};
  const from =
    " (" + source + " saved by v" + (meta.release || "?") + ", " + formatSavedAt(meta.savedAt) +
    (restored.key && restored.key !== AUTOSAVE_KEY ? "; one-time import from " + restored.key : "") +
    ")";
  if (restored.draft) {
    restorePendingDraft(restored.draft);
    setAutosaveHint("draft");
    updateDiscardButton();
    let msg =
      "Unapplied recipe draft restored" + from + " — click Apply recipe changes to keep it, or Discard unapplied draft.";
    if (restored.migrationNotes && restored.migrationNotes.length)
      msg += " Migration notes: " + restored.migrationNotes.join(" ");
    message(msg);
  } else {
    setAutosaveHint("workspace");
    let msg =
      "Restored your last saved workspace from this browser" + from + ". Baseline files were not stored — reload the sync folder if needed.";
    msg += parkedDraftNote(restored);
    if (restored.migrationNotes && restored.migrationNotes.length)
      msg += " Migration notes: " + restored.migrationNotes.join(" ");
    message(msg);
  }
}
