// ZUKU Jump package validation. Adapted from @zuku/zwf (MIT).
// Metadata is validated before inflation; only the bounded manifest is retained.
import { Inflate } from 'fflate';

export const PACKAGE_LIMITS = Object.freeze({ pc: 500 * 1024 ** 2, mobile: 100 * 1024 ** 2 });
export const ZIP_LIMITS = Object.freeze({ files: 4096, manifest: 256 * 1024, ratio: 250, depth: 16, nameBytes: 512 });
const decoder = new TextDecoder('utf-8', { fatal: true });
export class PackageValidationError extends Error { constructor(message) { super(message); this.name = 'PackageValidationError'; } }
const fail = (message) => { throw new PackageValidationError(message); };
export function asPackageBytes(input) {
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError('package must be bytes');
}
export function safePath(name) {
  return typeof name === 'string' && name.length > 0 && new TextEncoder().encode(name).length <= ZIP_LIMITS.nameBytes && !/[\\\x00-\x1f\x7f:%?#]/.test(name) && !name.startsWith('/') && name.split('/').length <= ZIP_LIMITS.depth && !name.split('/').some((part) => !part || part === '.' || part === '..');
}
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function updateCrc(crc, bytes) {
  for (let index = 0; index < bytes.length; index++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[index]) & 255];
  return crc >>> 0;
}
export function crc32(bytes) {
  return (updateCrc(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
}

function zipName(bytes) {
  try { return decoder.decode(bytes); } catch { fail('Invalid UTF-8 ZIP entry name'); }
}

function inspectExtra(bytes, start, length, nameBytes, name) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = start + length;
  while (start < end) {
    if (start + 4 > end) fail('Truncated ZIP extra field');
    const kind = view.getUint16(start, true), size = view.getUint16(start + 2, true);
    start += 4;
    if (start + size > end || kind === 1) fail('Truncated or unsupported ZIP64 extra field');
    if (kind === 0x7075 && (size < 5 || bytes[start] !== 1 || view.getUint32(start + 1, true) !== crc32(nameBytes) || zipName(bytes.subarray(start + 5, start + size)) !== name)) fail('Conflicting ZIP Unicode path');
    start += size;
  }
}

function unpackBudgeted(bytes, entries, limit) {
  let manifest;
  let total = 0;
  for (const entry of entries) {
    let actual = 0, crc = 0xffffffff;
    const retain = entry.path === "jump.manifest.json";
    const chunks = [];
    const consume = chunk => {
      actual += chunk.length;
      total += chunk.length;
      if (actual > entry.size || actual > limit || total > limit || (retain && actual > ZIP_LIMITS.manifest) || (actual >= 1024 ** 2 && actual > Math.max(entry.compressed, 1) * ZIP_LIMITS.ratio)) fail(`Actual ZIP decompression budget exceeded: ${entry.path}`);
      crc = updateCrc(crc, chunk);
      if (retain) chunks.push(chunk);
    };
    try {
      if (entry.method === 0) consume(bytes.subarray(entry.start, entry.start + entry.compressed));
      else {
        const inflater = new Inflate(consume);
        const end = entry.start + entry.compressed;
        if (!entry.compressed) fail(`Truncated DEFLATE stream: ${entry.path}`);
        for (let offset = entry.start; offset < end; offset += 1024) {
          const next = Math.min(offset + 1024, end);
          inflater.push(bytes.subarray(offset, next), next === end);
        }
        // fflate is version-pinned. Only the final partial byte may remain;
        // complete trailing bytes are not part of the declared DEFLATE stream.
        if (!inflater.s?.f || inflater.s.l || !(inflater.p instanceof Uint8Array) || inflater.p.length !== (inflater.s.p ? 1 : 0)) fail(`Truncated or trailing DEFLATE data: ${entry.path}`);
      }
    } catch (error) {
      if (error instanceof PackageValidationError) throw error;
      fail(`Corrupt ZIP compressed entry: ${entry.path}`);
    }
    if (actual !== entry.size || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) fail(`Corrupt ZIP entry: ${entry.path}`);
    if (!retain) continue;
    let data;
    if (chunks.length === 1) data = chunks[0];
    else {
      data = new Uint8Array(actual);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    }
    manifest = data;
  }
  return manifest;
}

/** Inspect the central directory BEFORE decompression or allocating entry buffers. */
export function inspectPackageArchive(input, target = 'pc') {
  if (!Object.hasOwn(PACKAGE_LIMITS, target)) fail(`unsupported target: ${target}`);
  const bytes = asPackageBytes(input), limit = PACKAGE_LIMITS[target];
  if (bytes.length > limit) fail(`package exceeds ${target} limit (${limit} bytes)`);
  if (bytes.length < 22) fail('package must be a valid ZIP archive');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) fail('ZIP central directory is missing');
  const count = view.getUint16(end + 10, true);
  const cdSize = view.getUint32(end + 12, true);
  const cdStart = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || !count || count > ZIP_LIMITS.files || cdStart + cdSize !== end) fail('Split, ZIP64 or excessive ZIP directories are unsupported');
  let offset = cdStart, total = 0;
  const entries = [], names = new Set(), spans = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) fail('Invalid ZIP entry');
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true), mode = view.getUint32(offset + 38, true) >>> 16;
    if (offset + 46 + nameLength + extra + comment > end) fail('Truncated ZIP directory');
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    if (!(flags & 0x800) && nameBytes.some(byte => byte > 0x7f)) fail('Non-ASCII ZIP name requires the UTF-8 flag');
    const name = zipName(nameBytes);
    const directory = name.endsWith('/'), path = directory ? name.slice(0, -1) : name;
    const identity = path.normalize('NFC').toLowerCase();
    if (!safePath(path)) fail(`package contains an unsafe path: ${name}`);
    if (names.has(identity)) fail(`Duplicate ZIP path: ${name}`);
    names.add(identity);
    const fileType = mode & 0xf000;
    if ((flags & ~0x080e) || ![0, 8].includes(method) || ![0, 0x8000, 0x4000].includes(fileType) || (fileType === 0x4000 && !directory) || (fileType === 0x8000 && directory) || view.getUint16(offset + 34, true) || view.getUint16(offset + 6, true) > 20) fail(`Encrypted, linked, special or unsupported ZIP entry: ${name}`);
    inspectExtra(bytes, offset + 46 + nameLength, extra, nameBytes, name);
    if (size > limit || (total += size) > limit || (size >= 1024 ** 2 && size > Math.max(compressed, 1) * ZIP_LIMITS.ratio) || (name === "jump.manifest.json" && size > ZIP_LIMITS.manifest)) fail('ZIP decompression limits exceeded');
    if (directory && size) fail('ZIP directory has data');
    if (local + 30 > cdStart || view.getUint32(local, true) !== 0x04034b50) fail('Invalid ZIP local header');
    const localNameLength = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true);
    const start = local + 30 + localNameLength + localExtra;
    if (view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method || view.getUint16(local + 4, true) !== view.getUint16(offset + 6, true) || start > cdStart || zipName(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name || start + compressed > cdStart) fail('ZIP headers disagree');
    inspectExtra(bytes, local + 30 + localNameLength, localExtra, nameBytes, name);
    const crc = view.getUint32(offset + 16, true);
    let entryEnd = start + compressed;
    if (flags & 8) {
      for (const [field, expected] of [[14, crc], [18, compressed], [22, size]]) {
        const declared = view.getUint32(local + field, true);
        if (declared !== 0 && declared !== expected) fail('ZIP headers disagree on integrity metadata');
      }
      if (entryEnd + 12 > cdStart) fail('Truncated ZIP data descriptor');
      const candidates = view.getUint32(entryEnd, true) === 0x08074b50 ? [entryEnd + 4, entryEnd] : [entryEnd];
      const descriptor = candidates.find(at => at + 12 <= cdStart && view.getUint32(at, true) === crc && view.getUint32(at + 4, true) === compressed && view.getUint32(at + 8, true) === size);
      if (descriptor === undefined) fail('ZIP data descriptor integrity mismatch');
      entryEnd = descriptor + 12;
    } else if (view.getUint32(local + 14, true) !== crc || view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== size) fail('ZIP headers disagree on integrity metadata');
    if (method === 0 && compressed !== size) fail('Stored ZIP entry sizes disagree');
    spans.push([local, entryEnd]);
    entries.push({ path: name, size, crc, directory, start, compressed, method });
    offset += 46 + nameLength + extra + comment;
  }
  if (offset !== end) fail('ZIP directory length mismatch');
  spans.sort((a, b) => a[0] - b[0]);
  if (spans[0][0] !== 0 || spans.at(-1)[1] !== cdStart) fail('Unaccounted ZIP data');
  for (let i = 1; i < spans.length; i++) if (spans[i][0] !== spans[i - 1][1]) fail('Overlapping or gapped ZIP entries');
  const fileNames = new Set(entries.filter(entry => !entry.directory).map(entry => entry.path.normalize('NFC').toLowerCase()));
  for (const entry of entries) {
    const identity = (entry.directory ? entry.path.slice(0, -1) : entry.path).normalize('NFC').toLowerCase();
    const parts = identity.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      if (fileNames.has(parts.slice(0, depth).join('/'))) fail('ZIP file/directory path collision');
    }
  }
  const files = entries.filter(entry => !entry.directory).map(entry => entry.path);
  for (const required of ['index.html', 'jump.manifest.json']) {
    if (!files.includes(required)) fail(`missing required file: ${required}`);
  }
  const manifest = unpackBudgeted(bytes, entries, limit);
  return { files, manifest, expandedBytes: total };
}
