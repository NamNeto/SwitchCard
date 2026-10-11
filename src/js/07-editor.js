// --- Preview, Maintain editor, Apply, New switch ---
// Export blockers (separate from generate errors): unapplied draft, example recipe,
// missing baseline, or a baseline whose model / label this recipe does not allow.
// opts.textOnly: a text-only write (Save text only, the Cards Text-only ZIP) writes no baseline
// files, so the baseline gates do not apply to it (operator round 7); the others all do.
function blockers(r, g, opts) {
  const a = [];
  if (editorPending)
    a.push("Apply recipe changes or Discard unapplied draft first.");
  if (r.example)
    a.push("Example recipe: open Manage recipes & baseline, uncheck “Example recipe…”, then Apply recipe changes.");
  if (opts && opts.textOnly) {
    // no baseline gates
  } else if (!baseline) a.push("Load a firmware baseline to export a complete card.");
  else {
    if (baseline.model !== r.model) a.push("Baseline model does not match this recipe.");
    if (r.firmware.length && !r.firmware.includes(baseline.version))
      a.push("Baseline label is not allowed by this recipe.");
  }
  // Team policy rules (v0.7.0) are evaluated on the generated text and can only block.
  if (g && !g.errors.length) for (const v of policyViolations(g.text, teamPolicies)) a.push("Team policy: " + v);
  return a;
}
// Short, actionable labels for the export gate (what is wrong and what to do); the full
// sentence stays as the item's title. Team-policy and "Rows with errors" lines stay verbatim.
const GATE_ERRORS = "Fix red input errors first.";
const EXAMPLE_TEXT_BLOCKED = "Example recipe: its text is a fictional example, so Save text only is blocked like the SD-card export. Copy preview still works for reading it.";
function gateLabel(reason) {
  if (/^Example recipe:/.test(reason)) return "Example recipe: untick it in the recipe editor, then Apply";
  const short = {
    "Load a firmware baseline to export a complete card.": "No firmware baseline: load a sync-export folder in Manage",
    "Baseline model does not match this recipe.": "Baseline is for another model: load this recipe's model, or change its model family",
    "Baseline label is not allowed by this recipe.": "Baseline label not allowed: add it to the recipe's allowed labels, or load the right baseline",
    "Apply recipe changes or Discard unapplied draft first.": "Unapplied recipe draft: Apply or Discard it in the recipe editor",
    [GATE_ERRORS]: "Input errors above",
  };
  return short[reason] || reason;
}
// A gate in two or three words, for the checks heading ("Export blocked · example recipe · no
// firmware baseline"); the full sentence stays under the Export button.
function gateWord(reason) {
  if (/^Example recipe:/.test(reason)) return "example recipe";
  const short = {
    "Load a firmware baseline to export a complete card.": "no firmware baseline",
    "Baseline model does not match this recipe.": "baseline is for another model",
    "Baseline label is not allowed by this recipe.": "baseline label not allowed",
    "Apply recipe changes or Discard unapplied draft first.": "unapplied recipe draft",
  };
  return short[reason] || reason.replace(/\.$/, "").toLowerCase();
}
// Short label of a non-blocking gate warning; the full sentence stays as the item's title.
function gateWarnLabel(t) {
  return /^Baseline fingerprint DIFFERS/.test(t)
    ? "Review: baseline fingerprint DIFFERS from the project's record (use the recorded folder, or Save project to record this one)"
    : t;
}
// The way out of a gate, as a button in the box: the Example recipe tick or the baseline loader.
const GATE_FIXES = [
  [/^Example recipe:/, "Open recipe editor", () => openExampleSetting()],
  [/^Load a firmware baseline/, "Load baseline", () => openBaselineLoader()],
];
// The gate box (under Build's export buttons, above the bulk buttons on Cards): one headline,
// one short item per reason, and a button for the first reason that has a way out.
// errors (Build): the error findings, so the input-errors item names each one as a link.
// warnings: review notes that do not block (the baseline fingerprint differs from the project's
// record); shown in amber beside "Ready to export", or after the blocking reasons.
function renderGate(box, reasons, okText, fixId, errors, warnings) {
  const warn = (warnings || []).map((t) => el("li", { className: "gate-warn-item", title: t }, gateWarnLabel(t)));
  box.replaceChildren();
  // Input errors alone (Build): the checks box above already lists them with their jumps, so
  // the gate is one quiet line, "Export blocked · 2 errors above", whose link goes back up to
  // them: one list, no second red panel (round 12).
  const quiet = reasons.length > 0 && reasons.every((x) => x === GATE_ERRORS) && !!(errors && errors.length);
  box.classList.toggle("gate-quiet", quiet);
  box.classList.toggle("gate-bad", reasons.length > 0 && !quiet);
  box.classList.toggle("gate-ok", !reasons.length && !!okText && !warn.length);
  box.classList.toggle("gate-warn", !reasons.length && !!okText && warn.length > 0);
  if (!reasons.length) {
    if (okText) box.append(el("span", { className: "gate-head" }, okText));
    if (okText && warn.length) box.append(el("ul", { className: "gate-list" }, warn));
    return;
  }
  const items = reasons.map((t) => {
    // The input-errors item names each error in a few characters ("MGMT_IP", "Gi1/4 VLAN"), each
    // a link to the field or cell it is about ("2 errors above: …" when they are the only reason:
    // the red checks box above lists them in full).
    if (t === GATE_ERRORS && errors && errors.length) {
      // "2 errors above": one link back to the checks box, which lists them with their jumps.
      const n = errors.length;
      return el("li", { title: t }, el("button", { type: "button", className: "gate-jump", title: "Back to the checks: " + errors.map((f) => f.text).join("\n"),
        onclick: () => jumpToChecks() }, n + (n === 1 ? " error" : " errors") + " above"));
    }
    return el("li", { title: t }, gateLabel(t));
  });
  box.append(el("span", { className: "gate-head" }, "Export blocked"), el("ul", { className: "gate-list" }, items, warn));
  for (const [re, label, run] of GATE_FIXES)
    if (reasons.some((t) => re.test(t))) {
      box.append(el("button", { type: "button", id: fixId, className: "gate-fix", onclick: run }, label));
      break;
    }
}
// The gate's way back up: the checks box into view and focus on its first jump (the error).
function jumpToChecks() {
  const box = $("checks");
  if (!box) return;
  const first = box.querySelector("button.finding-link");
  if (box.scrollIntoView) box.scrollIntoView({ block: "nearest" });
  if (first) first.focus({ preventScroll: true });
}
// Text in a <pre> as one block per line (so CSS can number them): each block holds the line's
// text node and its newline, and the box's textContent is the text byte for byte.
function fillLines(pre, text) {
  const lines = String(text).split("\n");
  const last = lines.length - 1;
  pre.replaceChildren(...lines.map((line, i) => el("span", { className: "pl" }, line, i < last ? "\n" : ""))
    .filter((b, i) => i < last || lines[i] !== ""));
}
// A finding's place in a few characters: the field key, "Gi1/4 VLAN", "template", ...
function findingShortName(f) {
  const w = (f && f.where) || {};
  const abbr = (n) => String(n || "")
    .replace(/^TenGigabitEthernet/i, "Te").replace(/^TwoGigabitEthernet/i, "Tw").replace(/^GigabitEthernet/i, "Gi")
    .replace(/^FastEthernet/i, "Fa").replace(/^AppGigabitEthernet/i, "Ap");
  const attrs = { vlan: "VLAN", ip: "IP", mask: "mask", description: "description", role: "role" };
  switch (w.kind) {
    case "field":
    case "row":
      return w.key || "field";
    case "port":
      return (abbr(w.name) + " " + (attrs[w.attr] || w.attr || "")).trim();
    case "ports":
      return "ports";
    case "template":
      // The gate names the one template error with a known cause by that cause.
      return /^The template still contains the example header line/.test((f && f.text) || "") ? "example header in template" : "template";
    case "interfaces":
    case "sources":
    case "file":
      return { interfaces: "interfaces", sources: "management sources", file: "config text" }[w.kind];
    case "policy":
      return "team policy";
  }
  const t = String((f && f.text) || "").split(/[:.(]/)[0].trim();
  return t.length > 28 ? t.slice(0, 26) + "…" : t || "check";
}
// The example gate's way out: the Example recipe checkbox in Manage.
function openExampleSetting() {
  if (!showView("manage")) return;
  const t = $("exampleFlag");
  t.focus({ preventScroll: true });
  t.scrollIntoView({ block: "center" });
  flashTarget(t.closest("label") || t);
}
// The missing-baseline gate's way out: the sync-export folder button in Manage.
function openBaselineLoader() {
  if (!showView("manage")) return;
  const input = $("folderInput");
  const label = input.closest("label") || input;
  input.focus({ preventScroll: true });
  label.scrollIntoView({ block: "center" });
  flashTarget(label);
}

function renderPreview() {
  const r = current(),
    g = generate(r),
    b = blockers(r, g);
  // One block per line (its number is drawn by CSS); the box's textContent stays the text itself.
  fillLines($("preview"), g.text);
  const meter = $("previewMeter");
  if (meter) meter.textContent = previewSizeLabel(g.text);
  // Status above the preview: at most one red box (errors) and one box for the result
  // (yellow with the notes to review, or green when there is nothing to review). Export
  // blockers are listed under the Export button (#exportWhy) and, once the checks pass, also in the
  // amber box below (see the "export gate holds" case).
  // Each item carries its location (findings are errors/warnings with the same text and order),
  // so it renders as a button that jumps to the field, port, template line or rule it is about.
  $("checks").replaceChildren();
  const found = (level) => (g.findings || []).filter((f) => f.level === level);
  const notices = found("warning").map((f) => {
    const t = f.text.replace(/^Soft:\s*/, "");
    return { text: t.charAt(0).toUpperCase() + t.slice(1), where: f.where };
  });
  if (g.errors.length)
    $("checks").append(statusNotice("error",
      g.errors.length === 1 ? "1 error blocks export" : g.errors.length + " errors block export",
      found("error").map((f) => ({ text: f.text, where: f.where }))));
  const policyHits = g.errors.length ? [] : policyViolations(g.text, teamPolicies);
  if (policyHits.length)
    $("checks").append(statusNotice("error",
      policyHits.length === 1 ? "1 team policy rule blocks export" : policyHits.length + " team policy rules block export",
      policyHits.map((t) => ({ text: t, where: { kind: "policy" } })),
      "Rules are edited under Team security hints in Manage recipes & baseline."));
  if (!g.errors.length || notices.length) {
    const count = notices.length === 1 ? "1 note to review" : notices.length + " notes to review";
    // Checks passed but an export gate holds (example recipe, baseline, draft): the verdict leads.
    // The heading is "Export blocked" (red words) with the gates in a few words each, and the
    // check result follows as a secondary line ("Checks: 0 errors · 1 note to review"), so one
    // card never shows "Checks passed" above "Export blocked" as two verdicts (round 11). The
    // gate under the Export button names the reasons in full with the way out. Without notes the
    // box lists the gates as jumps too; with notes it stays short, so the pane keeps its preview
    // lines and its footer. Amber, not green.
    const gates = g.errors.length ? [] : b.filter((x) => !x.startsWith("Team policy:"));
    const head = g.errors.length
      ? count
      : gates.length
        ? { gate: "Export blocked", rest: " · " + gates.map(gateWord).join(" · ") }
        : "Checks passed" + (notices.length ? " · " + count : "");
    const sub = g.errors.length || !gates.length ? "" : "Checks: 0 errors · " + (notices.length ? count : "nothing to review");
    const gateItems = notices.length ? [] : gates.map((t) => {
      const fix = GATE_FIXES.find(([re]) => re.test(t));
      return { text: gateLabel(t), gate: true, title: t, run: fix ? fix[2] : null };
    });
    $("checks").append(statusNotice(notices.length || gates.length ? "warning" : "ok", head,
      [...notices, ...gateItems],
      "Cisco syntax and device behavior are not verified.", null, sub));
  }
  markInvalidFields(g);
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
  // An example recipe's text is fictional: Save text only is gated like the card export (v0.8.0
  // operator round). Copy preview stays so the example can still be read and compared.
  $("downloadConfig").disabled = busy || editorPending || !!r.example || !!g.errors.length || !!policyHits.length;
  $("copyPreview").disabled = busy || !!g.errors.length;
  $("downloadCard").disabled =
    busy || !!g.errors.length || !!b.length;
  $("savePackage").disabled = busy || editorPending || !baseline;
  const why = [];
  if (editorPending)
    why.push("Apply recipe changes or Discard unapplied draft first.");
  if (g.errors.length) why.push("Fix red input errors first.");
  if (b.length) why.push(...b.filter((x) => !why.includes(x)));
  const ew = $("exportWhy");
  if (ew) renderGate(ew, $("downloadCard").disabled ? (why.length ? why : ["Export unavailable."]) : [], "Ready to export.", "exportFixGate", found("error"),
    [baselineDiffersWarning()].filter(Boolean));
  $("downloadCard").title = $("downloadCard").disabled
    ? why.join(" ") || "Export blocked"
    : "Download ZIP for the SD card root";
  $("downloadConfig").title = $("downloadConfig").disabled
    ? editorPending
      ? "Apply recipe changes or Discard unapplied draft first."
      : r.example
        ? EXAMPLE_TEXT_BLOCKED
        : policyHits.length
          ? "Team policy: " + policyHits[0]
          : "Fix validation errors first."
    : "Download preview as editcontent.txt";
  updateDiscardButton();
  // v0.7.0 panels: transliteration offer, changes since the last export.
  const fix = $("asciiFix");
  if (fix) fix.hidden = !g.asciiIssue;
  renderDiffPanel(r, g);
  // Last, once the checks and the gate above and under it have their new height: the box is
  // sized from its new text (whole lines: a changed line may now wrap where the box ends) and
  // the cue measured from it. Pointless (and a forced layout) while Build is hidden;
  // showView("build") sizes the pane then.
  if (typeof sizeBuildPane === "function" && !$("build").hidden) sizeBuildPane();
  scheduleRailUpdate();
}
// Inline error state on Build: a field or port cell named by an error check gets a red border
// (aria-invalid) and, for Device details, the check's text under the field.
function markInvalidFields(g) {
  const lower = (t) => String(t).toLowerCase();
  const bad = new Map();
  for (const f of g.findings || []) {
    if (f.level !== "error" || !f.where) continue;
    let t = null;
    if (f.where.kind === "field") t = $("value_" + f.where.key);
    else if (f.where.kind === "port")
      t = [...$("ports").querySelectorAll("[data-port][data-attr]")]
        .find((n) => lower(n.dataset.port) === lower(f.where.name) && n.dataset.attr === f.where.attr) || null;
    if (t && !bad.has(t)) bad.set(t, f.text);
  }
  for (const n of document.querySelectorAll("#fields input, #ports [data-port][data-attr]")) {
    const text = bad.get(n);
    const msgId = n.id ? n.id + "_error" : "";
    let msg = msgId ? document.getElementById(msgId) : null;
    if (text) {
      n.setAttribute("aria-invalid", "true");
      if (n.id) {
        if (!msg) {
          msg = document.createElement("small");
          msg.id = msgId;
          msg.className = "field-error";
          n.after(msg);
        }
        msg.textContent = text;
        n.setAttribute("aria-describedby", msgId);
      } else n.title = text;
    } else if (n.hasAttribute("aria-invalid")) {
      n.removeAttribute("aria-invalid");
      n.removeAttribute("aria-describedby");
      if (!n.id) n.removeAttribute("title");
      if (msg) msg.remove();
    }
  }
}
// One status box: a bold heading, an optional list of items and an optional muted footer.
// An item is a string, or {text, where}: a button with the same text that runs
// focusFinding(where, ctx) (ctx defaults to the Build page).
// heading may be {gate, rest}: the gate words lead in red ("Export blocked"), the rest follows.
// sub: a secondary line under the heading (the check result while a gate blocks).
function statusNotice(kind, heading, items, footer, ctx, sub) {
  const el = document.createElement("div");
  el.className = "notice " + kind;
  const h = document.createElement("strong");
  h.className = "notice-head";
  if (heading && typeof heading === "object") {
    const g = document.createElement("span");
    g.className = "notice-gate";
    g.textContent = heading.gate;
    h.append(g, document.createTextNode(heading.rest || ""));
    el.classList.add("notice-gated");
  } else h.textContent = heading;
  el.append(h);
  if (sub) {
    const s = document.createElement("span");
    s.className = "notice-sub";
    s.textContent = sub;
    el.append(s);
  }
  if (items && items.length) {
    const ul = document.createElement("ul");
    for (const t of items) {
      const li = document.createElement("li");
      // {gate: true}: an export gate listed among the checks (red dot); {run} jumps to its way out.
      if (t && t.gate) li.className = "li-gate";
      if (t && t.title) li.title = t.title;
      if (typeof t === "string") li.textContent = t;
      else if (!t.where && !t.run) li.textContent = t.text;
      else {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "finding-link";
        b.textContent = t.text;
        b.addEventListener("click", t.run ? t.run : () => focusFinding(t.where, { ...(ctx || { view: "build" }), text: t.text }));
        li.append(b);
        // The whole line is the target (round 12): a press on the line's own edge runs the jump.
        li.addEventListener("click", (e) => { if (e.target === li) b.click(); });
      }
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
  // The rail is locked while a draft is unapplied, so Save project is offered here as well.
  const save = $("saveProjectDraft");
  if (save) save.hidden = !editorPending;
}
function loadEditor() {
  const r = current();
  ensureRoles(r);
  $("editRecipe").value = active;
  // The "fictional examples" note only shows while an example recipe is selected.
  $("exampleNote").hidden = !r.example;
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
  if (typeof growEditorTextareas === "function") growEditorTextareas();
}
function lines(s) {
  return s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}
async function applyRecipe() {
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
  // Per-switch port settings (v0.8.0) on interfaces that leave the list go with them. Settings
  // already on unknown interfaces are not this Apply's drop: they stay (row errors).
  const switchDrops = probeSwitchOverrideDrops(r, names).filter((d) => switchOverrideIface(d.name, r.interfaces) !== null);
  const switchDropMsg = formatSwitchOverrideDrops(switchDrops);
  const dropMsg = [formatPortRemapReport(remapPreview), switchDropMsg].filter(Boolean).join("\n\n");
  if (dropMsg) {
    if (
      !(await confirmDialog(
        "Drop unmatched port assignments?",
        dropMsg +
          "\n\nContinue Apply? Surviving ports keep their roles by name; new ports get defaults (first=Trunk).",
        { ok: "Drop and apply", danger: true },
      ))
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
  alignSwitchOverrides(r, { drop: switchDrops }); // drops what the dialog listed; case-only renames re-key
  if (r.ports.length > MAX_PORTS)
    throw Error(
      "Port table exceeds " + MAX_PORTS + " entries after interface remap.",
    );
  editorPending = false;
  touch();
  renderAll();
  loadEditor(); // Show exactly the cleaned values that were applied.
  // The port table is mentioned only when the remap changed it (a row dropped or added); an
  // Apply that kept every port by name says nothing about it (operator round 7).
  let msg = "Recipe applied.";
  if (remap.dropped.length || remap.added.length) {
    msg +=
      " Port table remapped to " +
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
  }
  if (cleaned.length) msg += " Cleaned " + cleaned.join(" and ") + "; updated values are shown in the editor.";
  if (wasExample && !r.example)
    msg += " Example flag cleared — Save project to keep this durable.";
  else msg += " Save a project or team package to keep your changes.";
  // Unticking Example is not the whole way out: the example header line blocks export too.
  if (!r.example && String(r.template || "").includes(CONFIG.EXAMPLE_HEADER_LINE))
    msg += " The template still has the example header line, which blocks export until you replace it.";
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
