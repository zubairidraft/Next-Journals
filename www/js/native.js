// Bridges between the web build and the Android (Capacitor) build.
import { toB64 } from './crypto.js';

export const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export function plugin(name) {
  const C = window.Capacitor;
  if (!C) return null;
  if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
  if (C.registerPlugin) return C.registerPlugin(name);
  return null;
}

// Save a file for the user. Browser: normal download. Android: write to the
// app cache and open the share sheet (Save to Files, Drive, WhatsApp, etc.).
export async function saveFile(bytes, filename, mime = 'application/octet-stream') {
  if (isNative()) {
    const Filesystem = plugin('Filesystem');
    const Share = plugin('Share');
    const { uri } = await Filesystem.writeFile({ path: filename, data: toB64(bytes), directory: 'CACHE' });
    try {
      // Also keep a copy in Documents/NextJournals when allowed
      await Filesystem.writeFile({ path: 'NextJournals/' + filename, data: toB64(bytes), directory: 'DOCUMENTS', recursive: true });
    } catch (e) { /* not fatal on newer Android versions */ }
    await Share.share({ title: filename, files: [uri], dialogTitle: 'Save backup' });
    return;
  }
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function pickFile(accept = '*/*', multiple = false) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.onchange = () => { resolve(Array.from(input.files || [])); input.remove(); };
    document.body.appendChild(input);
    input.click();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  }
}

// ---------- Fingerprint unlock (Android) ----------
// The master password is stored in the Android Keystore, protected by the
// user's enrolled fingerprint (BIOMETRY_CURRENT_SET). Adding a new fingerprint
// on the phone invalidates it, so the password is asked again.
const BIO_SERVER = 'com.nextedgemarketing.nextjournals';

export async function biometricAvailable() {
  if (!isNative()) return false;
  try {
    const r = await plugin('NativeBiometric').isAvailable();
    return !!r.isAvailable;
  } catch { return false; }
}

export async function biometricEnable(password) {
  const B = plugin('NativeBiometric');
  await B.setCredentials({
    username: 'master', password, server: BIO_SERVER,
    accessControl: 1, title: 'Enable fingerprint unlock', negativeButtonText: 'Cancel'
  });
  localStorage.setItem('nj-bio', '1');
}

export async function biometricUnlock() {
  const B = plugin('NativeBiometric');
  const c = await B.getSecureCredentials({
    server: BIO_SERVER, title: 'Unlock Next Journals', subtitle: 'Use your fingerprint', negativeButtonText: 'Use password'
  });
  return c.password;
}

export async function biometricDisable() {
  localStorage.removeItem('nj-bio');
  try { await plugin('NativeBiometric').deleteCredentials({ server: BIO_SERVER }); } catch {}
}

export const biometricEnabled = () => isNative() && localStorage.getItem('nj-bio') === '1';
