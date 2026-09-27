// --- Persistence (project / package / autosave) ---
function project() {
  return projectPayload();
}
// Structural migrations always run. Legacy CLI rewrites only for project schema v1/v2.
// Current-format (v3+) loads are lossless: templates and roles are never rewritten.
function migrateRecipe(r, opts) {
  opts = opts || {};
  const notes = opts.notes || null;
  const allowLegacyCli = !!opts.allowLegacyCli;
  if (r && r.model === "IE3400") {
    r.model = "IE3x00";
    if (notes) notes.push('Model "IE3400" renamed to "IE3x00".');
  }
  // v0.6.0 fields: an unknown value is reset with a note rather than refusing the workspace.
  if (r && r.mgmtInterface !== undefined && !CONFIG.MGMT_INTERFACE_MODES.includes(r.mgmtInterface)) {
    if (notes) notes.push('Unknown management interface type "' + commentSafe(String(r.mgmtInterface), 20) + '" reset to SVI.');
    delete r.mgmtInterface;
  }
  if (r && r.mgmtSources !== undefined && typeof r.mgmtSources !== "string") {
    if (notes) notes.push("Invalid management source commands replaced with the default block.");
    delete r.mgmtSources;
  }
  ensureRoles(r);
  if (allowLegacyCli) {
    const legacyAccess =
      "interface {{INTERFACE}}\n description {{DESCRIPTION}}\n switchport mode access\n switchport access vlan {{VLAN}}\n no shutdown\n!";
    const legacyTrunk =
      "interface {{INTERFACE}}\n description {{DESCRIPTION}}\n switchport mode trunk\n switchport trunk allowed vlan {{VLAN}}\n no shutdown\n!";
    if (r.roles && r.roles.access === legacyAccess) {
      r.roles.access = ROLES.access;
      if (notes)
        notes.push(
          "Legacy Access role template updated (added spanning-tree portfast + bpduguard).",
        );
    }
    if (r.roles && r.roles.trunk === legacyTrunk) {
      r.roles.trunk = ROLES.trunk;
      if (notes)
        notes.push(
          "Legacy Trunk role template updated (removed switchport trunk allowed vlan).",
        );
    }
    if (
      typeof r.template === "string" &&
      !r.template.includes("{{VLANS}}")
    ) {
      // Whole-line "vlan {{MGMT_VLAN}}" only, never a substring (so "no vlan ..." is untouched).
      const vlanLine = /^[ \t]*vlan \{\{MGMT_VLAN\}\}[ \t]*$/m;
      if (vlanLine.test(r.template)) {
        r.template = r.template.replace(vlanLine, "{{VLANS}}");
        if (notes)
          notes.push(
            "Replaced whole-line vlan {{MGMT_VLAN}} with {{VLANS}} (legacy schema).",
          );
      }
    }
  }
  if (Array.isArray(r.ports)) {
    for (const p of r.ports) {
      // Do NOT coerce unknown roles to "unused"; validateProject rejects them instead.
      if (p && typeof p.ip !== "string") p.ip = "";
      if (p && typeof p.mask !== "string") p.mask = "";
    }
  }
  return r;
}
// Shared check for project open, team package, autosave restore and Apply.
// Templates/roles may contain LF, CRLF and tab; single-line fields may not.
function recipeTextIssue(r) {
  // Templates / role templates: hard refusal (multi-line command injection risk).
  let hit = findInvisibleChar(r.template);
  if (hit) return invisibleCharMessage("template", hit);
  for (const k of ROLE_NAMES) {
    hit = findInvisibleChar((r.roles && r.roles[k]) || "");
    if (hit) return invisibleCharMessage(k + " role template", hit);
  }
  hit = findInvisibleChar(typeof r.mgmtSources === "string" ? r.mgmtSources : "");
  if (hit) return invisibleCharMessage("management source commands", hit);
  return "";
}
// Single-line fields are cleaned with a note instead of refusing the
// whole workspace (a pasted zero-width character must never brick autosave / backups).
function sanitizeRecipeFields(r, notes, rname) {
  const fix = (label, v, trim = false) => {
    const c = sanitizeSingleLine(v);
    if (trim) c.text = c.text.trim();
    if (c.text !== v) notes.push(rname + ": removed invisible/control characters or surrounding spaces from " + label + ".");
    return c.text;
  };
  const nm = fix("the recipe name", r.name).trim();
  if (nm.length > CONFIG.MAX_RECIPE_NAME_CHARS) {
    notes.push(rname + ": recipe name shortened to " + CONFIG.MAX_RECIPE_NAME_CHARS + " characters.");
    r.name = nm.slice(0, CONFIG.MAX_RECIPE_NAME_CHARS);
  } else if (!nm) {
    notes.push(rname + ": empty recipe name replaced with \"Recipe\".");
    r.name = "Recipe";
  } else r.name = nm;
  for (const k of Object.keys(r.values)) r.values[k] = fix("value " + k, r.values[k], true); // every value is trimmed
  r.firmware = r.firmware.map((f) => fix("a firmware label", f, true));
  for (const x of r.ports) {
    x.description = fix("port " + x.name + " description", x.description);
    if (typeof x.ip === "string") x.ip = fix("port " + x.name + " IP", x.ip, true);
    if (typeof x.mask === "string") x.mask = fix("port " + x.name + " mask", x.mask, true);
    x.vlan = fix("port " + x.name + " VLAN", x.vlan, true);
    if (x.role === "trunk") x.vlan = normalizeTrunkVlanList(x.vlan);
    if (x.role === "access") x.vlan = normalizeVlanId(x.vlan);
  }
}
function validateProject(p) {
  if (
    !p ||
    p.format !== CONFIG.PROJECT_FORMAT ||
    ![1, 2, 3, 4].includes(p.version) ||
    !Array.isArray(p.recipes) ||
    !p.recipes.length ||
    p.recipes.length > MAX_RECIPES
  )
    throw Error("Not a supported SwitchCard project.");
  const migrationNotes = [];
  const allowLegacyCli = p.version === 1 || p.version === 2;
  for (const r of p.recipes) {
    if (!r || typeof r !== "object")
      throw Error("The project contains an invalid recipe.");
    migrateRecipe(r, { allowLegacyCli, notes: migrationNotes });
  }
  if (p.baseline && p.baseline.model === "IE3400") {
    p.baseline.model = "IE3x00";
    migrationNotes.push('Baseline model "IE3400" renamed to "IE3x00".');
  }
  p._migrationNotes = migrationNotes;
  const ids = new Set();
  for (const r of p.recipes) {
    if (
      !r ||
      typeof r.id !== "string" ||
      ids.has(r.id) ||
      typeof r.name !== "string" ||
      !CONFIG.MODELS.includes(r.model) ||
      typeof r.template !== "string" ||
      typeof r.example !== "boolean" ||
      !Array.isArray(r.firmware) ||
      !r.firmware.every((x) => typeof x === "string") ||
      !Array.isArray(r.interfaces) ||
      !r.interfaces.every(
        (x) => typeof x === "string" && /^[A-Za-z][A-Za-z0-9/.:_-]*$/.test(x),
      ) ||
      new Set(r.interfaces.map((x) => x.toLowerCase())).size !== r.interfaces.length ||
      !r.roles ||
      !ROLE_NAMES.every((k) => typeof r.roles[k] === "string") ||
      !r.values ||
      typeof r.values !== "object" ||
      Array.isArray(r.values) ||
      !Object.values(r.values).every((x) => typeof x === "string") ||
      !Array.isArray(r.ports) ||
      !r.ports.every(
        (x) =>
          x &&
          typeof x.name === "string" &&
          ROLE_NAMES.includes(x.role) &&
          typeof x.vlan === "string" &&
          typeof x.description === "string" &&
          (x.ip === undefined || typeof x.ip === "string") &&
          (x.mask === undefined || typeof x.mask === "string"),
      )
    )
      throw Error("The project contains an invalid recipe.");
    // Reject control characters (CR/LF/tab) in saved port VLANs; normalize
    // valid trunk lists to canonical comma-joined form. Applies to project open,
    // team package import and autosave restore (all go through validateProject).
    for (const x of r.ports) {
      if (hasVlanControlChars(x.vlan))
        throw Error(
          "Port " +
            x.name +
            ": saved VLAN contains control characters (line breaks/tabs). Fix the file and reload.",
        );
      if (x.role === "trunk") x.vlan = normalizeTrunkVlanList(x.vlan);
      // canonical access VLAN ("007 " -> "7")
      if (x.role === "access") x.vlan = normalizeVlanId(x.vlan);
    }
    // Invisible characters, reserved value keys, name limits.
    if (
      (r.provenanceComments !== undefined && typeof r.provenanceComments !== "boolean") ||
      (r.defaultInterface !== undefined && typeof r.defaultInterface !== "boolean")
    )
      throw Error("The project contains an invalid recipe option.");
    const rname = 'Recipe "' + commentSafe(r.name, 60) + '"';
    for (const k of [...CONFIG.RESERVED_VALUE_KEYS, ...CONFIG.DERIVED_KEYS]) {
      if (!Object.hasOwn(r.values, k)) continue;
      // Never refuse the workspace for these; drop them (generate ignores them anyway).
      migrationNotes.push(
        rname + ": dropped " + (r.values[k] !== "" ? "non-empty " : "empty ") + "reserved value key {{" + k + "}} (SwitchCard fills this placeholder itself; it cannot be a recipe value).",
      );
      delete r.values[k];
    }
    const textIssue = recipeTextIssue(r);
    if (textIssue) throw Error(rname + ": " + textIssue + " Fix the file and reload.");
    sanitizeRecipeFields(r, migrationNotes, rname);
    // Reject duplicate / case-ambiguous saved port names.
    const portNames = r.ports.map((x) => String(x.name || "").toLowerCase());
    if (new Set(portNames).size !== portNames.length)
      throw Error(
        "The project contains duplicate port names in a recipe (case-insensitive).",
      );
    if (r.template.length > MAX_TEMPLATE_CHARS)
      throw Error("A recipe template exceeds the size limit (" + MAX_TEMPLATE_CHARS + " chars).");
    if (r.interfaces.length > MAX_INTERFACES)
      throw Error("A recipe has too many interfaces (max " + MAX_INTERFACES + ").");
    if (r.ports.length > MAX_PORTS)
      throw Error("A recipe has too many ports (max " + MAX_PORTS + ").");
    for (const k of ROLE_NAMES) {
      if ((r.roles[k] || "").length > MAX_ROLE_CHARS)
        throw Error(
          "A role template exceeds the size limit (" + MAX_ROLE_CHARS + " chars).",
        );
    }
    if (r.mgmtSources.length > MAX_ROLE_CHARS)
      throw Error(
        "A management source block exceeds the size limit (" + MAX_ROLE_CHARS + " chars).",
      );
    ids.add(r.id);
  }
  if (
    p.baseline &&
    (!CONFIG.MODELS.includes(p.baseline.model) ||
      typeof p.baseline.version !== "string" ||
      !p.baseline.version.trim())
  )
    throw Error("Invalid baseline metadata.");
  if (p.baseline) {
    const cleaned = sanitizeSingleLine(p.baseline.version).text.trim();
    if (!cleaned) throw Error("Invalid baseline metadata: label is empty after cleanup.");
    if (cleaned !== p.baseline.version) migrationNotes.push("Baseline label cleaned; removed invisible/control characters or surrounding spaces.");
    p.baseline.version = cleaned;
  }
  // teamHints is optional (older files): missing -> []
  if (p.teamHints === undefined || p.teamHints === null) {
    p.teamHints = [];
  } else if (typeof p.teamHints === "string") {
    p.teamHints = p.teamHints
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  } else if (
    !Array.isArray(p.teamHints) ||
    !p.teamHints.every((x) => typeof x === "string")
  ) {
    throw Error("Invalid teamHints in project.");
  } else {
    p.teamHints = p.teamHints.map((x) => x.trim()).filter(Boolean);
  }
  // Team hints are bounded, and cleaned/trimmed with a note rather than refused.
  const cleanHints = p.teamHints
    .map((h) => sanitizeSingleLine(h).text.trim())
    .filter(Boolean)
    .map((h) => h.slice(0, CONFIG.MAX_TEAM_HINT_CHARS));
  if (
    cleanHints.length > CONFIG.MAX_TEAM_HINTS ||
    cleanHints.length !== p.teamHints.length ||
    cleanHints.some((h, i) => h !== p.teamHints[i])
  )
    migrationNotes.push(
      "Team hints cleaned (max " + CONFIG.MAX_TEAM_HINTS + " lines × " + CONFIG.MAX_TEAM_HINT_CHARS + " characters, no control characters)" +
        (cleanHints.length > CONFIG.MAX_TEAM_HINTS ? "; kept the first " + CONFIG.MAX_TEAM_HINTS + " of " + cleanHints.length : "") + ".",
    );
  p.teamHints = cleanHints.slice(0, CONFIG.MAX_TEAM_HINTS);
  // customSkuPresets is optional: missing -> {}
  if (p.customSkuPresets === undefined || p.customSkuPresets === null) {
    p.customSkuPresets = Object.create(null);
  } else {
    p.customSkuPresets = normalizeCustomSkuPresets(p.customSkuPresets);
  }
  return p;
}
function acceptProject(p, b, restoredFile = null) {
  // Caller must validateProject first. Do not re-validate here — a second pass
  // would clear _migrationNotes after legacy CLI was already migrated.
  const notes = Array.isArray(p._migrationNotes) ? p._migrationNotes.slice() : [];
  // Never silently drop unmatched ports on open/package load.
  if (!confirmAndDropUnmatchedPorts(p.recipes, "open"))
    throw Error("Open cancelled — unmatched port assignments were not accepted.");
  recipes = p.recipes;
  active = recipes.some((r) => r.id === p.active) ? p.active : recipes[0].id;
  baseline = b;
  dirty = false;
  editorPending = false;
  preservedAutosaveRaw = restoredFile && restoredFile.preservedAutosaveRaw || null;
  parkedDraft = restoredFile && restoredFile.parkedDraft != null ? restoredFile.parkedDraft : null;
  teamHints = Array.isArray(p.teamHints) ? [...p.teamHints] : [];
  customSkuPresets = normalizeCustomSkuPresets(p.customSkuPresets);
  persistCustomSkuPresetsLocal();
  $("reviewed").checked = false;
  renderAll();
  loadEditor();
  tab(false);
  if (restoredFile && restoredFile.draft) restorePendingDraft(restoredFile.draft);
  scheduleAutosave();
  return notes;
}
function confirmReplaceUnsavedWork(kind) {
  if (!(dirty || editorPending)) return true;
  return window.confirm(
    "You have unsaved changes" +
      (editorPending ? " (including an unapplied Maintain draft)" : "") +
      ". Opening this " +
      (kind || "file") +
      " will replace the current workspace. Continue?",
  );
}
function assertProjectSaveSize(payload) {
  const json = JSON.stringify(payload);
  const bytes = enc.encode(json).length;
  if (bytes > MAX_PROJECT_BYTES)
    throw Error(
      "Project is too large to save (" +
        bytes +
        " bytes; max " +
        MAX_PROJECT_BYTES +
        "). Reduce recipes/templates before saving.",
    );
  return json;
}
function download(blob, name) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), OBJECT_URL_REVOKE_MS);
}
