// Google sign-in + Google Drive backups.
// Browser: Google Identity Services token client (popup).
// Android: @capgo/capacitor-social-login (native Google account picker),
//          because Google blocks OAuth inside embedded WebViews.
// Scope: drive.file — the app can only see files it created itself.
import { DRIVE_SCOPE, DRIVE_FOLDER, googleClientId } from './config.js';
import { isNative, plugin } from './native.js';

let token = null;
let tokenExp = 0;
let gisLoaded = null;
let tokenClient = null;
let nativeInit = false;

// Persist token in localStorage so user doesn't get prompted on every action or page reload
function loadStoredToken() {
  try {
    const raw = localStorage.getItem('nj-google-token');
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.token && data.tokenExp) {
        token = data.token;
        tokenExp = Number(data.tokenExp) || 0;
      }
    }
  } catch {}
}
loadStoredToken();

export function saveToken(t, exp) {
  token = t;
  tokenExp = exp;
  if (t) {
    localStorage.setItem('nj-google-token', JSON.stringify({ token: t, tokenExp: exp }));
  } else {
    localStorage.removeItem('nj-google-token');
  }
}

export const account = () => { try { return JSON.parse(localStorage.getItem('nj-google') || 'null'); } catch { return null; } };
export const isConnected = () => !!account();
export const hasValidToken = () => {
  loadStoredToken();
  return !!token && Date.now() < tokenExp - 60000;
};

function loadGIS() {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { gisLoaded = null; reject(new Error('Could not load Google sign-in. Check your internet connection.')); };
    document.head.append(s);
  });
  return gisLoaded;
}

async function fetchProfile() {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  return r.json();
}

export async function signIn({ silent = false } = {}) {
  const clientId = googleClientId();
  if (!clientId) throw new Error('Add your Google Client ID first (Settings → Google Drive).');

  if (isNative()) {
    const SL = plugin('SocialLogin');
    if (!nativeInit) { await SL.initialize({ google: { webClientId: clientId, mode: 'online' } }); nativeInit = true; }
    const res = await SL.login({ provider: 'google', options: { scopes: [DRIVE_SCOPE] } });
    const r = res.result || {};
    if (!r.accessToken || !r.accessToken.token) throw new Error('Google did not grant Drive access. Please try again.');
    saveToken(r.accessToken.token, Date.now() + 50 * 60000);
    const p = r.profile || {};
    const existingAcc = account() || {};
    const email = p.email || existingAcc.email || 'Google Account';
    const name = p.name || p.givenName || existingAcc.name || email.split('@')[0];
    localStorage.setItem('nj-google', JSON.stringify({ email, name, picture: p.imageUrl || existingAcc.picture || '' }));
    return account();
  }

  await loadGIS();
  await new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE + ' openid email profile',
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        if (!google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
          return reject(new Error('Please allow Next Journals to use Google Drive (tick the Drive box on the Google screen).'));
        }
        saveToken(resp.access_token, Date.now() + (Number(resp.expires_in) || 3600) * 1000);
        resolve();
      },
      error_callback: (err) => reject(new Error(err && err.type === 'popup_closed' ? 'Sign-in window was closed' : 'Google sign-in failed')),
    });
    const acc = account();
    tokenClient.requestAccessToken({ prompt: silent || acc ? '' : 'consent', login_hint: acc && acc.email ? acc.email : undefined });
  });
  const p = await fetchProfile().catch(() => null);
  const existingAcc = account() || {};
  const email = (p && p.email) || existingAcc.email || 'Google Account';
  const name = (p && p.name) || existingAcc.name || email.split('@')[0];
  const picture = (p && p.picture) || existingAcc.picture || '';
  localStorage.setItem('nj-google', JSON.stringify({ email, name, picture }));
  return account();
}

export async function signOut() {
  if (token && !isNative() && window.google && google.accounts) {
    try { google.accounts.oauth2.revoke(token, () => {}); } catch {}
  }
  if (isNative()) { try { await plugin('SocialLogin').logout({ provider: 'google' }); } catch {} }
  saveToken(null, 0);
  localStorage.removeItem('nj-google');
  localStorage.removeItem('nj-drive-folder');
}

export async function ensureToken({ interactive = false } = {}) {
  if (hasValidToken()) return token;
  if (!interactive) {
    throw new Error('Google sign-in token expired. Tap Sync to reconnect.');
  }
  await signIn({ silent: false });
  return token;
}

async function api(url, opts = {}) {
  await ensureToken({ interactive: false });
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (r.status === 401) {
    saveToken(null, 0);
    throw new Error('Google session expired. Tap Sync to sign in again.');
  }
  if (!r.ok) {
    let msg = 'Google Drive error ' + r.status;
    try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch {}
    throw new Error(msg);
  }
  return r;
}

async function folderId() {
  const cached = localStorage.getItem('nj-drive-folder');
  if (cached) return cached;
  const q = encodeURIComponent(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`);
  const j = await r.json();
  let id = j.files && j.files[0] && j.files[0].id;
  if (!id) {
    const c = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' })
    });
    id = (await c.json()).id;
  }
  localStorage.setItem('nj-drive-folder', id);
  return id;
}

async function withFolder(fn) {
  try { return await fn(await folderId()); }
  catch (e) {
    if (!/not found/i.test(e.message)) throw e;
    localStorage.removeItem('nj-drive-folder'); // folder was deleted in Drive — recreate
    return fn(await folderId());
  }
}

export function uploadBackup(bytes, name) { return withFolder(parent => uploadTo(parent, bytes, name)); }

async function uploadTo(parent, bytes, name) {
  const meta = { name, parents: [parent], mimeType: 'application/octet-stream', description: 'Encrypted Next Journals backup' };
  // Resumable upload works for any size
  const start = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,createdTime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(bytes.length) },
    body: JSON.stringify(meta)
  });
  const loc = start.headers.get('Location');
  if (loc) {
    const r = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
    if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
    return r.json();
  }
  // Fallback: multipart upload
  const boundary = 'nj' + Math.random().toString(36).slice(2);
  const head = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Blob([head, bytes, tail]);
  const r = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
  });
  return r.json();
}

export function listBackups() { return withFolder(listIn); }

async function listIn(parent) {
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
  const r = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,size,createdTime)`);
  return (await r.json()).files || [];
}

export async function downloadBackup(id) {
  const r = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function deleteBackup(id) {
  await api(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' });
}

export async function pruneBackups(keep) {
  const files = await listBackups();
  for (const f of files.slice(keep)) { try { await deleteBackup(f.id); } catch (e) { console.warn(e); } }
}
