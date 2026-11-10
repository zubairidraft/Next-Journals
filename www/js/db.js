// Encrypted storage layer on top of IndexedDB.
// - "meta" store: unencrypted vault header (salts, wrapped key) + non-secret settings
// - "records" store: every journal entry / task / password / list, each one
//   AES-GCM encrypted with the data key. Nothing readable is stored on disk.
// - "blobs" store: media files (photos, videos, audio, documents), encrypted.

import {
  PBKDF2_ITERATIONS, randomBytes, deriveKey, generateDataKey, wrapDataKey,
  unwrapDataKey, encryptJSON, decryptJSON, encryptBytes, decryptBytes, uid
} from './crypto.js';

const DB_NAME = 'nextjournals';
const DB_VERSION = 1;
let dbp = null;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    Promise.resolve(fn(store)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  }));
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const meta = {
  get: (k) => tx('meta', 'readonly', s => reqP(s.get(k))),
  set: (k, v) => tx('meta', 'readwrite', s => { s.put(v, k); }),
  del: (k) => tx('meta', 'readwrite', s => { s.delete(k); }),
};

// ---------- Vault state ----------
let dataKey = null;     // AES key that encrypts records/blobs (memory only)
let backupKey = null;   // AES key used for backups (memory only)
let backupSalt = null;
let sessionPassword = null; // Master password for automatic background sync (memory only, cleared on lock)
const cache = new Map(); // decrypted records (memory only)
const listeners = new Set();

export const isUnlocked = () => !!dataKey;
export const getSessionPassword = () => sessionPassword;
export const setSessionPassword = (pw) => { sessionPassword = pw; };
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function emit(type, rec) { listeners.forEach(fn => { try { fn(type, rec); } catch (e) { console.error(e); } }); }

export async function isSetup() {
  return !!(await meta.get('vault'));
}

export async function setupVault(password) {
  const salt = randomBytes(16);
  const kek = await deriveKey(password, salt);
  const dk = await generateDataKey();
  const { iv, wrapped } = await wrapDataKey(dk, kek);
  const bSalt = randomBytes(16);
  await meta.set('vault', { v: 1, salt, iterations: PBKDF2_ITERATIONS, iv, wrapped, backupSalt: bSalt, created: Date.now() });
  dataKey = dk;
  backupSalt = bSalt;
  backupKey = await deriveKey(password, bSalt, PBKDF2_ITERATIONS, ['encrypt', 'decrypt']);
  sessionPassword = password;
  cache.clear();
  return true;
}

export async function unlockVault(password) {
  const v = await meta.get('vault');
  if (!v) throw new Error('No diary found');
  const kek = await deriveKey(password, v.salt, v.iterations);
  let dk;
  try {
    dk = await unwrapDataKey(v.wrapped, v.iv, kek);
  } catch {
    throw new Error('Wrong password');
  }
  dataKey = dk;
  backupSalt = v.backupSalt;
  backupKey = await deriveKey(password, v.backupSalt, v.iterations, ['encrypt', 'decrypt']);
  sessionPassword = password;
  await loadAll();
  return true;
}

export function lockVault() {
  dataKey = null; backupKey = null; backupSalt = null; sessionPassword = null;
  cache.clear();
  emit('lock');
}

export async function changePassword(oldPw, newPw) {
  const v = await meta.get('vault');
  const kek = await deriveKey(oldPw, v.salt, v.iterations);
  let dk;
  try { dk = await unwrapDataKey(v.wrapped, v.iv, kek); } catch { throw new Error('Current password is wrong'); }
  const salt = randomBytes(16);
  const newKek = await deriveKey(newPw, salt);
  const { iv, wrapped } = await wrapDataKey(dk, newKek);
  const bSalt = randomBytes(16);
  await meta.set('vault', { ...v, salt, iterations: PBKDF2_ITERATIONS, iv, wrapped, backupSalt: bSalt });
  backupSalt = bSalt;
  backupKey = await deriveKey(newPw, bSalt, PBKDF2_ITERATIONS, ['encrypt', 'decrypt']);
  sessionPassword = newPw;
}

export async function verifyPassword(pw) {
  const v = await meta.get('vault');
  const kek = await deriveKey(pw, v.salt, v.iterations);
  try { await unwrapDataKey(v.wrapped, v.iv, kek); return true; } catch { return false; }
}

export const getBackupKey = () => ({ key: backupKey, salt: backupSalt, iterations: PBKDF2_ITERATIONS });

// ---------- Records ----------
async function loadAll() {
  cache.clear();
  const rows = await tx('records', 'readonly', s => reqP(s.getAll()));
  for (const row of rows) {
    try {
      const rec = await decryptJSON(dataKey, row.iv, row.data);
      cache.set(rec.id, rec);
    } catch (e) { console.warn('Could not decrypt record', row.id, e); }
  }
}

export function all(type) {
  const out = [];
  for (const r of cache.values()) if (!type || r.type === type) out.push(r);
  return out;
}

export const get = (id) => cache.get(id);

export async function put(rec) {
  if (!dataKey) throw new Error('Diary is locked');
  const now = Date.now();
  if (!rec.id) rec.id = uid();
  if (!rec.created) rec.created = now;
  rec.updated = now;
  const { iv, data } = await encryptJSON(dataKey, rec);
  await tx('records', 'readwrite', s => { s.put({ id: rec.id, iv, data }); });
  const isNew = !cache.has(rec.id);
  cache.set(rec.id, rec);
  emit(isNew ? 'create' : 'update', rec);
  return rec;
}

// Insert many records preserving their timestamps (used by restore)
export async function putMany(recs) {
  const rows = [];
  for (const rec of recs) {
    const { iv, data } = await encryptJSON(dataKey, rec);
    rows.push({ id: rec.id, iv, data });
  }
  await tx('records', 'readwrite', s => { rows.forEach(r => s.put(r)); });
  recs.forEach(r => cache.set(r.id, r));
  emit('bulk');
}

export async function getTombstones() {
  return (await meta.get('tombstones')) || {};
}

export async function setTombstones(ts) {
  return meta.set('tombstones', ts);
}

export async function remove(id) {
  const rec = cache.get(id);
  await tx('records', 'readwrite', s => { s.delete(id); });
  cache.delete(id);
  // Track deletion timestamp for smart sync
  try {
    const tombstones = (await meta.get('tombstones')) || {};
    tombstones[id] = Date.now();
    // Prune tombstones older than 90 days
    const cutoff = Date.now() - 90 * 86400000;
    for (const k of Object.keys(tombstones)) {
      if (tombstones[k] < cutoff) delete tombstones[k];
    }
    await meta.set('tombstones', tombstones);
  } catch (e) {
    console.warn('Could not record tombstone', e);
  }
  emit('delete', rec || { id });
}

// ---------- Blobs (media) ----------
export async function putBlob(id, bytes) {
  const { iv, data } = await encryptBytes(dataKey, bytes);
  await tx('blobs', 'readwrite', s => { s.put({ id, iv, data }); });
}

export async function getBlob(id) {
  const row = await tx('blobs', 'readonly', s => reqP(s.get(id)));
  if (!row) return null;
  return decryptBytes(dataKey, row.iv, row.data);
}

export async function removeBlob(id) {
  await tx('blobs', 'readwrite', s => { s.delete(id); });
}

export async function blobIds() {
  return tx('blobs', 'readonly', s => reqP(s.getAllKeys()));
}

export async function wipeAll() {
  await tx('records', 'readwrite', s => { s.clear(); });
  await tx('blobs', 'readwrite', s => { s.clear(); });
  cache.clear();
  emit('bulk');
}

export async function destroyEverything() {
  await wipeAll();
  await tx('meta', 'readwrite', s => { s.clear(); });
  lockVault();
}
