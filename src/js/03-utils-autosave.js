// --- Utilities ---
function message(t) {
  $("status").textContent = t;
  $("status").hidden = false;
}
function touch() {
  dirty = true;
  $("reviewed").checked = false;
  scheduleAutosave();
}
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  if (autosavePaused) return;
  autosaveTimer = setTimeout(autosave, AUTOSAVE_DEBOUNCE_MS);
}
// Custom SKU presets use null-prototype maps, so user names such as "__proto__" or
// "toString" are ordinary keys and can never reach Object.prototype.
function cloneCustomSkuPresets(src) {
  const out = Object.create(null);
  if (!src || typeof src !== "object" || Array.isArray(src)) return out;
  for (const [k, v] of Object.entries(src)) {
    if (typeof k !== "string" || !k.trim()) continue;
    if (!Array.isArray(v)) continue;
    out[k.trim()] = v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  }
  return out;
}
function normalizeCustomSkuPresets(raw) {
  if (raw === undefined || raw === null) return Object.create(null);
  if (typeof raw !== "object" || Array.isArray(raw))
    throw Error("Invalid customSkuPresets in project.");
  const out = Object.create(null);
  for (const [k, v] of Object.entries(raw)) {
    if (
      typeof k !== "string" ||
      !k.trim() ||
      k.trim().length > CONFIG.MAX_PRESET_NAME_CHARS ||
      singleLineBad(k)
    )
      throw Error("Invalid customSkuPresets name.");
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string"))
      throw Error("Invalid customSkuPresets interfaces.");
    const names = v.map((x) => x.trim()).filter(Boolean);
    if (
      names.some((x) => !/^[A-Za-z][A-Za-z0-9/.:_-]*$/.test(x)) ||
      new Set(names.map((x) => x.toLowerCase())).size !== names.length
    )
      throw Error("Invalid customSkuPresets interface names.");
    out[k.trim()] = names;
  }
  return out;
}
function loadCustomSkuPresetsFromLocal() {
  try {
    const raw = localStorage.getItem(CUSTOM_SKU_PRESETS_KEY);
    if (!raw) return Object.create(null);
    return normalizeCustomSkuPresets(JSON.parse(raw));
  } catch (e) {
    return Object.create(null);
  }
}
function persistCustomSkuPresetsLocal() {
  try {
    localStorage.setItem(
      CUSTOM_SKU_PRESETS_KEY,
      JSON.stringify(cloneCustomSkuPresets(customSkuPresets)),
    );
  } catch (e) {
    /* ignore quota / private mode */
  }
}
function setCustomSkuPresets(next, { touchWorkspace = true } = {}) {
  customSkuPresets = cloneCustomSkuPresets(next);
  persistCustomSkuPresetsLocal();
  renderSkuPresetOptions();
  updateDeleteSkuPresetButton();
  if (touchWorkspace) {
    dirty = true;
    scheduleAutosave();
  }
}
function renderSkuPresetOptions() {
  const sel = $("skuPreset");
  if (!sel) return;
  const prev = sel.value;
  const nodes = [];
  const keep = document.createElement("option");
  keep.value = "";
  keep.textContent = "Custom (keep current)";
  nodes.push(keep);
  for (const group of SKU_PRESET_GROUPS) {
    const og = document.createElement("optgroup");
    og.label = group.label;
    for (const key of group.keys) {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = SKU_PRESET_LABELS[key] || key;
      og.append(o);
    }
    nodes.push(og);
  }
  const customNames = Object.keys(customSkuPresets).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  if (customNames.length) {
    const og = document.createElement("optgroup");
    og.label = "My presets";
    for (const name of customNames) {
      const o = document.createElement("option");
      o.value = "custom:" + name;
      o.textContent = name + " (" + customSkuPresets[name].length + ")";
      og.append(o);
    }
    nodes.push(og);
  }
  sel.replaceChildren(...nodes);
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else sel.value = "";
  updateDeleteSkuPresetButton();
}
function updateDeleteSkuPresetButton() {
  const btn = $("deleteSkuPreset");
  if (!btn) return;
  const key = $("skuPreset") ? $("skuPreset").value : "";
  btn.hidden = !(key && key.startsWith("custom:"));
}
function resolveSkuPreset(key) {
  if (!key) return null;
  if (key.startsWith("custom:")) {
    const name = key.slice(7);
    return Object.hasOwn(customSkuPresets, name) ? customSkuPresets[name] : null;
  }
  return Object.hasOwn(SKU_PRESETS, key) ? SKU_PRESETS[key] : null;
}
function projectPayload() {
  return {
    format: CONFIG.PROJECT_FORMAT,
    version: PROJECT_VERSION,
    active,
    recipes,
    // The loaded baseline's record (with fingerprint), or the record the project was opened with
    // when no folder has been loaded yet, so the expectation survives Save project.
    baseline: baseline ? baselineRecord(baseline) : baselineExpected ? { ...baselineExpected } : null,
    teamHints: Array.isArray(teamHints) ? [...teamHints] : [],
    teamPolicies: Array.isArray(teamPolicies) ? [...teamPolicies] : [],
    customSkuPresets: cloneCustomSkuPresets(customSkuPresets),
  };
}
function collectDraft() {
  if (!editorPending) return null;
  return {
    recipeId: active,
    recipeName: $("recipeName").value,
    recipeModel: $("recipeModel").value,
    firmwareRule: $("firmwareRule").value,
    template: $("template").value,
    interfaces: $("interfaces").value,
    roleAccess: $("roleAccess").value,
    roleTrunk: $("roleTrunk").value,
    roleUnused: $("roleUnused").value,
    roleRouted: $("roleRouted").value,
    mgmtInterface: $("mgmtInterface").value,
    mgmtSources: $("mgmtSources").value,
    exampleFlag: !!$("exampleFlag").checked,
    provenanceComments: !!($("optProvenance") && $("optProvenance").checked),
    defaultInterface: !!($("optDefaultInterface") && $("optDefaultInterface").checked),
    teamHintsDraft: $("teamHintsEditor") ? $("teamHintsEditor").value : "",
    teamPoliciesDraft: $("teamPoliciesEditor") ? $("teamPoliciesEditor").value : "",
  };
}
function setAutosaveHint(kind) {
  const el = $("autosaveHint");
  if (kind === "draft") {
    el.textContent = "Unapplied draft saved locally";
    el.hidden = false;
  } else if (kind === "workspace") {
    el.textContent = "Workspace saved locally";
    el.hidden = false;
  } else if (kind === "fail") {
    el.textContent = "Local save unavailable";
    el.hidden = false;
  } else if (kind === "paused") {
    el.textContent = "Autosave paused (previous autosave kept)";
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}
function autosavePayload() {
  return {
    format: CONFIG.AUTOSAVE_FORMAT,
    release: RELEASE,
    savedAt: new Date().toISOString(),
    project: projectPayload(),
    draft: collectDraft(),
    ...(preservedAutosaveRaw ? { preservedAutosaveRaw } : {}),
    ...(parkedDraft != null ? { parkedDraft } : {}),
  };
}
// Autosave is paused whenever writing would overwrite stored data that has not been backed up
// (e.g. a declined restore whose backup copy could not be written). Nothing is lost silently.
let autosavePaused = false;
// When a restore replaces an autosave that differs from the live workspace, the exact stored
// bytes are carried along here (one level deep) so they are still in the next download.
let preservedAutosaveRaw = null;
// An unapplied draft that could not be put back in the editor (e.g. its recipe no longer
// exists). Kept verbatim in autosave and downloads so it is never thrown away.
let parkedDraft = null;
function parkedDraftNote(result) {
  if (!result || result.parkedDraft == null) return "";
  return " An unapplied Maintain draft" + (result.parkedReason ? " was not loaded because " + result.parkedReason : " from an earlier session is still parked") +
    "; it is kept unchanged as parkedDraft in browser autosave and autosave downloads (re-type it by hand if you need it).";
}
function autosave() {
  if (autosavePaused) {
    setAutosaveHint("paused");
    return;
  }
  try {
    // Finish an interrupted restore (journal in the backup list) before overwriting the current key.
    const pending = localStorage.getItem(CONFIG.AUTOSAVE_BACKUP_KEY);
    if (pending && pending.includes('"restoreTransaction"')) loadAutosaveBackups(true);
    const payload = autosavePayload();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    setAutosaveHint(payload.draft ? "draft" : "workspace");
  } catch (e) {
    setAutosaveHint("fail");
  }
}
function restoreDraftFields(draft) {
  if (!draft || typeof draft !== "object") return false;
  const str = (v) => (typeof v === "string" ? v : "");
  $("recipeName").value = str(draft.recipeName);
  // An unknown model name in a stored draft falls back to the recipe's own model.
  const cur = recipes.find((r) => r.id === active);
  $("recipeModel").value = CONFIG.MODELS.includes(draft.recipeModel)
    ? draft.recipeModel
    : (cur && cur.model) || "IE3100";
  $("firmwareRule").value = str(draft.firmwareRule);
  $("template").value = str(draft.template);
  $("interfaces").value = str(draft.interfaces);
  $("roleAccess").value = str(draft.roleAccess);
  $("roleTrunk").value = str(draft.roleTrunk);
  $("roleUnused").value = str(draft.roleUnused);
  $("roleRouted").value = str(draft.roleRouted);
  // Drafts saved before v0.6.0 have no management fields: keep the recipe's own settings.
  $("mgmtInterface").value = CONFIG.MGMT_INTERFACE_MODES.includes(draft.mgmtInterface)
    ? draft.mgmtInterface
    : mgmtInterfaceMode(cur || {});
  $("mgmtSources").value =
    typeof draft.mgmtSources === "string" ? draft.mgmtSources : mgmtSourcesText(cur || {});
  $("exampleFlag").checked = !!draft.exampleFlag;
  if ($("optProvenance")) $("optProvenance").checked = draft.provenanceComments === true;
  if ($("optDefaultInterface")) $("optDefaultInterface").checked = draft.defaultInterface === true;
  $("skuPreset").value = "";
  if ($("teamHintsEditor") && typeof draft.teamHintsDraft === "string")
    $("teamHintsEditor").value = draft.teamHintsDraft;
  if ($("teamPoliciesEditor") && typeof draft.teamPoliciesDraft === "string")
    $("teamPoliciesEditor").value = draft.teamPoliciesDraft;
  return true;
}
// Cleans a single-line input as you type (pasted zero-width / control characters) and
// optionally trims it. Tells the user when something was removed.
function cleanInput(el, label, trim = false) {
  const c = sanitizeSingleLine(el.value);
  if (trim) c.text = c.text.trim();
  if (c.text !== el.value) {
    el.value = c.text;
    message("Removed invisible/control characters pasted into " + label + "; cleaned spacing is shown in the field.");
  }
  return c.text;
}
function formatSavedAt(iso) {
  const d = new Date(iso);
  return typeof iso === "string" && !isNaN(d) ? d.toLocaleString() : "unknown time";
}
// --- Autosave backups ---
// Up to MAX_AUTOSAVE_BACKUPS entries in ONE localStorage key (newest first), so every change
// is a single atomic setItem. Each entry keeps the exact raw autosave string it replaced.
function backupEntry(raw, from, reason) {
  return { format: "switchcard-autosave-backup", from, reason,
    backedUpAt: new Date().toISOString(), backedUpBy: RELEASE, raw };
}
function quickHash(str) {
  // FNV-1a 32-bit hash + length. Only used to recognise unchanged bytes; not a security hash.
  if (typeof str !== "string") return "none";
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16) + ":" + str.length;
}
function writeAutosaveBackups(entries, recovery = false) {
  if (!Array.isArray(entries) || entries.length > CONFIG.MAX_AUTOSAVE_BACKUPS + (recovery ? 1 : 0))
    throw Error("Invalid autosave backup list.");
  localStorage.setItem(CONFIG.AUTOSAVE_BACKUP_KEY, JSON.stringify(entries));
}
function loadAutosaveBackups(writable = false) {
  const raw = localStorage.getItem(CONFIG.AUTOSAVE_BACKUP_KEY);
  let entries;
  if (raw !== null) {
    entries = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length > CONFIG.MAX_AUTOSAVE_BACKUPS + 1 ||
        entries.some((b) => !b || typeof b.raw !== "string"))
      throw Error("Invalid autosave backup list; stored bytes were kept.");
    // Restore journal: a restore writes the backup list (with restoreTransaction on entry 0),
    // then the current autosave, then the final list. If the page dies in between, the next
    // load finds the journal here and completes or rolls back the restore.
    const txn = entries[0] && entries[0].restoreTransaction;
    if (txn) {
      if (!Array.isArray(txn.previous) || txn.previous.length > CONFIG.MAX_AUTOSAVE_BACKUPS ||
          txn.previous.some((b) => !b || typeof b.raw !== "string") || typeof txn.nextRaw !== "string")
        throw Error("Invalid restore journal; stored bytes were kept.");
      const cur = localStorage.getItem(AUTOSAVE_KEY);
      const committed = cur === txn.nextRaw;
      const head = entries.slice(0, 1).map(({ restoreTransaction, ...b }) => b)[0];
      let resolved = committed
        ? entries.slice(txn.omitHead ? 1 : 0).map(({ restoreTransaction, ...b }) => b)
        : txn.previous;
      // If the current autosave is neither the restored bytes nor the bytes that were
      // there before the restore, another writer replaced it. Keep the pre-restore workspace too
      // (one extra slot is allowed here; the next new backup trims back to the normal limit).
      if (!committed && typeof txn.priorHash === "string" && quickHash(cur) !== txn.priorHash &&
          head && !txn.previous.some((b) => b.raw === head.raw))
        resolved = [head, ...txn.previous];
      try { writeAutosaveBackups(resolved, true); }
      catch (e) {
        autosavePaused = true;
        if (writable) throw Error("An interrupted restore could not be finalized; all recovery copies are kept.");
      }
      return resolved;
    }
    return entries;
  }
  entries = [];
  for (const k of CONFIG.AUTOSAVE_BACKUP_KEYS) {
    const old = localStorage.getItem(k);
    if (old === null) continue;
    let b;
    try { b = JSON.parse(old); } catch (e) {}
    if (!b || typeof b.raw !== "string") b = backupEntry(old, k, "unrecognized legacy backup; raw bytes kept");
    if (!entries.some((x) => x.raw === b.raw)) entries.push(b);
  }
  if (entries.length) {
    try { writeAutosaveBackups(entries); }
    catch (e) { if (writable) throw e; return entries; }
    // Legacy keys are removed only after the complete new list has been written.
    for (const k of CONFIG.AUTOSAVE_BACKUP_KEYS) {
      try { localStorage.removeItem(k); } catch (e) { /* the new list is authoritative either way */ }
    }
  }
  return entries;
}
function backupAutosave(raw, fromKey, reason) {
  try {
    const entries = loadAutosaveBackups(true);
    if (entries.some((b) => b.raw === raw)) return true;
    writeAutosaveBackups([backupEntry(raw, fromKey, reason), ...entries].slice(0, CONFIG.MAX_AUTOSAVE_BACKUPS));
    return true;
  } catch (e) {
    return false;
  }
}
function readAutosaveBackup(slot) {
  try {
    return loadAutosaveBackups()[slot || 0] || null;
  } catch (e) {
    return null;
  }
}
function listAutosaveBackups() {
  try { return loadAutosaveBackups().map((b, slot) => ({ slot, b })); }
  catch (e) { return []; }
}
function selectedBackupSlot() {
  const el = $("backupSlot");
  const n = el ? parseInt(el.value, 10) : 0;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}
function refreshBackupButtons() {
  const list = listAutosaveBackups();
  const any = list.length > 0;
  for (const id of ["restoreBackup", "downloadBackup", "backupSlot"]) if ($(id)) $(id).hidden = !any;
  const sel = $("backupSlot");
  if (sel) {
    const prev = sel.value;
    sel.replaceChildren(
      ...list.map(({ slot, b }) =>
        option(String(slot), (slot === 0 ? "Newest" : "Older " + slot) + " — " + formatSavedAt(b.backedUpAt)),
      ),
    );
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }
  if ($("backupInfo")) {
    $("backupInfo").hidden = !any;
    const b = any ? readAutosaveBackup(selectedBackupSlot()) || list[0].b : null;
    $("backupInfo").textContent = b
      ? list.length + " backup(s) of autosaves that were not restored (up to " +
        CONFIG.MAX_AUTOSAVE_BACKUPS + " kept; new backups replace the oldest, Restore exchanges the selected entry). Selected (" +
        formatSavedAt(b.backedUpAt) + "): " + String(b.reason || "")
      : "";
  }
}
// Returns null (nothing stored) or { status: "restored"|"declined"|"failed", ... }
function restoreAutosave() {
  let raw = null,
    key = AUTOSAVE_KEY;
  try {
    raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw && localStorage.getItem(CONFIG.LEGACY_AUTOSAVE_READ_KEY) !== "1") {
      for (const k of CONFIG.LEGACY_AUTOSAVE_KEYS) {
        const v = localStorage.getItem(k);
        if (v) {
          raw = v;
          key = k;
          break;
        }
      }
      // One-time read: never offered again (a backup copy is kept if it is not restored).
      if (raw) localStorage.setItem(CONFIG.LEGACY_AUTOSAVE_READ_KEY, "1");
    }
  } catch (e) {
    return { status: "failed", reason: "browser storage is not readable", backedUp: false };
  }
  if (!raw) return null;
  return restoreAutosaveRaw(raw, key, { fromBackup: false });
}
function restoreAutosaveRaw(raw, key, opts) {
  const fromBackup = !!(opts && opts.fromBackup);
  const fail = (status, reason) => {
    const backedUp = fromBackup ? true : backupAutosave(raw, key, reason);
    if (!backedUp) autosavePaused = true;
    return { status, reason, key, backedUp, fromBackup };
  };
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return fail("failed", "it is not valid JSON (corrupt or truncated)");
  }
  let parsed;
  try {
    parsed = parseWorkspaceFile(data);
  } catch (e) {
    return fail("failed", "it did not pass validation: " + String((e && e.message) || e));
  }
  const meta = {
    release: data && typeof data.release === "string" ? data.release : "unknown (before 0.5.4)",
    savedAt: data && typeof data.savedAt === "string" ? data.savedAt : "",
    key,
  };
  if (meta.release !== RELEASE) {
    const ok = window.confirm(
      "Found a browser autosave from SwitchCard v" +
        meta.release +
        (meta.savedAt ? ", saved " + formatSavedAt(meta.savedAt) : "") +
        (key !== AUTOSAVE_KEY ? " (older storage key " + key + ")" : "") +
        ".\nThis page is v" +
        RELEASE +
        ".\n\nOK = restore it (fully validated and migrated).\n" +
        (fromBackup ? "Cancel = keep the current workspace, autosave and backup unchanged." : "Cancel = keep a backup copy and start with the example recipes."),
    );
    if (!ok) return fail("declined", "you chose not to restore data saved by v" + meta.release);
  }
  // Ask before dropping port assignments whose interface no longer exists. Cancel keeps the
  // stored autosave intact (backed up; nothing is overwritten).
  if (!confirmAndDropUnmatchedPorts(parsed.p.recipes, "autosave restore"))
    return fail("declined", "unmatched port assignments were not accepted");
  const result = { status: "restored", ...parsed, meta, key, fromBackup,
    migrationNotes: parsed.p._migrationNotes.slice() };
  if (!(opts && opts.prepareOnly)) commitRestoredWorkspace(result);
  return result;
}
// Unwraps any saved workspace (plain project, autosave wrapper or backup envelope) and
// validates it. Shared by boot restore, backup restore and Open project.
function parseWorkspaceFile(data) {
  for (let depth = 0; data && data.format === "switchcard-autosave-backup"; depth++) {
    if (depth >= 3 || typeof data.raw !== "string") throw Error("Invalid autosave backup wrapper.");
    data = JSON.parse(data.raw);
  }
  const wrapped = data && data.format === CONFIG.AUTOSAVE_FORMAT;
  const p = validateProject(wrapped ? data.project : data);
  let draft = wrapped && data.draft != null ? data.draft : null;
  // A draft that cannot be restored must not block the whole workspace.
  // The recipes open; the draft is parked verbatim (kept in autosave + downloads) and reported.
  let parkedDraft = wrapped && data.parkedDraft != null ? data.parkedDraft : null;
  let parkedReason = "";
  if (draft !== null) {
    if (typeof draft !== "object" || Array.isArray(draft) || !p.recipes.some((r) => r.id === draft.recipeId))
      parkedReason = "it does not match any recipe in this workspace";
    else if (["recipeName", "recipeModel", "firmwareRule", "template", "interfaces", "roleAccess", "roleTrunk", "roleUnused", "roleRouted", "mgmtInterface", "mgmtSources", "teamHintsDraft", "teamPoliciesDraft"]
      .some((k) => draft[k] !== undefined && typeof draft[k] !== "string"))
      parkedReason = "it has a field that is not text";
    if (parkedReason) { parkedDraft = draft; draft = null; }
  }
  return { p, draft, parkedDraft, parkedReason,
    preservedAutosaveRaw: wrapped && typeof data.preservedAutosaveRaw === "string" ? data.preservedAutosaveRaw : null };
}
function commitRestoredWorkspace(result) {
  const p = result.p;
  recipes = p.recipes;
  active = recipes.some((r) => r.id === p.active) ? p.active : recipes[0].id;
  baseline = null;
  dirty = false;
  editorPending = false;
  preservedAutosaveRaw = result.preservedAutosaveRaw || null;
  parkedDraft = result.parkedDraft != null ? result.parkedDraft : null;
  teamHints = Array.isArray(p.teamHints) ? [...p.teamHints] : [];
  teamPolicies = Array.isArray(p.teamPolicies) ? [...p.teamPolicies] : [];
  baselineExpected = p.baseline ? { ...p.baseline } : null;
  fleet = null;
  customSkuPresets = Object.assign(
    Object.create(null),
    loadCustomSkuPresetsFromLocal(),
    normalizeCustomSkuPresets(p.customSkuPresets),
  );
  persistCustomSkuPresetsLocal();
}
function stripNestedPreserved(raw) {
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === "object" && typeof o.preservedAutosaveRaw === "string") {
      delete o.preservedAutosaveRaw;
      return JSON.stringify(o);
    }
  } catch (e) {}
  return raw;
}
function restoreSelectedBackup() {
  // Restores the selected backup and keeps the current workspace (with any unapplied draft) as
  // a backup in its place. Order matters: validate and confirm first, then write the backup
  // list, then the current autosave; memory changes only after both writes succeeded.
  // Autosave is paused and any queued write cancelled for the duration.
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  const wasPaused = autosavePaused;
  autosavePaused = true;
  let stage = "validation", entries, result, nextRaw;
  try {
    const slot = selectedBackupSlot();
    entries = loadAutosaveBackups(true);
    const b = entries[slot];
    if (!b) throw Error("No autosave backup found.");
    result = restoreAutosaveRaw(b.raw, b.from || "backup", { fromBackup: true, prepareOnly: true });
    if (result.status !== "restored") throw Error(result.reason);
    if (!confirmReplaceUnsavedWork("autosave backup")) throw Error("you cancelled");
    const stored = localStorage.getItem(AUTOSAVE_KEY);
    const live = autosavePayload();
    // If the stored autosave differs from what is on screen, keep its exact bytes too.
    let same = false;
    try {
      const prior = JSON.parse(stored);
      same = JSON.stringify(prior.project) === JSON.stringify(live.project) &&
        JSON.stringify(prior.draft || null) === JSON.stringify(live.draft || null) &&
        (prior.preservedAutosaveRaw || null) === (live.preservedAutosaveRaw || null);
    } catch (e) {}
    // Keep ONE level only: a nested preservedAutosaveRaw inside the stored bytes is
    // dropped (it is an older workspace already covered by the backup ring), so sizes stay bounded.
    if (stored && !same) live.preservedAutosaveRaw = stripNestedPreserved(stored);
    const { _migrationNotes, ...project } = result.p;
    nextRaw = JSON.stringify({ format: CONFIG.AUTOSAVE_FORMAT, release: RELEASE,
      savedAt: new Date().toISOString(), project, draft: result.draft,
      ...(result.preservedAutosaveRaw ? { preservedAutosaveRaw: stripNestedPreserved(result.preservedAutosaveRaw) } : {}),
      ...(result.parkedDraft != null ? { parkedDraft: result.parkedDraft } : {}) });
    const saved = backupEntry(same ? stored : JSON.stringify(live), AUTOSAVE_KEY, "replaced by restoring an autosave backup (live workspace and draft)");
    // The selected slot becomes current; all other slots survive. The journal lives in the same key.
    const omitHead = saved.raw === b.raw;
    const remaining = entries.filter((x, i) => i !== slot && x.raw !== saved.raw);
    const next = omitHead ? remaining : [saved, ...remaining];
    saved.restoreTransaction = { previous: entries, nextRaw, omitHead, priorHash: quickHash(stored) };
    stage = "preservation";
    writeAutosaveBackups([saved, ...remaining], true); // MUST succeed before memory or current autosave changes.
    stage = "current autosave write";
    localStorage.setItem(AUTOSAVE_KEY, nextRaw);
    stage = "committed";
    // Both sides are now durable. If the cleanup write fails, the journal stays for the next load.
    delete saved.restoreTransaction;
    let finalized = true;
    try { writeAutosaveBackups(next, true); } catch (e) { finalized = false; }
    commitRestoredWorkspace(result);
    renderAll();
    loadEditor();
    applyRestoredResult(result, "autosave backup");
    autosavePaused = !finalized;
    if (!finalized) setAutosaveHint("paused");
    message($("status").textContent +
      (omitHead ? " The selected backup already matched the current workspace; its duplicate slot was removed." : " Current workspace and any unapplied draft were kept in the newest backup.") +
      " The selected entry became the current autosave; other distinct backups were kept." +
      (stored && !same ? " Different prior autosave bytes are included in that download as preservedAutosaveRaw." : "") +
      (finalized ? "" : " Backup cleanup could not be written; recovery journal is kept and autosave is paused. Retry Restore or reload to finalize."));
    refreshBackupButtons();
    return true;
  } catch (e) {
    if (stage === "committed") {
      autosavePaused = true;
      setAutosaveHint("paused");
      message("Restored the backup into the current browser autosave, but the editor could not refresh: " + String(e.message || e) +
        ". The previous workspace and all other backups are kept. Autosave is paused; reload to show the restored workspace.");
      return false;
    }
    // If the second write failed, put the original list back. If rollback also fails,
    // its complete bytes remain in restoreTransaction.previous (readable on next load).
    let rollbackKept = false;
    if (stage === "current autosave write") {
      try { writeAutosaveBackups(entries, true); } catch (rollbackError) { rollbackKept = true; }
    }
    // Validation and preservation failures changed nothing, so the previous pause state is kept.
    autosavePaused = stage === "validation" || stage === "preservation" ? wasPaused : true;
    if (autosavePaused) setAutosaveHint("paused");
    message("Autosave backup was NOT restored (" + stage + "): " + String(e.message || e).replace(/\.+$/, "") +
      ". Current in-memory workspace, draft and stored autosave were kept unchanged. " +
      (rollbackKept ? "All original backups are kept in the recovery journal in browser storage; Download remains available. " : "Original backups were kept. ") +
      (autosavePaused ? "Autosave is paused; Save project or download backups before clearing storage, or retry Restore." : "No pending autosave write remains; the next edit resumes autosave."));
    return false;
  }
}
function showOnboarding() {
  try {
    const dismissed = localStorage.getItem(ONBOARD_KEY) === "1";
    $("onboarding").hidden = dismissed;
  } catch (e) {
    try {
      $("onboarding").hidden = false;
    } catch (e2) {}
  }
}
function showMaintainTabPinned() {
  try {
    return localStorage.getItem(SHOW_MAINTAIN_TAB_KEY) === "1";
  } catch (e) {
    return false;
  }
}
function applyMaintainTabPin() {
  // "Show Maintain tab" preference (SHOW_MAINTAIN_TAB_KEY); hidden by default.
  // With only one tab visible the tab bar is just noise, so it is shown only when pinned.
  const pinned = showMaintainTabPinned();
  const btn = $("maintainTab");
  if (btn) btn.hidden = !pinned;
  if ($("tabs")) $("tabs").hidden = !pinned;
  const box = $("pinMaintainTab");
  if (box) box.checked = pinned;
}
function tab(maintenance) {
  if (!maintenance && editorPending) {
    message("Apply your recipe changes before returning to the card builder.");
    return;
  }
  $("build").hidden = maintenance;
  $("maintain").hidden = !maintenance;
  $("buildTab").classList.toggle("active", !maintenance);
  $("maintainTab").classList.toggle("active", maintenance);
  if (maintenance && !editorPending) loadEditor();
}
function option(v, t) {
  const o = document.createElement("option");
  o.value = v;
  o.textContent = t;
  return o;
}
function keys(t) {
  return [...new Set([...t.matchAll(/{{\s*([A-Z][A-Z0-9_]*)\s*}}/g)].map((m) => m[1]))];
}
// Device fields that will actually be emitted: placeholders in the main template plus
// those in role templates used by at least one port. Unused roles are ignored.
// Management interface used for {{MGMT_INTERFACE}}: "svi" (Vlan<MGMT_VLAN>) or "loopback"
// (Loopback<MGMT_LOOPBACK>). Recipes without the field (older files) are SVI recipes.
function mgmtInterfaceMode(r) {
  return r && CONFIG.MGMT_INTERFACE_MODES.includes(r.mgmtInterface) ? r.mgmtInterface : "svi";
}
// The per-device field that {{MGMT_INTERFACE}} binds in this recipe.
function mgmtImpliedKey(r) {
  return mgmtInterfaceMode(r) === "loopback" ? "MGMT_LOOPBACK" : "MGMT_VLAN";
}
function mgmtSourcesText(r) {
  return r && typeof r.mgmtSources === "string" ? r.mgmtSources : CONFIG.MGMT_SOURCES_DEFAULT;
}
// True when {{MGMT_INTERFACE}} is emitted anywhere: template, a used role, or a used {{MGMT_SOURCES}} block.
function usesMgmtInterface(r) {
  return effectiveTemplateTexts(r).some((t) => keys(t).includes("MGMT_INTERFACE"));
}
function effectiveTemplateTexts(r) {
  const texts = [r.template || ""];
  // {{MGMT_SOURCES}} pulls in the recipe's management source block; its placeholders count too.
  if (keys(r.template || "").includes("MGMT_SOURCES")) texts.push(mgmtSourcesText(r));
  if (keys(r.template || "").includes("PORTS")) {
    const used = new Set();
    if (Array.isArray(r.ports)) {
      for (const p of r.ports) {
        if (p && typeof p.role === "string" && ROLE_NAMES.includes(p.role)) used.add(p.role);
      }
    }
    ensureRoles(r);
    for (const role of used) {
      if (typeof r.roles[role] === "string") texts.push(r.roles[role]);
    }
  }
  return texts;
}
function deviceKeys(r) {
  const skip = ["PORTS", "VLANS", "MGMT_SOURCES", ...CONFIG.RESERVED_VALUE_KEYS];
  const out = new Set();
  for (const k of effectiveTemplateTexts(r).flatMap(keys)) {
    // {{MGMT_INTERFACE}} is derived: it binds MGMT_VLAN (SVI) or MGMT_LOOPBACK (Loopback) instead.
    if (k === "MGMT_INTERFACE") out.add(mgmtImpliedKey(r));
    else if (!skip.includes(k)) out.add(k);
  }
  return [...out];
}
function findPortByName(ports, name) {
  if (!Array.isArray(ports)) return null;
  const exact = ports.find((p) => p && p.name === name);
  if (exact) return exact;
  const lower = String(name || "").toLowerCase();
  const ci = ports.filter((p) => p && typeof p.name === "string" && p.name.toLowerCase() === lower);
  return ci.length === 1 ? ci[0] : null;
}
// Re-matches port assignments to the current interface list by name (case-insensitive when
// unambiguous). opts.allowDrop=true discards unmatched ports (Apply / confirmed load); by default
// they are PRESERVED so opening or rendering never silently loses assignments.
function normalizePorts(r, opts) {
  opts = opts || {};
  const allowDrop = !!opts.allowDrop;
  const oldPorts = Array.isArray(r.ports) ? r.ports.slice() : [];
  const used = new Set();
  const kept = [];
  const added = [];
  const aligned = (r.interfaces || []).map((name, i) => {
    const prev = findPortByName(oldPorts, name);
    if (prev && !used.has(prev)) {
      used.add(prev);
      if (typeof prev.ip !== "string") prev.ip = "";
      if (typeof prev.mask !== "string") prev.mask = "";
      prev.name = name;
      kept.push(name);
      return prev;
    }
    added.push(name);
    return {
      name,
      role: i === 0 ? "trunk" : "unused",
      vlan: "",
      description: i === 0 ? "Uplink" : "",
      ip: "",
      mask: "",
    };
  });
  const orphanPorts = oldPorts.filter((p) => p && !used.has(p));
  const orphanMeta = orphanPorts.map((p) => ({
    name: p.name || "(unnamed)",
    role: typeof p.role === "string" ? p.role : "?",
    vlan: typeof p.vlan === "string" ? p.vlan : "",
    description: typeof p.description === "string" ? p.description : "",
  }));
  if (allowDrop || !orphanPorts.length) {
    r.ports = aligned;
    return { kept, dropped: orphanMeta, added, orphans: [] };
  }
  // Preserve unmatched assignments until the user confirms a drop (Apply / load confirm).
  for (const p of orphanPorts) {
    if (typeof p.ip !== "string") p.ip = "";
    if (typeof p.mask !== "string") p.mask = "";
  }
  r.ports = aligned.concat(orphanPorts);
  return { kept, dropped: [], added, orphans: orphanMeta };
}
function formatPortRemapReport(report) {
  // Prefer a non-empty `dropped`; [] is truthy, so `||` would pick the wrong list.
  const lost =
    report && Array.isArray(report.dropped) && report.dropped.length
      ? report.dropped
      : report && Array.isArray(report.orphans) && report.orphans.length
        ? report.orphans
        : [];
  if (!lost.length) return "";
  const label =
    report.dropped && report.dropped.length ? "Dropped" : "Unmatched (preserved)";
  return (
    label +
    " port assignments (no matching interface name): " +
    lost
      .map((d) => {
        let s = d.name + " (" + d.role;
        if (d.vlan) s += ", vlan " + d.vlan;
        if (d.description) s += ", " + d.description;
        return s + ")";
      })
      .join(", ") +
    "."
  );
}
function portRemapProbe(r) {
  const probe = {
    interfaces: Array.isArray(r.interfaces) ? r.interfaces.slice() : [],
    ports: Array.isArray(r.ports) ? r.ports.map((p) => ({ ...p })) : [],
  };
  return normalizePorts(probe, { allowDrop: true });
}
function collectRecipePortDropLines(recipeList) {
  const lines = [];
  for (const r of recipeList || []) {
    const report = portRemapProbe(r);
    if (!report.dropped.length) continue;
    const who = (r && r.name) || "(unnamed recipe)";
    lines.push(
      who +
        ": " +
        report.dropped
          .map((d) => d.name + " (" + d.role + ")")
          .join(", "),
    );
  }
  return lines;
}
// Confirms before permanently dropping unmatched ports on load/restore. Returns false if cancelled.
function confirmAndDropUnmatchedPorts(recipeList, actionLabel) {
  const lines = collectRecipePortDropLines(recipeList);
  if (!lines.length) {
    for (const r of recipeList || []) normalizePorts(r, { allowDrop: true });
    return true;
  }
  const msg =
    "Unmatched port assignments would be dropped (" +
    (actionLabel || "load") +
    "):\n\n" +
    lines.join("\n") +
    "\n\nSurvivors keep roles by interface name; new interfaces get defaults. " +
    "Cancel keeps the previous workspace / skips restore.";
  if (!window.confirm(msg)) return false;
  for (const r of recipeList || []) normalizePorts(r, { allowDrop: true });
  return true;
}
function ensureRoles(r) {
  if (!r.roles) r.roles = {};
  for (const k of ROLE_NAMES) {
    if (typeof r.roles[k] !== "string") r.roles[k] = ROLES[k];
  }
  // Management-interface choice and {{MGMT_SOURCES}} block (v0.6.0). Older files get the defaults,
  // which leave their output unchanged: neither placeholder appears in an older template.
  if (!CONFIG.MGMT_INTERFACE_MODES.includes(r.mgmtInterface)) r.mgmtInterface = "svi";
  if (typeof r.mgmtSources !== "string") r.mgmtSources = CONFIG.MGMT_SOURCES_DEFAULT;
  // Export history per hostname (v0.7.0): the last exported text, for the "changes since" view.
  if (!r.exports || typeof r.exports !== "object" || Array.isArray(r.exports)) r.exports = {};
  return r;
}
