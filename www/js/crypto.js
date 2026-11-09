// Crypto helpers — everything uses the browser's native Web Crypto API.
// At-rest + backup encryption: AES-256-GCM. Keys derived from the master
// password with PBKDF2-SHA256 (600,000 iterations, random 16-byte salt).

export const PBKDF2_ITERATIONS = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function uid() {
  const b = randomBytes(10);
  return Date.now().toString(36) + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

async function passwordKey(password) {
  return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
}

// Derive an AES-GCM key (used to wrap the data key, or to encrypt backups)
export async function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS, usages = ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']) {
  const base = await passwordKey(password);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export async function generateDataKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapDataKey(dataKey, kek) {
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv });
  return { iv, wrapped: new Uint8Array(wrapped) };
}

export async function unwrapDataKey(wrapped, iv, kek) {
  return crypto.subtle.unwrapKey('raw', wrapped, kek, { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encryptBytes(key, bytes, aad) {
  const iv = randomBytes(12);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = aad;
  const ct = await crypto.subtle.encrypt(params, key, bytes);
  return { iv, data: new Uint8Array(ct) };
}

export async function decryptBytes(key, iv, data, aad) {
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = aad;
  return new Uint8Array(await crypto.subtle.decrypt(params, key, data));
}

export async function encryptJSON(key, obj) {
  return encryptBytes(key, enc.encode(JSON.stringify(obj)));
}

export async function decryptJSON(key, iv, data) {
  return JSON.parse(dec.decode(await decryptBytes(key, iv, data)));
}

export function toB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(h, x => x.toString(16).padStart(2, '0')).join('');
}

// Password generator for the vault
export function generatePassword({ length = 20, upper = true, lower = true, digits = true, symbols = true } = {}) {
  let pool = '';
  const sets = [];
  if (lower) sets.push('abcdefghijkmnopqrstuvwxyz');
  if (upper) sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
  if (digits) sets.push('23456789');
  if (symbols) sets.push('!@#$%^&*()-_=+[]{};:,.?');
  if (!sets.length) sets.push('abcdefghijkmnopqrstuvwxyz');
  pool = sets.join('');
  const pick = (str) => {
    // rejection sampling to avoid modulo bias
    const max = 256 - (256 % str.length);
    while (true) {
      const b = randomBytes(1)[0];
      if (b < max) return str[b % str.length];
    }
  };
  const chars = sets.map(pick); // guarantee one of each set
  while (chars.length < length) chars.push(pick(pool));
  // Fisher–Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function passwordStrength(pw) {
  if (!pw) return { score: 0, label: 'Empty' };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  const bits = pw.length * Math.log2(pool || 1);
  if (bits < 36) return { score: 1, label: 'Weak', bits };
  if (bits < 60) return { score: 2, label: 'Fair', bits };
  if (bits < 80) return { score: 3, label: 'Strong', bits };
  return { score: 4, label: 'Very strong', bits };
}
