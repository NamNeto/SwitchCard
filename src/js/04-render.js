// --- Render: rebuild the Build panel from state ---
function renderAll() {
  for (const id of ["recipe", "editRecipe"]) {
    $(id).replaceChildren(...recipes.map((r) => option(r.id, r.name)));
    $(id).value = active;
  }
  renderSkuPresetOptions();
  renderFields();
  renderBaseline();
  renderPreview();
}
function renderFields() {
  const r = current();
  ensureRoles(r);
  const portReport = normalizePorts(r); // keeps unmatched ports by default
  let info =
    r.model +
    " · " +
    (r.example ? "Example recipe" : "Custom recipe") +
    " · " +
    (r.firmware.length
      ? "Restricted baseline labels"
      : "Any baseline label in this model family");
  if (portReport.orphans && portReport.orphans.length)
    info +=
      " · Unmatched ports preserved: " +
      portReport.orphans.map((o) => o.name).join(", ");
  if (usesMgmtInterface(r))
    info +=
      " · Management interface: " +
      (mgmtInterfaceMode(r) === "loopback" ? "Loopback (number below)" : "SVI (management VLAN below)");
  $("recipeInfo").textContent = info;
  $("fields").replaceChildren();
  for (const key of deviceKeys(r)) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const l = document.createElement("label");
    l.htmlFor = "value_" + key;
    l.textContent =
      {
        HOSTNAME: "Hostname",
        MGMT_IP: "Management IP",
        MGMT_MASK: "Subnet mask",
        MGMT_VLAN: "Management VLAN",
        MGMT_LOOPBACK: "Management loopback number",
        GATEWAY: "Default gateway",
        SITE: "Site",
      }[key] || key.replaceAll("_", " ");
    const input = document.createElement("input");
    input.id = l.htmlFor;
    input.value = r.values[key] || "";
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      r.values[key] = cleanInput(input, key, /(?:^|_)(?:IP|MASK|VLAN|LOOPBACK)$|^GATEWAY$/.test(key));
      touch();
      renderPreview();
    });
    // Trim when the field loses focus, not while typing, so a space mid-value still works.
    input.addEventListener("change", () => {
      const t = input.value.trim();
      if (t !== input.value) {
        input.value = t;
        r.values[key] = t;
        touch();
        renderPreview();
      }
    });
    wrap.append(l, input);
    $("fields").append(wrap);
  }
  // Show the port table whenever ports feed the output ({{PORTS}} or
  // {{VLANS}}), so port VLAN errors are always fixable in the UI.
  const tkeysR = keys(r.template);
  const hasPorts = tkeysR.includes("PORTS") || tkeysR.includes("VLANS");
  $("ports").closest(".scroll").hidden = !hasPorts;
  $("noPorts").hidden = hasPorts && tkeysR.includes("PORTS");
  $("noPorts").textContent = hasPorts
    ? "This template has {{VLANS}} but no {{PORTS}}: the port roles/VLANs below only feed the vlan list — no interface commands are generated."
    : "This recipe does not use a port section.";
  $("portHelp").hidden = !hasPorts;
  const bulk = $("bulkPorts");
  if (bulk) bulk.hidden = !hasPorts;
  $("ports").replaceChildren();
  if ($("portsHead")) $("portsHead").replaceChildren();
  if (!hasPorts) return;
  const showRouted = r.ports.some((p) => p.role === "routed");
  const head = document.createElement("tr");
  const heads = ["", "Interface", "Role", "VLAN(s)"];
  if (showRouted) heads.push("IP", "Mask");
  heads.push("Description");
  for (const [i, label] of heads.entries()) {
    const th = document.createElement("th");
    th.textContent = label;
    if (i === 0) {
      th.className = "check";
      th.textContent = "";
    }
    head.append(th);
  }
  $("portsHead").append(head);
  for (const p of r.ports) {
    const tr = document.createElement("tr");
    const tdCheck = document.createElement("td");
    tdCheck.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "portPick";
    cb.setAttribute("aria-label", "Select " + p.name);
    cb.dataset.port = p.name;
    tdCheck.append(cb);
    tr.append(tdCheck);
    const name = document.createElement("td");
    name.textContent = p.name;
    tr.append(name);
    const roleTd = document.createElement("td");
    const roleEl = document.createElement("select");
    roleEl.setAttribute("aria-label", p.name + " role");
    roleEl.append(...ROLE_NAMES.map((v) => option(v, v[0].toUpperCase() + v.slice(1))));
    roleEl.value = p.role;
    roleEl.addEventListener("change", () => {
      p.role = roleEl.value;
      if (p.role !== "routed") {
        p.ip = "";
        p.mask = "";
      }
      touch();
      renderFields();
      renderPreview();
    });
    roleTd.append(roleEl);
    tr.append(roleTd);
    const vlanTd = document.createElement("td");
    const vlanEl = document.createElement("input");
    vlanEl.setAttribute("aria-label", p.name + " vlan");
    vlanEl.value = p.vlan;
    vlanEl.disabled = p.role === "unused" || p.role === "routed";
    if (p.role === "trunk") {
      vlanEl.placeholder = "Optional VLANs to create";
    } else if (p.role === "access") {
      vlanEl.placeholder = "Access VLAN";
    } else {
      vlanEl.placeholder = "";
    }
    vlanEl.addEventListener("input", () => {
      p.vlan = cleanInput(vlanEl, p.name + " VLAN", true);
      touch();
      renderPreview();
    });
    vlanTd.append(vlanEl);
    tr.append(vlanTd);
    if (showRouted) {
      if (p.role === "routed") {
        const ipTd = document.createElement("td");
        ipTd.className = "routed-only";
        const ipEl = document.createElement("input");
        ipEl.placeholder = "IP";
        ipEl.value = p.ip || "";
        ipEl.setAttribute("aria-label", p.name + " IP");
        ipEl.addEventListener("input", () => {
          p.ip = cleanInput(ipEl, p.name + " IP", true);
          touch();
          renderPreview();
        });
        ipTd.append(ipEl);
        tr.append(ipTd);
        const maskTd = document.createElement("td");
        maskTd.className = "routed-only";
        const maskEl = document.createElement("input");
        maskEl.placeholder = "Mask";
        maskEl.value = p.mask || "";
        maskEl.setAttribute("aria-label", p.name + " mask");
        maskEl.addEventListener("input", () => {
          p.mask = cleanInput(maskEl, p.name + " mask", true);
          touch();
          renderPreview();
        });
        maskTd.append(maskEl);
        tr.append(maskTd);
      } else {
        const a = document.createElement("td");
        a.className = "muted-cell";
        a.textContent = "—";
        const b = document.createElement("td");
        b.className = "muted-cell";
        b.textContent = "—";
        tr.append(a, b);
      }
    }
    const descTd = document.createElement("td");
    const descEl = document.createElement("input");
    descEl.setAttribute("aria-label", p.name + " description");
    descEl.value = p.description || "";
    descEl.addEventListener("input", () => {
      p.description = cleanInput(descEl, p.name + " description");
      touch();
      renderPreview();
    });
    descTd.append(descEl);
    tr.append(descTd);
    $("ports").append(tr);
  }
  const selAll = $("selectAllPorts");
  if (selAll) {
    selAll.checked = false;
    selAll.onchange = () => {
      document.querySelectorAll("#ports input.portPick").forEach((c) => {
        c.checked = selAll.checked;
      });
    };
  }
}
function renderBaseline() {
  let description = baseline
    ? baseline.model +
      " · " +
      baseline.version +
      " · " +
      baseline.files.length +
      " files · " +
      size(baseline.files.reduce((n, f) => n + f.blob.size, 0))
    : "No baseline loaded. Explore the examples, then import a complete sync export in Manage recipes & baseline.";
  $("baselineInfo").textContent = description;
  $("baseDetails").textContent = description;
  $("fileList").textContent = baseline
    ? baseline.files.map((f) => f.path + "  (" + size(f.blob.size) + ")").join("\n")
    : "No files loaded.";
}
function size(n) {
  return n >= 1048576 ? (n / 1048576).toFixed(1) + " MiB" : (n / 1024).toFixed(1) + " KiB";
}
