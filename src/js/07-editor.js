// --- Preview, Maintain editor, Apply, New switch ---
// Export blockers (separate from generate errors): unapplied draft, example recipe,
// missing baseline, or a baseline whose model / label this recipe does not allow.
function blockers(r, g) {
  const a = [];
  if (editorPending)
    a.push("Apply recipe changes or Discard unapplied draft first.");
  if (r.example)
    a.push("Example recipe: open Manage recipes & baseline, uncheck “Example recipe…”, then Apply recipe changes.");
  if (!baseline) a.push("Load a firmware baseline to export a complete card.");
  else {
    if (baseline.model !== r.model) a.push("Baseline model does not match this recipe.");
    if (r.firmware.length && !r.firmware.includes(baseline.version))
      a.push("Baseline label is not allowed by this recipe.");
  }
  // Team policy rules (v0.7.0) are evaluated on the generated text and can only block.
  if (g && !g.errors.length) for (const v of policyViolations(g.text, teamPolicies)) a.push("Team policy: " + v);
  return a;
}

function renderPreview() {
  const r = current(),
    g = generate(r),
    b = blockers(r, g);
  $("preview").textContent = g.text;
  const meter = $("previewMeter");
  if (meter) meter.textContent = previewSizeLabel(g.text);
  // Status above the preview: at most one red box (errors) and one box for the result
  // (yellow with the notes to review, or green when there is nothing to review). Export
  // blockers are listed only under the Export button (#exportWhy), not repeated here.
  $("checks").replaceChildren();
  const notices = (g.warnings || []).map((w) => {
    const t = w.replace(/^Soft:\s*/, "");
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
  if (g.errors.length)
    $("checks").append(statusNotice("error",
      g.errors.length === 1 ? "1 error blocks export" : g.errors.length + " errors block export", g.errors));
  const policyHits = g.errors.length ? [] : policyViolations(g.text, teamPolicies);
  if (policyHits.length)
    $("checks").append(statusNotice("error",
      policyHits.length === 1 ? "1 team policy rule blocks export" : policyHits.length + " team policy rules block export", policyHits,
      "Rules are edited under Team security hints in Manage recipes & baseline."));
  if (!g.errors.length || notices.length) {
    const count = notices.length === 1 ? "1 note to review" : notices.length + " notes to review";
    const head = g.errors.length
      ? count
      : notices.length
        ? "Checks passed · " + count
        : b.length
          ? "Checks passed. Export is still blocked; see under the Export button."
          : "Checks passed.";
    $("checks").append(statusNotice(notices.length ? "warning" : "ok", head, notices,
      "Cisco syntax and device behavior are not verified."));
  }
  const sh = $("securityHints");
  if (sh) {
    sh.replaceChildren();
    // Team hints always (useful even when preview has errors)
    for (const tip of teamHints) {
      const el = document.createElement("div");
      el.className = "hint";
      const lab = document.createElement("strong");
      lab.className = "team-label";
      lab.textContent = "Team";
      el.append(lab, document.createTextNode(" — " + tip));
      sh.append(el);
    }
  }
  // Preview and export use the APPLIED recipe only. An unapplied Maintain draft disables the
  // file downloads (the card ZIP via blockers()); Copy preview only needs a clean generate().
  $("downloadConfig").disabled = busy || editorPending || !!g.errors.length || !!policyHits.length;
  $("copyPreview").disabled = busy || !!g.errors.length;
  $("downloadCard").disabled =
    busy || !!g.errors.length || !!b.length || !$("reviewed").checked;
  $("savePackage").disabled = busy || editorPending || !baseline;
  const why = [];
  if (editorPending)
    why.push("Apply recipe changes or Discard unapplied draft first.");
  if (g.errors.length) why.push("Fix red input errors first.");
  if (b.length) why.push(...b.filter((x) => !why.includes(x)));
  if (!g.errors.length && !b.length && !$("reviewed").checked)
    why.push("Check “I reviewed this configuration…” above.");
  const ew = $("exportWhy");
  if (ew) {
    ew.textContent = $("downloadCard").disabled
      ? why.length
        ? "Export blocked: " + why.join(" · ")
        : "Export unavailable."
      : "Ready to export.";
    ew.style.color = $("downloadCard").disabled ? "var(--warn)" : "var(--ok,#3dd68c)";
  }
  $("downloadCard").title = $("downloadCard").disabled
    ? why.join(" ") || "Export blocked"
    : "Download ZIP for the SD card root";
  $("downloadConfig").title = $("downloadConfig").disabled
    ? editorPending
      ? "Apply recipe changes or Discard unapplied draft first."
      : "Fix validation errors first."
    : "Download preview as editcontent.txt";
  updateDiscardButton();
  // v0.7.0 panels: transliteration offer, changes since the last export, fleet gates.
  const fix = $("asciiFix");
  if (fix) fix.hidden = !g.asciiIssue;
  renderDiffPanel(r, g);
  refreshFleetButtons();
  renderFleetColumns();
}
// One status box: a bold heading, an optional list of items and an optional muted footer.
function statusNotice(kind, heading, items, footer) {
  const el = document.createElement("div");
  el.className = "notice " + kind;
  const h = document.createElement("strong");
  h.className = "notice-head";
  h.textContent = heading;
  el.append(h);
  if (items && items.length) {
    const ul = document.createElement("ul");
    for (const t of items) {
      const li = document.createElement("li");
      li.textContent = t;
      ul.append(li, document.createTextNode(" "));
    }
    el.append(" ", ul);
  }
  if (footer) {
    const f = document.createElement("span");
    f.className = "notice-foot";
    f.textContent = " " + footer;
    el.append(f);
  }
  return el;
}
function updateDiscardButton() {
  const btn = $("discardDraft");
  if (btn) btn.hidden = !editorPending;
}
function loadEditor() {
  const r = current();
  ensureRoles(r);
  $("editRecipe").value = active;
  $("recipeName").value = r.name;
  $("recipeModel").value = r.model;
  $("firmwareRule").value = r.firmware.join("\n");
  $("template").value = r.template;
  $("skuPreset").value = "";
  $("interfaces").value = r.interfaces.join("\n");
  $("roleAccess").value = r.roles.access;
  $("roleTrunk").value = r.roles.trunk;
  $("roleUnused").value = r.roles.unused;
  $("roleRouted").value = r.roles.routed;
  $("mgmtInterface").value = mgmtInterfaceMode(r);
  $("mgmtSources").value = mgmtSourcesText(r);
  $("exampleFlag").checked = r.example;
  if ($("optProvenance")) $("optProvenance").checked = r.provenanceComments === true;
  if ($("optDefaultInterface")) $("optDefaultInterface").checked = r.defaultInterface === true;
  if (baseline) {
    $("baseModel").value = baseline.model;
    $("baseVersion").value = baseline.version;
  }
  if ($("teamHintsEditor")) $("teamHintsEditor").value = teamHints.join("\n");
  if ($("teamPoliciesEditor")) $("teamPoliciesEditor").value = teamPolicies.join("\n");
}
function lines(s) {
  return s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}
function applyRecipe() {
  const r = current(),
    names = lines($("interfaces").value),
    template = $("template").value,
    roles = {
      access: $("roleAccess").value,
      trunk: $("roleTrunk").value,
      unused: $("roleUnused").value,
      routed: $("roleRouted").value,
    },
    mgmtInterface = $("mgmtInterface").value,
    mgmtSources = $("mgmtSources").value,
    wasExample = !!r.example;
  if (!$("recipeName").value.trim()) throw Error("Enter a recipe name.");
  // Validate the CLEANED name, so an all-invisible name gets the specific message
  // and pasted invisible characters are cleaned (as announced) rather than refused.
  const nameForCheck = sanitizeSingleLine($("recipeName").value).text.trim();
  if (!nameForCheck) throw Error("Enter a recipe name after removing invisible characters.");
  // Recipe name and model are validated on Apply.
  if (
    nameForCheck.length > CONFIG.MAX_RECIPE_NAME_CHARS ||
    singleLineBad(nameForCheck)
  )
    throw Error(
      "Recipe name must be at most " + CONFIG.MAX_RECIPE_NAME_CHARS + " characters with no control characters.",
    );
  if (!CONFIG.MODELS.includes($("recipeModel").value))
    throw Error("Choose a model (IE3100, IE3x00 or IE9300).");
  if (!template.trim()) throw Error("Template cannot be empty.");
  if (template.length > MAX_TEMPLATE_CHARS)
    throw Error(
      "Template exceeds " + MAX_TEMPLATE_CHARS + " characters (got " + template.length + ").",
    );
  for (const k of ROLE_NAMES) {
    if ((roles[k] || "").length > MAX_ROLE_CHARS)
      throw Error(
        "Role template '" +
          k +
          "' exceeds " +
          MAX_ROLE_CHARS +
          " characters.",
      );
  }
  if (!CONFIG.MGMT_INTERFACE_MODES.includes(mgmtInterface))
    throw Error("Choose a management interface type (SVI or Loopback).");
  if (mgmtSources.length > MAX_ROLE_CHARS)
    throw Error("Management source commands exceed " + MAX_ROLE_CHARS + " characters.");
  if (names.length > MAX_INTERFACES)
    throw Error(
      "Interface list exceeds " +
        MAX_INTERFACES +
        " names (got " +
        names.length +
        ").",
    );
  if (
    new Set(names.map((x) => x.toLowerCase())).size !== names.length ||
    names.some((x) => !/^[A-Za-z][A-Za-z0-9/.:_-]*$/.test(x))
  )
    throw Error(
      "Interface names must be unique, start with a letter and contain no spaces or commands.",
    );
  // Invisible characters pasted into template / roles / firmware labels
  const textIssue = recipeTextIssue({
    template,
    roles,
    mgmtSources,
    values: {},
    firmware: lines($("firmwareRule").value),
    ports: [],
  });
  if (textIssue) throw Error("Not applied — " + textIssue);
  // Preview remap against proposed interface list before mutating the recipe.
  const probe = {
    interfaces: names,
    ports: Array.isArray(r.ports) ? r.ports.map((p) => ({ ...p })) : [],
  };
  const remapPreview = normalizePorts(probe, { allowDrop: true });
  const dropMsg = formatPortRemapReport(remapPreview);
  if (dropMsg) {
    if (
      !window.confirm(
        dropMsg +
          "\n\nContinue Apply? Surviving ports keep their roles by name; new ports get defaults (first=Trunk).",
      )
    )
      throw Error("Apply cancelled — interface list not changed.");
  }
  const cleanName = sanitizeSingleLine($("recipeName").value).text.trim();
  if (!cleanName) throw Error("Enter a recipe name after removing invisible characters.");
  const cleanFirmware = lines($("firmwareRule").value).map((f) => sanitizeSingleLine(f).text.trim()).filter(Boolean);
  const cleaned = [];
  if (cleanName !== $("recipeName").value) cleaned.push("recipe name");
  if (cleanFirmware.join("\n") !== $("firmwareRule").value) cleaned.push("firmware labels");
  Object.assign(r, {
    name: cleanName,
    model: $("recipeModel").value,
    firmware: cleanFirmware,
    template,
    interfaces: names,
    roles,
    mgmtInterface,
    mgmtSources,
    example: $("exampleFlag").checked,
    provenanceComments: !!($("optProvenance") && $("optProvenance").checked),
    defaultInterface: !!($("optDefaultInterface") && $("optDefaultInterface").checked),
  });
  // Keep port roles by interface name even if a later path skips renderFields.
  const remap = normalizePorts(r, { allowDrop: true });
  if (r.ports.length > MAX_PORTS)
    throw Error(
      "Port table exceeds " + MAX_PORTS + " entries after interface remap.",
    );
  editorPending = false;
  touch();
  renderAll();
  loadEditor(); // Show exactly the cleaned values that were applied.
  let msg =
    "Recipe applied. Port table remapped to " +
    r.interfaces.length +
    " interface" +
    (r.interfaces.length === 1 ? "" : "s") +
    " (kept " +
    remap.kept.length +
    " by name";
  if (remap.dropped.length)
    msg += "; dropped " + remap.dropped.map((d) => d.name).join(", ");
  if (remap.added.length) msg += "; added " + remap.added.length + " new";
  msg += ").";
  if (cleaned.length) msg += " Cleaned " + cleaned.join(" and ") + "; updated values are shown in the editor.";
  if (wasExample && !r.example)
    msg += " Example flag cleared — Save project to keep this durable.";
  else msg += " Save a project or team package to keep your changes.";
  message(msg);
}
// New switch uses a keep-list, not a clear-list: only these site-wide values survive;
// every other value (HOSTNAME, MGMT_IP, custom {{NTP_SERVER}}, serials...)
// is treated as per-device and cleared. Port roles, VLANs and descriptions are kept.
const NEW_SWITCH_KEEP_KEYS = ["MGMT_MASK", "MGMT_VLAN", "MGMT_LOOPBACK", "GATEWAY", "SITE"];
function newSwitch() {
  const r = current();
  ensureRoles(r);
  normalizePorts(r);
  const cleared = [];
  for (const k of Object.keys(r.values))
    if (!NEW_SWITCH_KEEP_KEYS.includes(k) && r.values[k] !== "") {
      r.values[k] = "";
      cleared.push(k);
    }
  let routedCleared = 0;
  for (const p of r.ports) {
    if ((p.ip || "") !== "" || (p.mask || "") !== "") routedCleared++;
    p.ip = "";
    p.mask = "";
  }
  $("reviewed").checked = false;
  touch();
  renderAll();
  const kept = NEW_SWITCH_KEEP_KEYS.filter((k) => (r.values[k] || "") !== "");
  message(
    "New switch: cleared " +
      (cleared.length ? cleared.join(", ") : "no per-device values (already empty)") +
      (routedCleared ? " and routed IP/mask on " + routedCleared + " port(s)" : "") +
      ". Kept site-wide " + (kept.length ? kept.join(", ") : "values (none set)") +
      ", port roles, VLANs and descriptions — review them before export.",
  );
}
