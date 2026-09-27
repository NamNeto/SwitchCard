// --- Event wiring (buttons, inputs) and boot sequence (end of file) ---
$("buildTab").onclick = () => tab(false);
$("maintainTab").onclick = () => tab(true);
$("setup").onclick = () => tab(true);
$("backBuild").onclick = () => tab(false);
$("pinMaintainTab").onchange = () => {
  try {
    localStorage.setItem(SHOW_MAINTAIN_TAB_KEY, $("pinMaintainTab").checked ? "1" : "0");
  } catch (e) {}
  applyMaintainTabPin();
  message(
    $("pinMaintainTab").checked
      ? "Setup tab pinned in the top bar."
      : "Setup tab hidden from the top bar — use Manage recipes & baseline under the recipe picker.",
  );
};
applyMaintainTabPin();
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
// Fleet (Build).
$("checkFleet").onclick = () => {
  const r = current();
  const res = checkFleet(r, $("fleetCsv").value);
  fleet = { ...res, recipeId: r.id, stamp: fleetStamp(r) };
  renderFleet(fleet);
  refreshFleetButtons();
  const bad = res.rows.filter((x) => x.errors.length || x.policy.length).length;
  message(
    res.errors.length
      ? "Fleet CSV cannot be used: " + res.errors[0]
      : bad
        ? "Fleet checked: " + bad + " of " + res.rows.length + " switches have errors (see the Result column)."
        : "Fleet checked: " + res.rows.length + " switch" + (res.rows.length === 1 ? "" : "es") + " ready.",
  );
};
$("fleetCsvInput").onchange = () =>
  run(async () => {
    const f = $("fleetCsvInput").files[0];
    if (!f) return;
    try {
      if (f.size > 2 * 1024 * 1024) throw Error("CSV file is too large (max 2 MiB).");
      $("fleetCsv").value = await f.text();
      fleet = null;
      renderFleet(null);
      message("CSV loaded (" + f.name + "). Click Check fleet.");
    } finally {
      $("fleetCsvInput").value = "";
    }
  });
$("fleetCsv").addEventListener("input", () => refreshFleetButtons());
$("exportFleet").onclick = () => run(() => exportFleet(false));
$("exportFleetText").onclick = () => run(() => exportFleet(true));
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

$("dismissOnboarding").onclick = () => {
  $("onboarding").hidden = true;
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
$("deleteSkuPreset").onclick = () => {
  const key = $("skuPreset").value;
  if (!key.startsWith("custom:")) return;
  const name = key.slice(7);
  if (!Object.hasOwn(customSkuPresets, name)) return;
  if (!confirm('Delete custom SKU preset "' + name + '"?')) return;
  const next = cloneCustomSkuPresets(customSkuPresets);
  delete next[name];
  setCustomSkuPresets(next);
  $("skuPreset").value = "";
  updateDeleteSkuPresetButton();
  message('Deleted custom SKU preset "' + name + '".');
};
for (const id of ["recipe", "editRecipe"])
  $(id).onchange = () => {
    if (editorPending) {
      $(id).value = active;
      message("Apply your recipe changes before switching recipes.");
      return;
    }
    active = $(id).value;
    touch();
    renderAll();
    loadEditor();
  };
$("applyRecipe").onclick = () => {
  try {
    applyRecipe();
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
$("deleteRecipe").onclick = () => {
  if (editorPending) {
    message("Apply or discard your recipe changes before deleting.");
    return;
  }
  if (recipes.length <= 1) {
    message("Cannot delete the last recipe.");
    return;
  }
  if (
    !window.confirm(
      'Delete recipe "' +
        current().name +
        '"? This cannot be undone in the browser (Save project first if you need a backup).',
    )
  )
    return;
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
$("discardDraft").onclick = () => {
  if (!editorPending) {
    message("No unapplied draft to discard.");
    return;
  }
  if (!window.confirm("Discard unapplied draft and reload the applied recipe?")) return;
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
$("clearAutosave").onclick = () => {
  let ks = [];
  try {
    ks = switchcardStorageKeys();
  } catch (e) {}
  const nb = listAutosaveBackups().length;
  if (
    !window.confirm(
      "Clear ALL SwitchCard data stored in this browser?\n\n" +
        "Removes " + ks.length + " item(s): current and older autosaves, " + nb + " autosave backup(s), custom SKU presets, theme and tips/pin settings." +
        (nb ? "\n\nTip: Cancel and use Download autosave backup first if you may need a backup." : "") +
        "\n\nIn-memory work stays until you reload.",
    )
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
$("reviewed").onchange = renderPreview;
$("folderInput").onchange = () =>
  run(async () => {
    const model = $("baseModel").value,
      rawVersion = $("baseVersion").value,
      version = sanitizeSingleLine(rawVersion).text.trim();
    $("baseVersion").value = version;
    if (!version)
      throw Error("Enter a firmware / baseline label first, then select the folder again.");
    const selected = [...$("folderInput").files];
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
    const nonAscii = files.filter((f) => /[^\x20-\x7e]/.test(f.path)).length;
    message(
      "Baseline loaded. Verify its file list and model; automatic firmware identification is not included." +
        (compare
          ? compare.same
            ? " Fingerprint matches the project's recorded baseline."
            : " WARNING: fingerprint " + compare.summary + (compare.changed.length ? "; changed: " + compare.changed.slice(0, 5).join(", ") : "") + ". Use the recorded folder, or Save project to record this one."
          : " Fingerprint recorded (" + fingerprint.digest.slice(0, 12) + "…); Save project keeps it.") +
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
  const g = generate(current());
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
  if (g.errors.length || b.length || !$("reviewed").checked)
    throw Error("Complete the checks and review first.");
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
    if (!window.confirm(exportConfirmSummary(r, g))) {
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
$("saveProject").onclick = () => {
  try {
    if (editorPending) {
      if (
        !window.confirm(
          "Unapplied Maintain draft is NOT included in Save project (applied recipes only). Continue download anyway?",
        )
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
      "switchcard-project-" + RELEASE + ".json",
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
$("projectInput").onchange = () =>
  run(async () => {
    const f = $("projectInput").files[0];
    if (!f) return;
    try {
      if (f.size > MAX_PROJECT_BYTES) throw Error("Project file is too large.");
      if (!confirmReplaceUnsavedWork("project")) {
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
      const notes = acceptProject(restoredFile.p, null, restoredFile);
      let msg =
        "Project opened. Reload its baseline folder or open a team package to include firmware.";
      if (restoredFile.draft) msg += " Unapplied Maintain draft restored into the editor; Apply or Discard before export.";
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
      if (!confirmReplaceUnsavedWork("team package")) {
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
      const notes = acceptProject(p, { ...p.baseline, files: baseFiles, fingerprint });
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
function restorePendingDraft(draft) {
  active = draft.recipeId;
  renderAll();
  loadEditor();
  editorPending = true;
  restoreDraftFields(draft);
  $("editRecipe").value = active;
  $("reviewed").checked = false;
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
applyTheme(loadThemePref());
customSkuPresets = loadCustomSkuPresetsFromLocal();
const restored = restoreAutosave();
showOnboarding();
renderAll();
loadEditor();
if (restored && restored.status === "restored") {
  applyRestoredResult(restored, "autosave");
  // One-time legacy import: write the current key now so the old key is never needed again.
  if (restored.key !== AUTOSAVE_KEY) autosave();
} else if (restored) {
  // Never silently discard: explain, keep a backup, and do not overwrite.
  message(
    "Browser autosave was NOT restored: " +
      String(restored.reason).replace(/\.+$/, "") +
      ". " +
      (restored.backedUp
        ? "A copy was kept as an autosave backup (Save your work → Browser autosave → Restore / Download autosave backup)."
        : "The backup copy could not be written, so autosave is paused to avoid overwriting it — use Save project, or Clear browser autosave to resume.") +
      " Showing the example recipes.",
  );
  if (autosavePaused) setAutosaveHint("paused");
}
refreshBackupButtons();
