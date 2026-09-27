// --- Baseline files and ZIP I/O ---
// Own minimal ZIP writer/reader: STORE method only (no compression), CRC32, local headers +
// central directory + EOCD. Keeps the file dependency-free and the output byte-predictable.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function validPath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.length > 1000 ||
    path.includes("\\") ||
    /[\x00-\x1f\x7f:]/.test(path) ||
    path
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[. ]$/.test(p) ||
          /[<>"|?*]/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p),
      )
  )
    throw Error("Unsupported archive path: " + path);
  return path;
}
// A baseline must contain more than a lone editcontent.txt (i.e. real firmware files).
function assertBaselineComplete(files, kind) {
  const list = files || [];
  if (!list.length)
    throw Error(
      (kind || "Baseline") + " has no files. Load a complete sync export / firmware folder.",
    );
  if (!list.some((f) => String(f.path || "").toLowerCase() !== "editcontent.txt"))
    throw Error(
      (kind || "Baseline") +
        " must include at least one file besides root editcontent.txt (complete sync export).",
    );
  if (list.some((f) => String(f.path || "").toLowerCase().startsWith("editcontent.txt/")))
    throw Error(
      "A root folder is named editcontent.txt; it conflicts with the generated file.",
    );
}
function checkFiles(files) {
  if (!files.length) throw Error("No baseline files found.");
  if (files.length > MAX_BASELINE_FILES) throw Error("Too many files for this prototype.");
  let total = 0;
  const seen = new Set();
  for (const f of files) {
    validPath(f.path);
    const key = f.path.toLowerCase();
    if (seen.has(key)) throw Error("Duplicate file path: " + f.path);
    seen.add(key);
    total += f.blob.size;
  }
  for (const path of seen) {
    const parts = path.split("/");
    parts.pop();
    while (parts.length) {
      if (seen.has(parts.join("/"))) throw Error("A file conflicts with a folder path.");
      parts.pop();
    }
  }
  if (total > MAX) throw Error("This prototype supports up to 1 GiB per archive.");
}
// ZIP entry timestamps: DOS date/time format (local clock, 2-second resolution).
function dosDateTime(d) {
  const y = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}
async function zip(files, when) {
  // Builds store-only ZIP: local file headers (0x04034b50) + central dir + EOCD
  checkFiles(files);
  const dt = dosDateTime(when instanceof Date && !isNaN(when) ? when : new Date());
  const chunks = [],
    central = [];
  let offset = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i],
      name = enc.encode(f.path),
      bytes = new Uint8Array(await f.blob.arrayBuffer()),
      crc = crc32(bytes),
      h = new Uint8Array(30 + name.length),
      v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(10, dt.time, true);
    v.setUint16(12, dt.date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, bytes.length, true);
    v.setUint32(22, bytes.length, true);
    v.setUint16(26, name.length, true);
    h.set(name, 30);
    chunks.push(h, f.blob);
    const c = new Uint8Array(46 + name.length),
      w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x800, true);
    w.setUint16(12, dt.time, true);
    w.setUint16(14, dt.date, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, bytes.length, true);
    w.setUint32(24, bytes.length, true);
    w.setUint16(28, name.length, true);
    w.setUint32(42, offset, true);
    c.set(name, 46);
    central.push(c);
    offset += h.length + bytes.length;
    message("Packaging " + (i + 1) + " / " + files.length + ": " + f.path);
    await new Promise((r) => setTimeout(r, 0));
  }
  const length = central.reduce((n, c) => n + c.length, 0),
    end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, length, true);
  ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}
async function unzip(file) {
  if (file.size > MAX + 20 * 1024 * 1024)
    throw Error("Archive exceeds the prototype size limit.");
  const endBytes = new Uint8Array(await file.slice(-22).arrayBuffer()),
    end = new DataView(endBytes.buffer);
  if (
    endBytes.length !== 22 ||
    end.getUint32(0, true) !== 0x06054b50 ||
    end.getUint16(4, true) ||
    end.getUint16(6, true) ||
    end.getUint16(20, true)
  )
    throw Error("Open a team package created by SwitchCard, not a general ZIP file.");
  const count = end.getUint16(10, true),
    centralOffset = end.getUint32(16, true),
    centralSize = end.getUint32(12, true);
  if (count !== end.getUint16(8, true) || centralOffset + centralSize !== file.size - 22)
    throw Error("Invalid package directory.");
  let cursor = centralOffset;
  const files = [];
  for (let i = 0; i < count; i++) {
    const h = new DataView(await file.slice(cursor, cursor + 46).arrayBuffer());
    if (
      h.byteLength !== 46 ||
      h.getUint32(0, true) !== 0x02014b50 ||
      h.getUint16(10, true) !== 0 ||
      h.getUint16(8, true) !== 0x800
    )
      throw Error("Package must use the SwitchCard ZIP format.");
    const size = h.getUint32(24, true),
      nameLen = h.getUint16(28, true),
      extra = h.getUint16(30, true),
      comment = h.getUint16(32, true),
      offset = h.getUint32(42, true),
      crc = h.getUint32(16, true);
    if (h.getUint32(20, true) !== size) throw Error("Invalid stored file size.");
    const name = validPath(
      dec.decode(await file.slice(cursor + 46, cursor + 46 + nameLen).arrayBuffer()),
    );
    const local = new DataView(await file.slice(offset, offset + 30).arrayBuffer());
    if (
      local.byteLength !== 30 ||
      local.getUint32(0, true) !== 0x04034b50 ||
      local.getUint16(6, true) !== 0x800 ||
      local.getUint16(8, true) !== 0 ||
      local.getUint32(14, true) !== crc ||
      local.getUint32(18, true) !== size ||
      local.getUint32(22, true) !== size
    )
      throw Error("Invalid file header.");
    const localNameLen = local.getUint16(26, true),
      start = offset + 30 + localNameLen + local.getUint16(28, true);
    if (
      dec.decode(await file.slice(offset + 30, offset + 30 + localNameLen).arrayBuffer()) !==
        name ||
      start + size > centralOffset
    )
      throw Error("Invalid file path or boundary.");
    const blob = file.slice(start, start + size);
    if (crc32(new Uint8Array(await blob.arrayBuffer())) !== crc)
      throw Error("Integrity check failed: " + name);
    files.push({ path: name, blob });
    cursor += 46 + nameLen + extra + comment;
    message("Checking package " + (i + 1) + " / " + count);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (cursor !== centralOffset + centralSize) throw Error("Invalid directory length.");
  checkFiles(files);
  return files;
}
async function run(fn) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("input,select,textarea,button").forEach((el) => {
    el.dataset.beforeDisabled = el.disabled ? "1" : "0";
    el.disabled = true;
  });
  try {
    await fn();
  } catch (e) {
    message("Could not finish: " + String(e.message).replace(/\.\.$/, "."));
  } finally {
    busy = false;
    document.querySelectorAll("input,select,textarea,button").forEach((el) => {
      if (el.dataset.beforeDisabled !== undefined) {
        el.disabled = el.dataset.beforeDisabled === "1";
        delete el.dataset.beforeDisabled;
      }
    });
    renderPreview();
  }
}
