// --- Generate: recipe + values + ports -> editcontent.txt text ---
// Returns { text, errors, warnings, asciiIssue, findings }. findings = [{level, text, where}]: the same
// strings as errors/warnings (same order, de-duplicated by level+text), each with the place it points at. Any error blocks preview copy and export. The
// returned text is exactly what is shown in the preview and written into the ZIP.
// blockers() = export gates (example flag, baseline match); generate().errors = input validation
function generate(r) {
  ensureRoles(r);
  const errors = [],
    warnings = [],
    findings = [];
  // where: {kind:"field",key} | {kind:"port",name,attr} | {kind:"ports"} | {kind:"interfaces"} |
  // {kind:"template"} | {kind:"sources"} | {kind:"file",line?,col?}
  const E = (text, where) => (errors.push(text), findings.push({ level: "error", text, where }));
  const W = (text, where) => (warnings.push(text), findings.push({ level: "warning", text, where }));
  const fld = (key) => ({ kind: "field", key });
  const prt = (name, attr) => ({ kind: "port", name, attr });
  const TPL = { kind: "template" };
  const dkeys = deviceKeys(r);
  // Port-level placeholders never come from recipe values.
  const values = {};
  for (const [k, v] of Object.entries(r.values || {}))
    // Surrounding spaces are never meaningful in a placeholder value.
    if (!CONFIG.RESERVED_VALUE_KEYS.includes(k)) values[k] = typeof v === "string" ? v.trim() : v;
  for (const k of dkeys) {
    const v = values[k] || "";
    if (!v.trim()) E(k + " is required.", fld(k));
    if (singleLineBad(v)) {
      E(k + " must be a single line.", fld(k));
      const hit = findInvisibleChar(v);
      if (hit) E(invisibleCharMessage(k, hit), fld(k));
    }
    if (/{{|}}/.test(v)) E(k + " must not contain {{ or }} (placeholder braces).", fld(k));
    if (k === "HOSTNAME" && !/^[a-zA-Z][a-zA-Z0-9-]{0,62}$/.test(v))
      E(
        "Hostname must start with a letter and contain only letters, numbers or hyphens (63 characters maximum).",
        fld(k),
      );
    if (["MGMT_IP", "GATEWAY", "MGMT_MASK"].includes(k) && !ipv4(v))
      E(k + " must be a valid IPv4 address.", fld(k));
    if (k === "MGMT_MASK" && ipv4(v) && !contiguousMask(v))
      E("Subnet mask must have contiguous network bits.", fld("MGMT_MASK"));
    if (k === "MGMT_VLAN") {
      // Surrounding spaces accepted; "007" is emitted as "7".
      if (!vlan(v.trim())) E("Management VLAN must be 1–4094.", fld("MGMT_VLAN"));
      else if (isReservedVlan(v.trim()))
        E("Management VLAN " + +v.trim() + " is reserved (1002–1005) — pick another VLAN.", fld("MGMT_VLAN"));
      else values.MGMT_VLAN = normalizeVlanId(v);
    }
    if (k === "MGMT_LOOPBACK") {
      // IOS-XE: interface Loopback <0-2147483647>. Leading zeros are dropped ("00" -> "0").
      if (!/^\d{1,10}$/.test(v.trim()) || +v.trim() > CONFIG.MAX_LOOPBACK_NUMBER)
        E("Management loopback number must be a whole number from 0 to " + CONFIG.MAX_LOOPBACK_NUMBER + ".", fld("MGMT_LOOPBACK"));
      else values.MGMT_LOOPBACK = String(+v.trim());
    }
  }
  // Derived placeholders come from the recipe, never from typed values (a stray saved value
  // could otherwise inject text). {{MGMT_INTERFACE}} follows the recipe's SVI / Loopback choice.
  for (const k of ["PORTS", "VLANS", ...CONFIG.DERIVED_KEYS]) delete values[k];
  const mgmtMode = mgmtInterfaceMode(r);
  const mgmtIfUsed = usesMgmtInterface(r);
  const loopbackMgmt = mgmtIfUsed && mgmtMode === "loopback";
  if (mgmtIfUsed)
    values.MGMT_INTERFACE =
      mgmtMode === "loopback"
        ? "Loopback" + String(values.MGMT_LOOPBACK || "")
        : "Vlan" + String(values.MGMT_VLAN || "");
  const mgmt = (values.MGMT_IP || "").trim(),
    gw = (values.GATEWAY || "").trim(),
    mmask = (values.MGMT_MASK || "").trim();
  if (
    dkeys.includes("MGMT_IP") &&
    dkeys.includes("GATEWAY") &&
    mgmt &&
    gw &&
    ipv4(mgmt) &&
    ipv4(gw) &&
    mgmt === gw
  )
    E("MGMT_IP and GATEWAY must not be the same address.", fld("GATEWAY"));
  // Management addressing sanity: hard errors for clearly invalid values,
  // soft warnings for suspicious ones. Subnet checks only when MGMT_MASK is bound and valid.
  const mgmtOk = dkeys.includes("MGMT_IP") && ipv4(values.MGMT_IP || "");
  const gwOk = dkeys.includes("GATEWAY") && ipv4(values.GATEWAY || "");
  const maskOk = dkeys.includes("MGMT_MASK") && contiguousMask(values.MGMT_MASK || "");
  const mprefix = maskOk ? maskPrefix(mmask) : -1;
  const subnets = []; // {label, net, bcast, prefix}
  if (mgmtOk && hostAddressProblem(mgmt))
    E("MGMT_IP " + mgmt + " " + hostAddressProblem(mgmt) + ".", fld("MGMT_IP"));
  if (gwOk && hostAddressProblem(gw))
    E("GATEWAY " + gw + " " + hostAddressProblem(gw) + ".", fld("GATEWAY"));
  // Link-local (169.254/16) management addressing is almost always a mistake.
  for (const [k, v, ok] of [["MGMT_IP", mgmt, mgmtOk], ["GATEWAY", gw, gwOk]])
    if (ok && /^169\.254\./.test(v))
      W(k + " " + v + " is a link-local (169.254.0.0/16) address — unusual for switch management. Confirm it is intended.", fld(k));
  if (maskOk && loopbackMgmt) {
    // Loopback management: /32 is the norm, and the gateway lives on another L3 interface.
    if (mprefix !== 32)
      W(
        "Loopback management: MGMT_MASK is /" + mprefix + " — loopback interfaces normally use 255.255.255.255 (/32). Confirm it is intended.",
        fld("MGMT_MASK"),
      );
  } else if (maskOk) {
    // 0.0.0.0 (/0) is already rejected above as a non-contiguous mask
    if (mprefix === 32) {
      if (dkeys.includes("GATEWAY"))
        E(
          "MGMT_MASK 255.255.255.255 (/32) leaves no room for a default gateway on the management subnet.",
          fld("MGMT_MASK"),
        );
      else W("MGMT_MASK is /32 — the management SVI has no neighbours on its subnet. Confirm this is intended.", fld("MGMT_MASK"));
    } else if (mprefix === 31)
      W("MGMT_MASK is /31 — unusual for a management SVI. Confirm your platform and design support it.", fld("MGMT_MASK"));
    else if (mprefix < 16)
      W("MGMT_MASK /" + mprefix + " is a very large management subnet. Confirm it is intended.", fld("MGMT_MASK"));
  }
  if (mgmtOk && maskOk && mprefix > 0) {
    const e = subnetEdgeProblem(mgmt, mprefix);
    if (e) E("MGMT_IP " + mgmt + " " + e + " — not a usable host address.", fld("MGMT_IP"));
    subnets.push({ label: loopbackMgmt ? "management loopback" : "management SVI", ...subnetOf(mgmt, mprefix) });
  }
  // With loopback management the gateway sits on a Routed port or SVI subnet, not on the
  // loopback, so the "gateway inside the management subnet" rule applies to SVI recipes only.
  if (gwOk && maskOk && mprefix > 0 && !loopbackMgmt) {
    const e = subnetEdgeProblem(gw, mprefix);
    if (e) E("GATEWAY " + gw + " " + e + " — not a usable host address.", fld("GATEWAY"));
    if (mgmtOk && mprefix < 32 && subnetOf(gw, mprefix).net !== subnetOf(mgmt, mprefix).net)
      E(
        "GATEWAY " + gw + " is outside the management subnet " + intToIp(subnetOf(mgmt, mprefix).net) + "/" + mprefix + " — the default gateway would be unreachable.",
        fld("GATEWAY"),
      );
  }
  let portText = "";
  const routedIps = [];
  // Ports whose interface is not in the recipe's list block export (even for VLANS-only templates).
  const ifaceSet = new Set((r.interfaces || []).map((n) => String(n).toLowerCase()));
  for (const p of r.ports || []) {
    if (!ifaceSet.has(String(p.name || "").toLowerCase()))
      E(
        p.name +
          ": port is not in the interface list (unmatched assignment). Apply recipe changes to drop it, or add the interface name.",
        prt(p.name, "role"),
      );
  }
  for (const f of portVlanFindings(r)) E(f.text, f.where);
  const usesPorts = keys(r.template).includes("PORTS");
  if (usesPorts) {
    for (const p of r.ports) {
      if (!ifaceSet.has(String(p.name || "").toLowerCase())) continue;
      if (p.role === "routed") {
        // Normalize once: store the trimmed values so the preview and the ZIP emit the same bytes.
        const pip = String(p.ip || "").trim();
        const pmask = String(p.mask || "").trim();
        p.ip = pip;
        p.mask = pmask;
        if (singleLineBad(pip))
          E(p.name + ": routed IP must be a single line.", prt(p.name, "ip"));
        if (singleLineBad(pmask))
          E(p.name + ": routed mask must be a single line.", prt(p.name, "mask"));
        if (!pip) E(p.name + ": routed IP is required.", prt(p.name, "ip"));
        else if (!ipv4(pip))
          E(p.name + ": routed IP must be a valid IPv4 address.", prt(p.name, "ip"));
        else {
          if (routedIps.includes(pip))
            E(p.name + ": duplicate routed port IP " + pip + ".", prt(p.name, "ip"));
          else routedIps.push(pip);
          if (dkeys.includes("MGMT_IP") && mgmt && ipv4(mgmt) && pip === mgmt)
            E(p.name + ": routed IP must not equal MGMT_IP.", prt(p.name, "ip"));
          if (dkeys.includes("GATEWAY") && gw && ipv4(gw) && pip === gw)
            E(p.name + ": routed IP must not equal GATEWAY.", prt(p.name, "ip"));
          if (hostAddressProblem(pip))
            E(p.name + ": routed IP " + pip + " " + hostAddressProblem(pip) + ".", prt(p.name, "ip"));
        }
        if (!pmask) E(p.name + ": routed mask is required.", prt(p.name, "mask"));
        else if (!ipv4(pmask))
          E(p.name + ": routed mask must be a valid IPv4 address.", prt(p.name, "mask"));
        else if (!/^1+0*$/.test(pmask.split(".").map((x) => (+x).toString(2).padStart(8, "0")).join("")))
          E(p.name + ": routed mask must have contiguous network bits.", prt(p.name, "mask"));
        else if (ipv4(pip)) {
          const pp = maskPrefix(pmask);
          const e = subnetEdgeProblem(pip, pp);
          if (e) E(p.name + ": routed IP " + pip + " " + e + " — not a usable host address.", prt(p.name, "ip"));
          if (pp === 32)
            W(p.name + ": routed /32 mask is unusual on a physical port. Confirm it is intended.", prt(p.name, "mask"));
          const sn = { label: p.name, ...subnetOf(pip, pp) };
          for (const o of subnets)
            if (sn.net <= o.bcast && o.net <= sn.bcast)
              E(
                p.name + ": routed subnet " + intToIp(sn.net) + "/" + pp + " overlaps the " + o.label + " subnet " + intToIp(o.net) + "/" + o.prefix + " (IOS rejects overlapping interface subnets).",
                prt(p.name, "ip"),
              );
          subnets.push(sn);
        }
      }
      const desc = typeof p.description === "string" ? p.description : "";
      if (singleLineBad(desc) || /[\r\n]/.test(desc)) {
        E(p.name + ": description must be one line.", prt(p.name, "description"));
        const hit = findInvisibleChar(desc);
        if (hit) E(invisibleCharMessage(p.name + ": description", hit), prt(p.name, "description"));
      }
      if (/{{|}}/.test(desc))
        E(p.name + ": description must not contain {{ or }} (placeholder braces).", prt(p.name, "description"));
      if (desc.length > CONFIG.MAX_DESCRIPTION_CHARS)
        E(
          p.name + ": description is " + desc.length + " characters — IOS-XE allows at most " + CONFIG.MAX_DESCRIPTION_CHARS + ".",
          prt(p.name, "description"),
        );
      else {
        // Descriptions are IOS command text, so plain printable ASCII only.
        const na = /[^\x20-\x7e]/u.exec(desc);
        if (na)
          E(
            p.name + ": description contains " + describeChar(na[0]) + " at column " + ([...desc.slice(0, na.index)].length + 1) + " — IOS descriptions must be plain ASCII (e.g. ü→ue, – → -).",
            prt(p.name, "description"),
          );
      }
      if (!ROLE_NAMES.includes(p.role)) E(p.name + ": unknown role.", prt(p.name, "role"));
      const template = r.roles[p.role] || "";
      if (!template.trim()) E(p.name + ": the selected role has no commands.", prt(p.name, "role"));
      // A description only reaches the card when the role template uses {{DESCRIPTION}}.
      if (desc.trim() && !/{{\s*DESCRIPTION\s*}}/.test(template))
        W(p.name + ": its description is not used, because the " + p.role + " role template has no {{DESCRIPTION}} line.", prt(p.name, "description"));
      const portValues = {
        ...values,
        INTERFACE: p.name,
        VLAN: p.role === "trunk" ? normalizeTrunkVlanList(p.vlan) : normalizeVlanId(p.vlan),
        DESCRIPTION: desc,
        PORT_IP: p.ip || "",
        PORT_MASK: p.mask || "",
      };
      // A role line that uses {{VLAN}} / {{PORT_IP}} / {{PORT_MASK}} must not be emitted
      // with that value empty (e.g. a team Trunk template with "switchport trunk allowed vlan {{VLAN}}"
      // and an empty VLAN field would otherwise emit an incomplete command and leave the trunk open).
      for (const line of template.split("\n"))
        for (const ph of ["VLAN", "PORT_IP", "PORT_MASK"])
          if (line.includes("{{" + ph + "}}") && !String(portValues[ph] || "").trim())
            E(p.name + ": the " + p.role + " role line \"" + line.trim() + "\" uses {{" + ph + "}}, but this port has no " +
              (ph === "VLAN" ? "VLAN" : ph === "PORT_IP" ? "IP" : "mask") + " — fill it in or remove that line from the role template.",
              prt(p.name, ph === "VLAN" ? "vlan" : ph === "PORT_IP" ? "ip" : "mask"));
      let stanza = substitute(template, portValues);
      // An empty description omits the "description" line entirely (some images reject a bare one).
      if (!desc.trim())
        stanza = stanza
          .split("\n")
          .filter((line) => !/^\s*description\s*$/i.test(line))
          .join("\n");
      // Optional "default interface" (per recipe, off by default, not device-tested).
      if (r.defaultInterface === true) stanza = "default interface " + p.name + "\n" + stanza;
      portText += stanza.trimEnd() + "\n";
    }
  }
  // {{VLANS}}: reserved VLANs are excluded; size warning and hard cap (never truncated).
  const vinfo = collectLayer2VlanInfo(r);
  const vlanIds = vinfo.ids;
  const tkeys = keys(r.template);
  if (tkeys.includes("VLANS")) {
    if (vinfo.reserved.length)
      W(
        "Reserved VLANs " + vinfo.reserved.join(",") + " (1002–1005) appear in a Trunk list — no vlan lines are generated for them.",
        { kind: "file" },
      );
    if (vlanIds.length > CONFIG.MAX_VLAN_STATEMENTS)
      E(
        "{{VLANS}} would create " + vlanIds.length + " vlan statements (maximum " + CONFIG.MAX_VLAN_STATEMENTS + "). Narrow the Trunk VLAN lists — refused, not truncated.",
        { kind: "file" },
      );
    else if (vlanIds.length > CONFIG.WARN_VLAN_STATEMENTS)
      W(
        "{{VLANS}} creates " + vlanIds.length + " vlan statements — more than most IE deployments need. Check the Trunk VLAN ranges.",
        { kind: "file" },
      );
  }
  // Management VLAN reachability (soft warnings).
  if (usesPorts) {
    const active = (r.ports || []).filter(
      (p) => ifaceSet.has(String(p.name || "").toLowerCase()) && ["access", "trunk", "routed"].includes(p.role),
    );
    const mv = (values.MGMT_VLAN || "").trim();
    if (!active.length && (r.ports || []).length)
      W("No port is Access, Trunk or Routed — the switch would have no active data ports.", { kind: "ports" });
    else if (dkeys.includes("MGMT_VLAN") && vlan(mv)) {
      const hasTrunk = active.some((p) => p.role === "trunk");
      const onAccess = active.some((p) => p.role === "access" && vlan((p.vlan || "").trim()) && +p.vlan.trim() === +mv);
      if (!hasTrunk && !onAccess)
        W(
          "Management VLAN " + +mv + " is not on any Access port and there is no Trunk port — interface Vlan" + +mv + " may stay down and remote management would be lost.",
          fld("MGMT_VLAN"),
        );
    }
  }
  const famBad = interfaceFamilyMismatches(r);
  if (famBad.length)
    W(
      "Soft: interface names that don't look like " + r.model + " ports: " + famBad.slice(0, 5).join(", ") + (famBad.length > 5 ? " …" : "") + ". Check the model or the interface list.",
      { kind: "interfaces" },
    );
  // Literal addresses typed into the template are not part of the subnet checks; say so.
  if (effectiveTemplateTexts(r).some((t) => /^[ ]*ip address \d/m.test(t.replace(/[ \t]+/g, " ").toLowerCase())))
    W(
      "Soft: the template or a used role template contains literal 'ip address' lines — only {{MGMT_IP}}/{{MGMT_MASK}} and Routed port addresses are included in the subnet/overlap checks.",
      TPL,
    );
  // {{MGMT_SOURCES}}: the recipe's management source block with {{MGMT_INTERFACE}} and the other
  // values filled in. An empty block emits nothing there (and says so).
  let sourcesText = "";
  if (tkeys.includes("MGMT_SOURCES")) {
    const srcTpl = mgmtSourcesText(r);
    if (!srcTpl.trim())
      W(
        "The template has {{MGMT_SOURCES}} but the management source commands list is empty — no source-interface lines are generated.",
        { kind: "sources" },
      );
    sourcesText = substitute(srcTpl, values).trimEnd();
  }
  const text = substitute(r.template, {
    ...values,
    PORTS: portText.trimEnd(),
    VLANS: formatVlansBlock(vlanIds),
    MGMT_SOURCES: sourcesText,
  });
  // When braces came from a value/description, the field-specific error is enough.
  if (/{{|}}/.test(text) && !errors.some((e) => /must not contain \{\{ or \}\}/.test(e)))
    E("The template contains unresolved or unsupported placeholders.", TPL);
  if (!text.trim()) E("The configuration is empty.", TPL);
  // Credential-looking lines only (secrets, communities, AAA server keys). Plain
  // "ip radius source-interface" / "ip tacacs source-interface" lines carry no credential.
  if (
    /password|secret|community|username .+ privilege|(?:radius|tacacs)-server .*\bkey\b|^[ ]*key\s+\S|\bpac key\b|server-private/im.test(
      text,
    )
  )
    W(
      "Config may contain credentials — keep project/team package files on approved private storage only; never in a public repository.",
      TPL,
    );
  if (
    !/interface\s+Vlan\d+/i.test(text) &&
    !/interface\s+Vlan\{\{/.test(r.template) &&
    !(loopbackMgmt && /interface\s+Loopback\d+/i.test(text))
  )
    W(
      "No interface Vlan SVI found. Most IE cards need a management L3 SVI (often Vlan100) or a Loopback (recipe setting) with IP and mask in the recipe template.",
      TPL,
    );
  if (
    keys(r.template).includes("PORTS") &&
    !keys(r.template).includes("VLANS") &&
    !/{{VLANS}}/.test(r.template)
  )
    W(
      "Recipe template has no {{VLANS}} placeholder — Access/Trunk port VLANs will not create Layer-2 vlan statements. Add {{VLANS}} near the top of the template.",
      TPL,
    );
  // Remote-access oriented soft warnings (advisory; not a Cisco syntax linter)
  const dkeySet = new Set(dkeys);
  const positive = positiveConfigText(text);
  if (
    (dkeySet.has("GATEWAY") || dkeySet.has("MGMT_IP")) &&
    !/ip\s+default-gateway/i.test(positive) &&
    !/ip\s+route\s+0\.0\.0\.0/i.test(positive)
  )
    W(
      "No ip default-gateway or ip route 0.0.0.0 found in generated text — SVI alone may not restore remote management on some platforms. Confirm reachability on your image.",
      TPL,
    );
  // Loopback management is reachable only through routing (advisory; not a Cisco parser).
  if (loopbackMgmt) {
    if (!/^[ ]*ip\s+routing\b/im.test(positive))
      W(
        "Loopback management: no 'ip routing' found — a loopback address is reachable only when the switch routes. Add ip routing and a route to the gateway (ip route 0.0.0.0 0.0.0.0 {{GATEWAY}}) through a Routed port or SVI.",
        TPL,
      );
    if (/ip\s+default-gateway/i.test(positive) && !/ip\s+route\s+0\.0\.0\.0/i.test(positive))
      W(
        "Loopback management: ip default-gateway is ignored once ip routing is enabled — use ip route 0.0.0.0 0.0.0.0 {{GATEWAY}} instead.",
        TPL,
      );
    if (gwOk) {
      const gwInt = ipToInt(gw);
      // Routed-port subnets plus any literal "interface X / ip address A M" block in the generated
      // text (a transit SVI typed into the template), excluding the management interface itself.
      const candidates = subnets.filter((sn) => sn.label !== "management loopback").concat(literalL3Subnets(text, values.MGMT_INTERFACE));
      const reachable = candidates.some((sn) => gwInt >= sn.net && gwInt <= sn.bcast);
      if (!reachable)
        W(
          "Loopback management: GATEWAY " + gw + " is not inside any Routed port or literal interface subnet — confirm the switch has an L3 interface on the gateway's subnet.",
          fld("GATEWAY"),
        );
    }
  }
  if (
    !/transport\s+input\s+ssh/i.test(positive) &&
    !/ip\s+ssh/i.test(positive) &&
    !/crypto\s+key/i.test(positive)
  )
    W(
      "Soft: no obvious SSH markers (transport input ssh / ip ssh / crypto key). Templates vary — confirm VTY access before production rollout.",
      TPL,
    );
  if (!/enable\s+secret/i.test(positive) && !/\busername\s+/i.test(positive))
    W(
      "Soft: no enable secret / username patterns found. Optional; confirm local credentials exist in your tested recipe.",
      TPL,
    );
  // Output normalization: tabs -> single spaces (a Tab can mean completion on a CLI),
  // every line ending -> CRLF, trailing whitespace trimmed, exactly one final CRLF.
  let normalized = text.replace(/\t/g, " ").replace(/\r?\n/g, "\r\n").trimEnd() + "\r\n";
  // Optional provenance comments (per recipe, off by default). No
  // timestamp inside the text so preview === ZIP bytes; export time lives in ZIP headers.
  if (r.provenanceComments === true) {
    const host = dkeys.includes("HOSTNAME") ? commentSafe(String(values.HOSTNAME || "").trim(), 63) || "NOT-SET" : "NOT-BOUND";
    const head =
      "! SWITCHCARD v" + CONFIG.RELEASE + " host=" + host + " recipe=" + commentSafe(r.name, 80) + "\r\n";
    const body = head + normalized;
    const lineCount = body.split("\r\n").length - 1;
    normalized = body + "! SWITCHCARD-END lines=" + lineCount + " sha256=" + sha256Hex(body) + "\r\n";
  }
  // Final gate on the exact generated bytes; reports line and column. asciiIssue lets the Build
  // panel offer the transliteration helper.
  let asciiIssue = false;
  const hit = findInvisibleChar(normalized);
  if (hit && (asciiIssue = true))
    E(
      invisibleCharMessage("Generated editcontent.txt", hit) +
        " It would look different in review than on the switch — remove it from the template, role template or values.",
      { kind: "file", line: hit.line, col: hit.col },
    );
  else {
    // Allowlist: every line must be plain printable ASCII.
    const ci = findCommandCharIssue(normalized);
    if (ci) {
      asciiIssue = true;
      const src = [];
      for (const [k, v] of Object.entries(values)) if (String(v).includes(ci.ch)) src.push("value " + k);
      for (const p of r.ports || []) if (String(p.description || "").includes(ci.ch)) src.push(p.name + " description");
      E(
        "Generated editcontent.txt line " + ci.line + ", column " + ci.col + ": " + ci.label +
          (ci.comment ? " in a '!' comment line" : " in a command line") + " — the whole generated file must be plain printable ASCII, including comments." +
          ' Line: "' + commentSafe(ci.lineText.trim(), 60) + '". ' +
          (src.length ? "This character is also found in " + src.join(", ") + ". " : "") +
          "Check the reported line in the template or used role template as well.",
        { kind: "file", line: ci.line, col: ci.col },
      );
    }
  }
  // A recipe taken over from an example (Example recipe unticked) must not ship the example's
  // header line. Example recipes are already blocked by the example gate, so their text and
  // findings stay as they were.
  if (r.example !== true && normalized.split("\r\n").some((l) => l.trim() === CONFIG.EXAMPLE_HEADER_LINE))
    E(
      "The template still starts with the example header (" + CONFIG.EXAMPLE_HEADER_LINE +
        "). Replace it with your own tested configuration header.",
      TPL,
    );
  if (normalized.length > MAX_GENERATED_CHARS)
    E(
      "Generated config exceeds " +
        MAX_GENERATED_CHARS +
        " characters (" +
        normalized.length +
        "). Reduce template/ports — refused (not truncated).",
      TPL,
    );
  else if (normalized.length > WARN_GENERATED_CHARS)
    W(
      "Generated config is very large (" +
        normalized.length +
        " chars). Still exportable — review carefully before production use.",
      TPL,
    );
  return {
    text: normalized,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    asciiIssue,
    // De-duplicated like errors/warnings (level + text, first wins).
    findings: findings.filter((f, i) => findings.findIndex((g) => g.level === f.level && g.text === f.text) === i),
  };
}
