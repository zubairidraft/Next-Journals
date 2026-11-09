// Encrypted backup format (.njbackup)
//
//  [8]  magic "NXTJRNL" + version byte 0x01
//  [1]  flags (bit 0 = gzip-compressed payload)
//  [4]  PBKDF2 iterations (uint32, big endian)
//  [16] salt
//  [12] AES-GCM IV
//  [..] AES-256-GCM ciphertext (header bytes are authenticated as AAD)
//
// The payload is a single binary package (JSON manifest + every media file)
// so it is NOT a zip: without the password nothing — text, photos, videos —
// can be read, and any tampering makes decryption fail.

import * as db from './db.js';
import { deriveKey, randomBytes } from './crypto.js';

const MAGIC = [0x4e, 0x58, 0x54, 0x4a, 0x52, 0x4e, 0x4c, 0x01]; // "NXTJRNL" v1
const HEADER_LEN = 8 + 1 + 4 + 16 + 12;
const enc = new TextEncoder();
const dec = new TextDecoder();

async function gzip(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function gunzip(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function buildPackage(onProgress) {
  const records = db.all();
  const ids = await db.blobIds();
  const parts = [];
  const index = [];
  let off = 0;
  for (let i = 0; i < ids.length; i++) {
    const bytes = await db.getBlob(ids[i]);
    if (!bytes) continue;
    index.push({ id: ids[i], off, len: bytes.length });
    parts.push(bytes);
    off += bytes.length;
    onProgress && onProgress(`Packing media ${i + 1}/${ids.length}`);
  }
  const manifest = enc.encode(JSON.stringify({
    app: 'Next Journals', format: 1, created: Date.now(), records, blobs: index
  }));
  const out = new Uint8Array(8 + manifest.length + off);
  out.set(enc.encode('MDPK'), 0);
  new DataView(out.buffer).setUint32(4, manifest.length);
  out.set(manifest, 8);
  let p = 8 + manifest.length;
  for (const b of parts) { out.set(b, p); p += b.length; }
  return { bytes: out, stats: { records: records.length, media: index.length } };
}

function parsePackage(bytes) {
  if (dec.decode(bytes.subarray(0, 4)) !== 'MDPK') throw new Error('Backup content is damaged');
  const mlen = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4);
  const manifest = JSON.parse(dec.decode(bytes.subarray(8, 8 + mlen)));
  const base = 8 + mlen;
  const blobs = manifest.blobs.map(b => ({ id: b.id, bytes: bytes.slice(base + b.off, base + b.off + b.len) }));
  return { manifest, blobs };
}

export async function createBackup(onProgress) {
  const { key, salt, iterations } = db.getBackupKey();
  if (!key) throw new Error('Unlock the diary first');
  const { bytes, stats } = await buildPackage(onProgress);
  onProgress && onProgress('Compressing');
  const gz = await gzip(bytes);
  const payload = gz && gz.length < bytes.length ? gz : bytes;
  const flags = payload === gz ? 1 : 0;

  const header = new Uint8Array(HEADER_LEN);
  header.set(MAGIC, 0);
  header[8] = flags;
  new DataView(header.buffer).setUint32(9, iterations);
  header.set(salt, 13);
  const iv = randomBytes(12);
  header.set(iv, 29);
  onProgress && onProgress('Encrypting');
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, payload));
  const file = new Uint8Array(HEADER_LEN + ct.length);
  file.set(header, 0);
  file.set(ct, HEADER_LEN);
  return { bytes: file, stats };
}

export function isBackupFile(bytes) {
  return bytes.length > HEADER_LEN && MAGIC.every((b, i) => bytes[i] === b);
}

export async function decryptBackup(bytes, password) {
  if (!isBackupFile(bytes)) throw new Error('This is not a Next Journals backup file');
  const header = bytes.slice(0, HEADER_LEN);
  const flags = header[8];
  const iterations = new DataView(header.buffer).getUint32(9);
  const salt = header.slice(13, 29);
  const iv = header.slice(29, 41);
  const key = await deriveKey(password, salt, iterations, ['decrypt']);
  let plain;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: header }, key, bytes.subarray(HEADER_LEN)));
  } catch {
    throw new Error('Wrong password, or the backup file is damaged');
  }
  if (flags & 1) plain = await gunzip(plain);
  return parsePackage(plain);
}

// mode: 'replace' wipes current data first; 'merge' keeps the newest copy of each item
export async function restoreBackup(pkg, mode = 'merge', onProgress) {
  const { manifest, blobs } = pkg;
  if (mode === 'replace') await db.wipeAll();
  const existingBlobs = new Set(await db.blobIds());
  let added = 0;
  const toWrite = [];
  for (const rec of manifest.records) {
    const cur = db.get(rec.id);
    if (!cur || (rec.updated || 0) > (cur.updated || 0)) { toWrite.push(rec); added++; }
  }
  if (toWrite.length) await db.putMany(toWrite);
  for (let i = 0; i < blobs.length; i++) {
    if (mode === 'merge' && existingBlobs.has(blobs[i].id)) continue;
    await db.putBlob(blobs[i].id, blobs[i].bytes);
    onProgress && onProgress(`Restoring media ${i + 1}/${blobs.length}`);
  }
  return { records: added, media: blobs.length };
}

export function backupFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `NextJournals-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.njbackup`;
}
