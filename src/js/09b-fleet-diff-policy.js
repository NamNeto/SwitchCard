// --- v0.7.0 helpers: transliteration, team policy rules, export history + line diff, baseline
//     fingerprints, fleet export, interface-brief parsing, theme. Pure functions first; the ones
//     that touch the DOM say so. Event wiring stays in 10-events-boot.js. ---

// Common Latin-1 letters and typographic punctuation -> printable ASCII. German umlauts use the
// ue/oe/ae/ss convention; other accented letters lose their marks (NFKD); dashes, quotes and odd
// spaces become their ASCII forms; invisible characters vanish. Anything else is left alone and
// still blocks export, so the helper never hides a character it cannot translate.
const TRANSLIT = Object.freeze({
  "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss",
  "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE", "ø": "o", "Ø": "O",
  "đ": "d", "Đ": "D", "ł": "l", "Ł": "L", "þ": "th", "Þ": "Th",
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "−": "-", "·": "-", "•": "-",
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
  "…": "...", "×": "x", "«": "<<", "»": ">>", "‹": "<", "›": ">",
  " ": " ", " ": " ", " ": " ", "　": " ",
});
function transliterateAscii(s) {
  let out = "";
  for (const ch of String(s == null ? "" : s)) out += Object.hasOwn(TRANSLIT, ch) ? TRANSLIT[ch] : ch;
  out = out.replace(hiddenCharRe(), "");
  return out.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

// --- Team policy rules: "require <regex>" / "forbid <regex>" [  # note], one per line ---
// Matched line by line (case-insensitive) against the generated text without "!" comments and
// "no ..." lines. A failing OR invalid rule blocks export (fail closed); hints never block.
function parsePolicyLine(line) {
  const raw = String(line || "").trim();
  if (!raw || raw.startsWith("#")) return null;
  const m = /^(require|forbid)\s+(.+?)\s*$/i.exec(raw);
  if (!m) return { error: 'Rule must start with "require" or "forbid": ' + raw };
  let pattern = m[2],
    note = "";
  const hash = pattern.indexOf(" #");
  if (hash >= 0) {
    note = pattern.slice(hash + 2).trim();
    pattern = pattern.slice(0, hash).trim();
  }
  if (!pattern) return { error: "Rule has no pattern: " + raw };
  try {
    return { mode: m[1].toLowerCase(), pattern, note, re: new RegExp(pattern, "im") };
  } catch (e) {
    return { error: 'Invalid pattern "' + pattern + '": ' + (e && e.message ? e.message : e) };
  }
}
function policyViolations(text, rules) {
  const out = [];
  const body = positiveConfigText(text);
  for (const line of rules || []) {
    const p = parsePolicyLine(line);
    if (!p) continue;
    if (p.error) {
      out.push(p.error + " (fix or remove the rule)");
      continue;
    }
    const hit = p.re.test(body);
    const why = p.note ? " (" + p.note + ")" : "";
    if (p.mode === "require" && !hit) out.push("required pattern not found: " + p.pattern + why);
    if (p.mode === "forbid" && hit) out.push("forbidden pattern present: " + p.pattern + why);
  }
  return out;
}
function boundedPolicies(text) {
  const all = lines(text).filter((h) => !singleLineBad(h));
  const out = all.slice(0, CONFIG.MAX_TEAM_POLICIES).map((h) => h.slice(0, CONFIG.MAX_TEAM_POLICY_CHARS));
  return {
    rules: out,
    trimmed: out.length !== lines(text).length || all.some((h) => h.length > CONFIG.MAX_TEAM_POLICY_CHARS),
  };
}

// --- Export history per recipe and hostname: the last exported text, for "changes since" ---
function exportHistoryKey(host) {
  const k = String(host || "").trim().toLowerCase();
  return k || null;
}
function recordExport(r, host, text) {
  const key = exportHistoryKey(host);
  if (!key) return;
  if (!r.exports || typeof r.exports !== "object") r.exports = {};
  r.exports[key] = { host: String(host).trim(), at: new Date().toISOString(), release: RELEASE, sha256: sha256Hex(text), text };
  pruneExportHistory(r);
}
// Newest first; bounded by count and by total text size so autosave never outgrows storage.
function pruneExportHistory(r) {
  const entries = Object.entries(r.exports || {}).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)));
  const kept = {};
  let chars = 0;
  for (const [k, e] of entries) {
    const n = String(e.text || "").length;
    if (Object.keys(kept).length >= CONFIG.MAX_EXPORT_HISTORY || chars + n > CONFIG.MAX_EXPORT_HISTORY_CHARS) continue;
    kept[k] = e;
    chars += n;
  }
  r.exports = kept;
}

// --- Line diff (Myers, O(ND)). Returns [{ t: " " | "-" | "+", s }] or null when too large. ---
function lineDiff(aText, bText) {
  const split = (t) => String(t || "").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const a = split(aText),
    b = split(bText);
  const N = a.length,
    M = b.length,
    MAX = N + M;
  if (MAX > CONFIG.MAX_DIFF_LINES) return null;
  const off = MAX + 1;
  const v = new Int32Array(2 * MAX + 3);
  const trace = [];
  let done = false;
  for (let d = 0; d <= MAX && !done; d++) {
    if (d > CONFIG.MAX_DIFF_EDITS) return null;
    trace.push(v.slice(off - d - 1, off + d + 2)); // k in [-d-1, d+1] stored at k + d + 1
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= N && y >= M) {
        done = true;
        break;
      }
    }
  }
  const ops = [];
  let x = N,
    y = M;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vv = trace[d],
      base = d + 1,
      k = x - y;
    const prevK = k === -d || (k !== d && vv[base + k - 1] < vv[base + k + 1]) ? k + 1 : k - 1;
    const prevX = vv[base + prevK],
      prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ t: " ", s: a[x - 1] });
      x--;
      y--;
    }
    if (d > 0) ops.push(x === prevX ? { t: "+", s: b[y - 1] } : { t: "-", s: a[x - 1] });
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}
// DOM: the "Changes since the last export" panel under the preview (Build).
function renderDiffPanel(r, g) {
  const panel = $("diffPanel");
  if (!panel) return;
  const key = exportHistoryKey(r.values && r.values.HOSTNAME);
  const prev = key && r.exports && Object.hasOwn(r.exports, key) ? r.exports[key] : null;
  if (!prev || g.errors.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const out = $("diffOut");
  out.replaceChildren();
  const when = " (" + formatSavedAt(prev.at) + ", v" + prev.release + ")";
  if (prev.text === g.text) {
    $("diffSummary").textContent = "Identical to the last export for " + prev.host + when;
    out.textContent = "No differences.";
    return;
  }
  const ops = lineDiff(prev.text, g.text);
  if (!ops) {
    $("diffSummary").textContent = "Changed since the last export for " + prev.host + when;
    out.textContent = "Too large to diff here; compare the SHA-256 values instead (last export " + prev.sha256.slice(0, 16) + "…).";
    return;
  }
  let added = 0,
    removed = 0;
  const keep = new Set();
  ops.forEach((o, i) => {
    if (o.t === " ") return;
    for (let j = Math.max(0, i - 2); j <= Math.min(ops.length - 1, i + 2); j++) keep.add(j);
  });
  const frag = document.createDocumentFragment();
  let last = -1;
  ops.forEach((o, i) => {
    if (!keep.has(i)) return;
    if (last >= 0 && i !== last + 1) frag.append(document.createTextNode("…\n"));
    const span = document.createElement("span");
    if (o.t === "+") {
      span.className = "add";
      added++;
    } else if (o.t === "-") {
      span.className = "del";
      removed++;
    }
    span.textContent = o.t + " " + o.s + "\n";
    frag.append(span);
    last = i;
  });
  out.append(frag);
  $("diffSummary").textContent = "Changes since the last export for " + prev.host + when + " · +" + added + " / -" + removed + " lines";
}

// --- Baseline fingerprints: per-file SHA-256 plus one digest over the sorted list ---
function hexOf(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function fingerprintFiles(files, label) {
  const list = [];
  let total = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const buf = await f.blob.arrayBuffer();
    const sha = crypto.subtle ? hexOf(await crypto.subtle.digest("SHA-256", buf)) : sha256Bytes(new Uint8Array(buf));
    list.push({ path: f.path, size: f.blob.size, sha256: sha });
    total += f.blob.size;
    if (i % 25 === 0 || i === files.length - 1) {
      message((label || "Fingerprinting") + " " + (i + 1) + " / " + files.length + ": " + f.path);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  list.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
  return { fileCount: list.length, totalBytes: total, digest: fingerprintDigest(list), files: list };
}
function fingerprintDigest(list) {
  return sha256Hex(list.map((f) => f.path.toLowerCase() + "\n" + f.size + "\n" + f.sha256).join("\n"));
}
// What Save project / team package record for a loaded baseline: metadata and hashes, never bytes.
function baselineRecord(b) {
  const rec = { model: b.model, version: b.version };
  if (b.fingerprint && typeof b.fingerprint.digest === "string") {
    rec.fingerprint = { fileCount: b.fingerprint.fileCount, totalBytes: b.fingerprint.totalBytes, digest: b.fingerprint.digest };
    if (Array.isArray(b.fingerprint.files) && b.fingerprint.files.length <= CONFIG.MAX_FINGERPRINT_FILES)
      rec.fingerprint.files = b.fingerprint.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 }));
  }
  return rec;
}
function compareFingerprints(expected, actual) {
  if (!expected || !actual) return null;
  if (expected.digest === actual.digest) return { same: true, summary: "matches the project's recorded baseline", added: [], removed: [], changed: [] };
  const res = { same: false, added: [], removed: [], changed: [] };
  if (Array.isArray(expected.files) && Array.isArray(actual.files)) {
    const em = new Map(expected.files.map((f) => [f.path.toLowerCase(), f]));
    const am = new Map(actual.files.map((f) => [f.path.toLowerCase(), f]));
    for (const [k, f] of am) {
      if (!em.has(k)) res.added.push(f.path);
      else if (em.get(k).sha256 !== f.sha256 || em.get(k).size !== f.size) res.changed.push(f.path);
    }
    for (const [k, f] of em) if (!am.has(k)) res.removed.push(f.path);
    res.summary =
      "DIFFERS from the project's recorded baseline (" + res.changed.length + " changed, " + res.added.length + " added, " + res.removed.length + " missing)";
  } else {
    res.summary = "DIFFERS from the project's recorded baseline (" + expected.fileCount + " files recorded, " + actual.fileCount + " loaded)";
  }
  return res;
}

// --- Fleet: one recipe, many switches. Values per switch come from a CSV; everything else
//     (template, ports, checks, gates) is exactly the single-card path. ---
function parseCsv(text) {
  const s = String(text || "").replace(/^﻿/, "");
  const first = s.split(/\r?\n/)[0] || "";
  const counts = [",", ";", "\t"].map((d) => [d, (first.split(d).length - 1)]);
  counts.sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ",";
  const rows = [];
  let row = [],
    cell = "",
    q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
      continue;
    }
    if (c === '"') {
      q = true;
      continue;
    }
    if (c === delim) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return { header: [], rows: [], delimiter: delim };
  const header = nonEmpty[0].map((h) => sanitizeSingleLine(h).text.trim().toUpperCase().replace(/[\s-]+/g, "_"));
  return {
    header,
    rows: nonEmpty.slice(1).map((r) => r.map((c) => sanitizeSingleLine(c).text.trim())),
    delimiter: delim,
  };
}
// Pure apart from reading teamPolicies: builds one recipe clone per CSV row and runs generate().
function checkFleet(r, csvText) {
  const result = { errors: [], warnings: [], rows: [], header: [] };
  const parsed = parseCsv(csvText);
  if (!parsed.header.length) {
    result.errors.push("Paste a CSV with a header row first.");
    return result;
  }
  const dkeys = deviceKeys(r);
  const bad = parsed.header.filter((h) => !/^[A-Z][A-Z0-9_]*$/.test(h));
  if (bad.length) {
    result.errors.push("Header names must be placeholder names such as HOSTNAME (got: " + bad.join(", ") + ").");
    return result;
  }
  if (new Set(parsed.header).size !== parsed.header.length) {
    result.errors.push("Duplicate column names in the header.");
    return result;
  }
  const reserved = parsed.header.filter((h) => CONFIG.RESERVED_VALUE_KEYS.includes(h) || CONFIG.DERIVED_KEYS.includes(h) || ["PORTS", "VLANS"].includes(h));
  if (reserved.length) {
    result.errors.push("Columns " + reserved.join(", ") + " are filled by SwitchCard and cannot be set per switch.");
    return result;
  }
  const unknown = parsed.header.filter((h) => !dkeys.includes(h));
  if (unknown.length) result.warnings.push("Columns not used by this recipe are ignored: " + unknown.join(", ") + ".");
  if (!parsed.rows.length) {
    result.errors.push("The CSV has a header but no switch rows.");
    return result;
  }
  if (parsed.rows.length > CONFIG.MAX_FLEET_ROWS) {
    result.errors.push("At most " + CONFIG.MAX_FLEET_ROWS + " switches per fleet (got " + parsed.rows.length + ").");
    return result;
  }
  const usedCols = parsed.header.map((h, i) => [h, i]).filter(([h]) => dkeys.includes(h));
  if (!usedCols.length) {
    result.errors.push("No column matches a field of this recipe (" + dkeys.join(", ") + ").");
    return result;
  }
  result.header = usedCols.map(([h]) => h);
  const seenHost = new Map(),
    seenIp = new Map();
  parsed.rows.forEach((cells, idx) => {
    const n = idx + 1;
    const rr = structuredClone(r);
    rr.exports = {};
    const values = {},
      inherited = [];
    for (const [h, i] of usedCols) {
      const c = cells[i] === undefined ? "" : cells[i];
      if (c !== "") rr.values[h] = c;
      else inherited.push(h);
      values[h] = String(rr.values[h] || "");
    }
    normalizePorts(rr);
    const g = generate(rr);
    const errors = [...g.errors];
    const host = String(rr.values.HOSTNAME || "").trim(),
      ip = String(rr.values.MGMT_IP || "").trim();
    if (dkeys.includes("HOSTNAME") && host) {
      const k = host.toLowerCase();
      if (seenHost.has(k)) errors.push("duplicate HOSTNAME (also row " + seenHost.get(k) + ")");
      else seenHost.set(k, n);
    }
    if (dkeys.includes("MGMT_IP") && ip) {
      if (seenIp.has(ip)) errors.push("duplicate MGMT_IP (also row " + seenIp.get(ip) + ")");
      else seenIp.set(ip, n);
    }
    const policy = errors.length ? [] : policyViolations(g.text, teamPolicies);
    result.rows.push({
      n, values, inherited, host, ip, errors, policy, warnings: g.warnings, text: g.text,
      sha256: sha256Hex(g.text), lines: previewLineCount(g.text), bytes: previewByteLength(g.text), recipe: rr,
    });
  });
  return result;
}
// Recognises when a checked fleet no longer matches the recipe, values, policies or CSV.
function fleetStamp(r) {
  const { exports: _history, ...rest } = r;
  return quickHash(JSON.stringify([rest, teamPolicies, baseline ? baseline.version : null, $("fleetCsv") ? $("fleetCsv").value : ""]));
}
// DOM: the fleet table and summary on Build.
function renderFleet(result) {
  const sum = $("fleetSummary"),
    table = $("fleetTable"),
    head = $("fleetHead"),
    body = $("fleetRows");
  if (!sum || !table) return;
  head.replaceChildren();
  body.replaceChildren();
  if (!result) {
    sum.hidden = true;
    table.hidden = true;
    return;
  }
  sum.hidden = false;
  const badRows = result.rows.filter((x) => x.errors.length || x.policy.length).length;
  if (result.errors.length) sum.replaceChildren(statusNotice("error", "Fleet CSV cannot be used", [...result.errors, ...result.warnings]));
  else if (badRows) sum.replaceChildren(statusNotice("error", badRows + " of " + result.rows.length + " switches have errors", result.warnings));
  else
    sum.replaceChildren(
      statusNotice(result.warnings.length ? "warning" : "ok", result.rows.length + " switch" + (result.rows.length === 1 ? "" : "es") + " ready", result.warnings,
        "Every row passed the same checks as a single card; review notes per row are in the Result column tooltip."),
    );
  if (!result.rows.length) {
    table.hidden = true;
    return;
  }
  table.hidden = false;
  const tr = document.createElement("tr");
  for (const t of ["#", ...result.header, "Result", "Lines", "SHA-256"]) {
    const th = document.createElement("th");
    th.textContent = t;
    tr.append(th);
  }
  head.append(tr);
  for (const row of result.rows) {
    const el = document.createElement("tr");
    const add = (text, cls, title) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      if (title) td.title = title;
      el.append(td);
    };
    add(String(row.n));
    for (const h of result.header) {
      const inh = row.inherited.includes(h);
      add(row.values[h] || (inh ? "(empty)" : ""), inh ? "inherit" : "", inh ? "inherited from Device details" : "");
    }
    const problems = [...row.errors, ...row.policy.map((p) => "Team policy: " + p)];
    if (problems.length) add(problems[0] + (problems.length > 1 ? " (+" + (problems.length - 1) + " more)" : ""), "bad", problems.join("\n"));
    else add("OK" + (row.warnings.length ? " · " + row.warnings.length + " note" + (row.warnings.length === 1 ? "" : "s") : ""), "ok", row.warnings.join("\n"));
    add(String(row.lines));
    add(row.sha256.slice(0, 16) + "…", "mono", row.sha256);
    body.append(el);
  }
}
// DOM: enable the fleet export buttons only when the checked fleet is current and every gate passes.
function refreshFleetButtons() {
  const btn = $("exportFleet"),
    btnText = $("exportFleetText"),
    why = $("fleetWhy");
  if (!btn || !btnText || !why) return;
  const r = current();
  const reasons = [];
  if (!fleet) reasons.push("Click Check fleet first.");
  else {
    if (fleet.recipeId !== r.id || fleet.stamp !== fleetStamp(r)) reasons.push("Recipe, values, policies or CSV changed since the last check — click Check fleet again.");
    if (fleet.errors.length) reasons.push("Fix the fleet CSV.");
    const badRows = fleet.rows.filter((x) => x.errors.length || x.policy.length).length;
    if (badRows) reasons.push(badRows + " row" + (badRows === 1 ? " has" : "s have") + " errors.");
  }
  reasons.push(...blockers(r));
  if (!$("reviewed").checked) reasons.push("Check “I reviewed this configuration…” above.");
  const ok = !reasons.length && !busy;
  btn.disabled = !ok;
  btnText.disabled = !ok;
  why.textContent = ok
    ? "Ready to export " + fleet.rows.length + " card" + (fleet.rows.length === 1 ? "" : "s") + "."
    : fleet
      ? "Fleet export blocked: " + reasons.join(" · ")
      : "Paste a CSV and click Check fleet.";
  why.style.color = ok ? "var(--ok,#3dd68c)" : "var(--warn)";
}
// Runs inside run(): re-checks everything from scratch, confirms, then exports one ZIP per switch
// (or one text-only ZIP) and records each switch in the recipe's export history.
async function exportFleet(textOnly) {
  const r = current();
  if (editorPending) throw Error("Apply recipe changes or Discard unapplied draft first.");
  const gates = blockers(r);
  if (gates.length) throw Error(gates[0]);
  if (!$("reviewed").checked) throw Error("Tick the review box first.");
  const res = checkFleet(r, $("fleetCsv").value);
  fleet = { ...res, recipeId: r.id, stamp: fleetStamp(r) };
  renderFleet(fleet);
  if (res.errors.length || res.rows.some((x) => x.errors.length || x.policy.length)) throw Error("The fleet has errors; nothing was exported.");
  const dkeys = deviceKeys(r);
  const lines = [
    (textOnly ? "Export ONE text-only ZIP for " : "Export ") + res.rows.length + " switch" + (res.rows.length === 1 ? "" : "es") + (textOnly ? "?" : " as separate SD-card ZIPs?"),
    "",
    "Recipe: " + r.name,
    "Baseline: " + (baseline ? baseline.model + " / " + baseline.version : "(none)"),
    "",
  ];
  for (const row of res.rows.slice(0, 20))
    lines.push(row.n + ". " + (row.host || "(no hostname)") + "  " + (row.ip || "") + "  " + row.sha256.slice(0, 16) + "…  " + row.lines + " lines");
  if (res.rows.length > 20) lines.push("… and " + (res.rows.length - 20) + " more (all listed in the manifest).");
  lines.push("", "Every editcontent.txt is exactly what Check fleet generated for that row.", "", "Cancel = no download.");
  if (!window.confirm(lines.join("\n"))) {
    message("Fleet export cancelled.");
    return;
  }
  const when = new Date();
  const manifest = ["row\thostname\tmgmt_ip\tfile\teditcontent_sha256\tlines\tbytes"];
  const folderFor = (row) => (dkeys.includes("HOSTNAME") ? exportHostnameForFile(row.recipe) : "switch-" + row.n);
  if (textOnly) {
    const files = [];
    for (const row of res.rows) {
      const folder = folderFor(row);
      files.push({ path: folder + "/editcontent.txt", blob: new Blob([row.text], { type: "text/plain" }) });
      manifest.push([row.n, row.host, row.ip, folder + "/editcontent.txt", row.sha256, row.lines, row.bytes].join("\t"));
    }
    files.push({ path: "fleet-manifest.txt", blob: new Blob([manifest.join("\r\n") + "\r\n"], { type: "text/plain" }) });
    download(await zip(files, when), "switchcard-fleet-" + RELEASE + "-text.zip");
  } else {
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows[i];
      const name = folderFor(row) + "-switchcard-" + RELEASE + "-sdcard.zip";
      message("Fleet card " + (i + 1) + " / " + res.rows.length + ": " + name);
      download(await zip(buildCardFiles({ text: row.text }), when), name);
      manifest.push([row.n, row.host, row.ip, name, row.sha256, row.lines, row.bytes].join("\t"));
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    download(new Blob([manifest.join("\r\n") + "\r\n"], { type: "text/plain" }), "switchcard-fleet-" + RELEASE + "-manifest.txt");
  }
  for (const row of res.rows) recordExport(r, row.host, row.text);
  touch();
  message(
    "Fleet export finished: " + res.rows.length + " switch" + (res.rows.length === 1 ? "" : "es") +
      (textOnly ? " in one text-only ZIP (HOSTNAME/editcontent.txt + fleet-manifest.txt)." : " as separate card ZIPs plus a manifest with every SHA-256. If the browser blocked some downloads, allow multiple downloads for this page and export again.") +
      " Each hostname's text is remembered for the next comparison; Save project to keep that.",
  );
}

// --- "show ip interface brief" / "show interfaces status" -> interface names (pure) ---
function parseInterfaceBrief(text) {
  const names = [],
    skipped = [],
    seen = new Set();
  const full = ["FastEthernet", "GigabitEthernet", "TwoGigabitEthernet", "FiveGigabitEthernet", "TenGigabitEthernet", "TwentyFiveGigE", "FortyGigabitEthernet", "HundredGigE", "AppGigabitEthernet"];
  const abbrev = { fa: "FastEthernet", gi: "GigabitEthernet", tw: "TwoGigabitEthernet", fi: "FiveGigabitEthernet", te: "TenGigabitEthernet", twe: "TwentyFiveGigE", fo: "FortyGigabitEthernet", hu: "HundredGigE", ap: "AppGigabitEthernet" };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const tok = raw.trim().split(/\s+/)[0] || "";
    const m = /^([A-Za-z][A-Za-z-]*?)(\d+(?:\/\d+)*)(\.\d+)?$/.exec(tok);
    if (!m) continue; // headers, prompts, blank lines
    if (m[3]) {
      skipped.push(tok + " (subinterface)");
      continue;
    }
    const fam = m[1],
      slots = m[2],
      key = fam.toLowerCase();
    const canon = full.find((f) => f.toLowerCase() === key) || abbrev[key];
    if (!canon) {
      skipped.push(tok + (/^(vlan|vl|loopback|lo|port-channel|po|tunnel|tu|null|nu|bluetooth|bl|mgmt)$/i.test(fam) ? "" : " (unknown type)"));
      continue;
    }
    if (canon === "AppGigabitEthernet") {
      skipped.push(tok + " (app-hosting port)");
      continue;
    }
    if (canon === "GigabitEthernet" && slots === "0/0") {
      skipped.push(tok + " (out-of-band management port)");
      continue;
    }
    const name = canon + slots;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return { names, skipped };
}

// --- Theme (DOM). "auto" follows the OS; the choice lives under CONFIG.THEME_KEY. ---
function loadThemePref() {
  try {
    const t = localStorage.getItem(CONFIG.THEME_KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch (e) {
    return "auto";
  }
}
function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === "light" || pref === "dark") root.dataset.theme = pref;
  else delete root.dataset.theme;
  const sel = $("themeSelect");
  if (sel) sel.value = pref === "light" || pref === "dark" ? pref : "auto";
}

// --- Literal L3 interfaces in generated text (advisory reachability only) ---
function literalL3Subnets(text, excludeInterface) {
  const out = [];
  let cur = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trimEnd();
    const im = /^interface (\S+)/i.exec(line);
    if (im) {
      cur = im[1];
      continue;
    }
    if (!/^\s/.test(raw) && line && !line.startsWith("!")) cur = null; // left the interface block
    const am = /^ ip address (\d+\.\d+\.\d+\.\d+) (\d+\.\d+\.\d+\.\d+)$/i.exec(line);
    if (!am || !cur) continue;
    if (excludeInterface && cur.toLowerCase() === String(excludeInterface).toLowerCase()) continue;
    if (!ipv4(am[1]) || !contiguousMask(am[2])) continue;
    const prefix = maskPrefix(am[2]);
    if (prefix < 1) continue;
    out.push({ label: cur + " (literal)", ...subnetOf(am[1], prefix) });
  }
  return out;
}
