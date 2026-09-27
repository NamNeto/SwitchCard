// --- Validation helpers ---
function ipv4(v) {
  return (
    /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(v) &&
    v.split(".").every((x) => +x <= 255)
  );
}
function vlan(v) {
  return /^\d+$/.test(v) && +v >= 1 && +v <= 4094;
}
function vlans(v) {
  return (
    !!(v || "").trim() &&
    v.split(",").every((p) => {
      const q = p.trim().split("-").map((x) => x.trim());
      return q.length <= 2 && q.every(vlan) && (q.length === 1 || +q[0] <= +q[1]);
    })
  );
}
function parseVlanList(v) {
  const out = [];
  for (const part of String(v || "").split(",")) {
    const p = part.trim();
    if (!p) continue;
    const q = p.split("-").map((x) => x.trim());
    if (q.length === 1) {
      if (vlan(q[0])) out.push(+q[0]);
    } else if (q.length === 2 && vlan(q[0]) && vlan(q[1]) && +q[0] <= +q[1]) {
      for (let i = +q[0]; i <= +q[1]; i++) out.push(i);
    }
  }
  return out;
}
// Control characters (CR/LF/tab/etc.) are never valid in a
// port VLAN field; trunk lists are emitted in canonical comma-joined form.
function hasVlanControlChars(v) {
  return /[\x00-\x1f\x7f]/.test(String(v || ""));
}
// Characters that look different (or invisible) in review than on the switch:
// C0 controls except tab/LF (and CR only as part of CRLF), DEL, C1 controls (incl. U+0085
// NEL), Unicode line/paragraph separators, zero-width and bidi controls, BOM.
function invisibleCharRe() {
  return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u061C\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|\r(?!\n)/;
}
// Wider set of invisible / non-standard-space characters that are
// stripped from single-line fields (input + open). Output is whole-file ASCII.
function hiddenCharRe() {
  return /[\x00-\x08\x0B-\x1F\x7F-\x9F\u00A0\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u1680\u180B-\u180F\u2000-\u200F\u2028-\u202F\u205F-\u2064\u2066-\u206F\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u2800\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
}
function describeChar(ch) {
  const code = ch.codePointAt(0);
  const hex = "U+" + code.toString(16).toUpperCase().padStart(4, "0");
  const names = { 0x09: "tab", 0x0d: "bare CR", 0xa0: "no-break space", 0xad: "soft hyphen", 0x61c: "Arabic letter mark (bidi)", 0x2011: "non-breaking hyphen", 0x2013: "en dash", 0x2014: "em dash", 0x2018: "curly quote", 0x2019: "curly quote", 0x201c: "curly quote", 0x201d: "curly quote", 0xb7: "middle dot", 0x3000: "ideographic space", 0xfeff: "BOM" };
  let label = names[code];
  if (!label) {
    if (code >= 0x400 && code <= 0x52f) label = "Cyrillic letter (looks like Latin?)";
    else if (code >= 0x370 && code <= 0x3ff) label = "Greek letter (looks like Latin?)";
    else if (code >= 0xe0000 && code <= 0xe007f) label = "invisible tag character";
    else if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) label = "control character";
    else if (code >= 0x2000 && code <= 0x206f) label = "special space/format character";
    else label = "non-ASCII character '" + ch + "'";
  }
  return label + " (" + hex + ")";
}
// Cleans a single-line field instead of refusing it. Line breaks, tabs and
// non-standard spaces become one space; other invisible characters are removed.
function sanitizeSingleLine(v) {
  const s = String(v == null ? "" : v);
  const out = s
    .replace(/\r\n|[\t\r\n\x0B\x0C\u0085\u2028\u2029\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(hiddenCharRe(), "");
  return { text: out, changed: out !== s };
}
// Finds the first character outside printable ASCII in the WHOLE generated file (comments too).
// Tabs have already become ASCII spaces. Columns count Unicode code points.
function findCommandCharIssue(text) {
  const lines = String(text || "").split(/\r\n|\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const comment = /^[ ]*!/.test(ln);
    const re = /[^\x20-\x7E]/gu;
    const m = re.exec(ln);
    if (m) return { line: i + 1, col: [...ln.slice(0, m.index)].length + 1, ch: m[0], label: describeChar(m[0]), comment, lineText: ln };
  }
  return null;
}
function findInvisibleChar(text) {
  const s = String(text == null ? "" : text);
  const m = invisibleCharRe().exec(s);
  if (!m) return null;
  const before = s.slice(0, m.index);
  let line = 1,
    lineStart = 0;
  const br = /\r\n|\n/g;
  let b;
  while ((b = br.exec(before))) {
    line++;
    lineStart = b.index + b[0].length;
  }
  const code = m[0].charCodeAt(0);
  const hex = "U+" + code.toString(16).toUpperCase().padStart(4, "0");
  const names = { 0x0d: "bare CR", 0x0b: "vertical tab", 0x0c: "form feed", 0x85: "NEL", 0x2028: "line separator", 0x2029: "paragraph separator", 0xfeff: "BOM/zero-width no-break space", 0x00: "NUL" };
  let label = names[code] || (code >= 0x200b && code <= 0x200f ? "zero-width/direction mark" : code >= 0x202a && code <= 0x2069 && code !== 0x2060 ? "bidi control" : "control character");
  return { index: m.index, line, col: [...s.slice(lineStart, m.index)].length + 1, code, label: label + " (" + hex + ")" };
}
function invisibleCharMessage(where, hit) {
  return (
    where + " contains an invisible character: " + hit.label + " at line " + hit.line + ", column " + hit.col + "."
  );
}
// Single-line field check: any control char (incl. tab/CR/LF) or invisible Unicode.
function singleLineBad(v) {
  const s = String(v == null ? "" : v);
  return /[\x00-\x1f\x7f]/.test(s) || !!findInvisibleChar(s);
}
function isReservedVlan(id) {
  return CONFIG.RESERVED_VLANS.includes(+id);
}
// Canonical VLAN id text: trims, strips leading zeros ("007" -> "7"); invalid input unchanged.
function normalizeVlanId(v) {
  const t = String(v == null ? "" : v).trim();
  return vlan(t) ? String(+t) : String(v == null ? "" : v);
}
function normalizeTrunkVlanList(v) {
  const raw = String(v || "");
  if (hasVlanControlChars(raw) || !vlans(raw)) return raw;
  return raw
    .split(",")
    .map((part) =>
      part
        .trim()
        .split("-")
        .map((x) => String(+x.trim()))
        .join("-"),
    )
    .join(",");
}
function portVlanErrors(r) {
  // Validate Access/Trunk VLANs whenever the template consumes them
  // ({{VLANS}}, {{VLAN}} or {{PORTS}}) — not only when {{PORTS}} is present — so a bad
  // value blocks export instead of being silently dropped by collectLayer2Vlans.
  const errors = [];
  const tk = keys(r.template || "");
  if (!(tk.includes("PORTS") || tk.includes("VLANS") || tk.includes("VLAN"))) return errors;
  const ifaceSet = new Set((r.interfaces || []).map((n) => String(n).toLowerCase()));
  for (const p of r.ports || []) {
    if (!ifaceSet.has(String(p.name || "").toLowerCase())) continue;
    const v = typeof p.vlan === "string" ? p.vlan : "";
    if (p.role !== "access" && p.role !== "trunk") continue;
    if (hasVlanControlChars(v) || findInvisibleChar(v)) {
      errors.push(
        p.name + ": VLAN contains control characters (line breaks/tabs) — enter it on one line.",
      );
      continue;
    }
    // Surrounding spaces are accepted (trimmed); leading zeros are normalized on output.
    if (p.role === "access" && !vlan(v.trim()))
      errors.push(p.name + ": access VLAN must be 1–4094 (got \"" + v + "\").");
    else if (p.role === "access" && isReservedVlan(v.trim()))
      errors.push(
        p.name + ": access VLAN " + +v.trim() + " is reserved (1002–1005 are FDDI/Token Ring defaults) — pick another VLAN.",
      );
    if (p.role === "trunk" && v.trim() && !vlans(v))
      errors.push(
        p.name + ": optional Trunk VLAN list must look like 10,20,30-40 (got \"" + v + "\").",
      );
  }
  return errors;
}
// ids = VLANs that get "vlan N" lines (reserved 1002-1005 excluded); reserved =
// reserved ids that appeared in trunk lists (reported as a warning).
function collectLayer2VlanInfo(r) {
  const set = new Set(),
    reserved = new Set();
  const add = (id) => (isReservedVlan(id) ? reserved.add(id) : set.add(id));
  // Only a BOUND management VLAN (a visible Build field) creates a vlan line; a stale value left
  // in a recipe whose template no longer uses MGMT_VLAN must not emit hidden configuration.
  const mv = ((r.values && r.values.MGMT_VLAN) || "").trim();
  if (vlan(mv) && deviceKeys(r).includes("MGMT_VLAN")) add(+mv);
  const ifaceSet = new Set((r.interfaces || []).map((n) => String(n).toLowerCase()));
  for (const p of r.ports || []) {
    if (!ifaceSet.has(String(p.name || "").toLowerCase())) continue;
    if (p.role === "access" && vlan((p.vlan || "").trim())) add(+p.vlan.trim());
    if (p.role === "trunk" && !hasVlanControlChars(p.vlan)) {
      for (const id of parseVlanList(p.vlan)) add(id);
    }
  }
  return {
    ids: [...set].sort((a, b) => a - b),
    reserved: [...reserved].sort((a, b) => a - b),
  };
}
function collectLayer2Vlans(r) {
  // Invalid values are skipped here, but generate() reports them via portVlanErrors
  // so export is blocked rather than silently omitting a VLAN.
  return collectLayer2VlanInfo(r).ids;
}
function formatVlansBlock(ids) {
  if (!ids.length) return "! No Layer-2 VLANs collected yet";
  return ids.map((id) => "vlan " + id + "\n!").join("\n");
}
function substitute(t, values) {
  return t.replace(/{{\s*([A-Z][A-Z0-9_]*)\s*}}/g, (_, k) =>
    Object.hasOwn(values, k) ? values[k] : "{{" + k + "}}",
  );
}
// --- IPv4 helpers (addresses as unsigned 32-bit integers) ---
function ipToInt(v) {
  return String(v)
    .split(".")
    .reduce((a, x) => a * 256 + +x, 0);
}
function intToIp(n) {
  return [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join(".");
}
function contiguousMask(m) {
  return (
    ipv4(m) &&
    /^1+0*$/.test(
      m
        .split(".")
        .map((x) => (+x).toString(2).padStart(8, "0"))
        .join(""),
    )
  );
}
function maskPrefix(m) {
  return m
    .split(".")
    .map((x) => (+x).toString(2).padStart(8, "0"))
    .join("")
    .replace(/0+$/, "").length;
}
function subnetOf(ip, prefix) {
  const size = 2 ** (32 - prefix);
  const net = Math.floor(ipToInt(ip) / size) * size;
  return { net, bcast: net + size - 1, prefix };
}
// Clearly unusable as a host address (hard error)
function hostAddressProblem(ip) {
  const a = +String(ip).split(".")[0];
  if (ip === "255.255.255.255") return "is the limited broadcast address";
  if (a === 0) return "is in 0.0.0.0/8 (not a usable host address)";
  if (a === 127) return "is a loopback address";
  if (a >= 224 && a <= 239) return "is a multicast address";
  if (a >= 240) return "is in the reserved 240.0.0.0/4 range";
  return "";
}
// Network/broadcast of its own subnet (only meaningful for /0–/30)
function subnetEdgeProblem(ip, prefix) {
  if (prefix > 30) return "";
  const s = subnetOf(ip, prefix);
  const n = ipToInt(ip);
  if (n === s.net) return "is the network address of " + intToIp(s.net) + "/" + prefix;
  if (n === s.bcast) return "is the broadcast address of " + intToIp(s.net) + "/" + prefix;
  return "";
}
// Soft check that interface names have the slot depth of the model family.
function interfaceFamilyMismatches(r) {
  const depth = r.model === "IE9300" ? 2 : 1; // IE9300 Gi1/0/x; IE3100/IE3x00 Gi1/x
  return (r.interfaces || []).filter((n) => {
    const s = String(n);
    if (!s.includes("/")) return false; // Vlan1, Port-channel1 etc. are not port names
    return (s.match(/\//g) || []).length !== depth;
  });
}
// --- SHA-256 in plain JS. Synchronous on purpose: generate() (provenance footer) and the
// export confirm need the hash inline, and crypto.subtle only offers an async API. ---
function sha256Hex(str) {
  return sha256Bytes(enc.encode(String(str)));
}
// Same hash over raw bytes (fingerprints fall back to this when crypto.subtle is unavailable).
function sha256Bytes(bytes) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000), false);
  dv.setUint32(total - 4, (len * 8) >>> 0, false);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}
// --- Preview / export summary helpers (pure) ---
function previewLineCount(text) {
  // A lone CR counts as a line break here (the switch parser may treat it as one).
  const n = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n$/, "");
  if (!n) return 0;
  return n.split(/\r|\n/).length;
}
function previewByteLength(text) {
  return enc.encode(String(text || "")).length;
}
function previewSizeLabel(text) {
  return "Lines: " + previewLineCount(text) + " · Bytes: " + previewByteLength(text);
}
function boundIdentityLabel(r, key) {
  const dkeys = deviceKeys(r);
  if (!dkeys.includes(key)) return "NOT SET (not bound in template)";
  const raw = (r.values && r.values[key]) || "";
  const v = String(raw).trim();
  if (!v) return "NOT SET";
  return v;
}
function exportHostnameForFile(r) {
  const dkeys = deviceKeys(r);
  if (!dkeys.includes("HOSTNAME")) return "switch";
  const v = String((r.values && r.values.HOSTNAME) || "").trim();
  if (!v) return "switch";
  return v.replace(/[^a-zA-Z0-9_-]+/g, "_");
}
function exportConfirmSummary(r, g) {
  const lines = [
    "Export SD-card ZIP with this editcontent.txt?",
    "",
    "Recipe: " + (r.name || "(unnamed)"),
    "Hostname: " + boundIdentityLabel(r, "HOSTNAME"),
    "MGMT_IP: " + boundIdentityLabel(r, "MGMT_IP"),
    "GATEWAY: " + boundIdentityLabel(r, "GATEWAY"),
  ];
  const dkeys = deviceKeys(r);
  if (dkeys.includes("MGMT_VLAN"))
    lines.push("MGMT_VLAN: " + boundIdentityLabel(r, "MGMT_VLAN"));
  if (dkeys.includes("MGMT_LOOPBACK"))
    lines.push("MGMT_LOOPBACK: " + boundIdentityLabel(r, "MGMT_LOOPBACK"));
  if (usesMgmtInterface(r))
    lines.push(
      "Management interface: " +
        (mgmtInterfaceMode(r) === "loopback"
          ? "Loopback" + boundIdentityLabel(r, "MGMT_LOOPBACK") + " (Loopback mode)"
          : "Vlan" + boundIdentityLabel(r, "MGMT_VLAN") + " (SVI mode)"),
    );
  // Every other bound per-device value is listed too (e.g. NTP_SERVER), operational ones first.
  const shown = ["HOSTNAME", "MGMT_IP", "GATEWAY", "MGMT_VLAN", "MGMT_LOOPBACK", ...CONFIG.RESERVED_VALUE_KEYS];
  const operational = new Set(effectiveTemplateTexts(r).flatMap((t) => keys(
    t.replace(/\t/g, " ").split(/\r?\n/).filter((ln) => !/^[ ]*!/.test(ln)).join("\n"),
  )));
  const others = dkeys.filter((k) => !shown.includes(k))
    .sort((a, b) => Number(operational.has(b)) - Number(operational.has(a)));
  for (const k of others) lines.push(k + ": " + boundIdentityLabel(r, k));
  lines.push(
    "Preview: " + previewSizeLabel(g.text),
    "editcontent.txt SHA-256: " + sha256Hex(g.text),
    "Options: header/footer comments " +
      (r.provenanceComments ? "ON" : "off") +
      ", default interface " +
      (r.defaultInterface ? "ON" : "off"),
    "Baseline: " +
      (baseline
        ? baseline.model + " / " + baseline.version
        : "(none)"),
    "Baseline fingerprint: " +
      (baseline && baseline.fingerprint
        ? baseline.fingerprint.digest.slice(0, 16) + "… " + (baseline.compare ? baseline.compare.summary : "(no project record to compare with)")
        : "(none)"),
    "",
    "Root editcontent.txt in the ZIP is exactly this preview text.",
    "",
    "Cancel = no download.",
  );
  return lines.join("\n");
}
// Config text without comments and "no ..." lines, for the soft security-marker checks.
function positiveConfigText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t || t.startsWith("!")) return false;
      if (/^no\s+/i.test(t)) return false;
      return true;
    })
    .join("\n");
}
// Printable-ASCII, single-line text for the optional provenance comment
function commentSafe(v, max) {
  return String(v == null ? "" : v)
    .replace(/[\u00B7\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e]/g, "?")
    .slice(0, max);
}
