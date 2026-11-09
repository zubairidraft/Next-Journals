// First-run setup, unlock screen, and restore-on-new-device.
import { h, icon, toast, busy, promptDialog, openSheet, fmtSize } from '../ui.js';
import * as db from '../db.js';
import { passwordStrength } from '../crypto.js';
import * as backup from '../backup.js';
import * as drive from '../drive.js';
import { pickFile, biometricEnabled, biometricUnlock, biometricAvailable, biometricEnable } from '../native.js';
import { APP } from '../config.js';

function brand() {
  return h('div', { class: 'lock-brand' },
    h('div', { class: 'brand-mark big' }, icon('journal', 30)),
    h('h1', {}, APP.name),
    h('p', { class: 'muted' }, 'by ' + APP.company));
}

export async function renderLock(root, onUnlocked) {
  root.innerHTML = '';
  const setup = await db.isSetup();
  root.append(h('div', { class: 'lock' }, h('div', { class: 'lock-card' }, brand(), setup ? unlockForm(onUnlocked) : setupForm(onUnlocked))));
}

function unlockForm(onUnlocked) {
  const pw = h('input', { class: 'input', type: 'password', placeholder: 'Master password', autocomplete: 'current-password', 'aria-label': 'Master password' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Unlock');
  const tryUnlock = async (password) => {
    btn.disabled = true; btn.textContent = 'Unlocking…'; err.textContent = '';
    try { await db.unlockVault(password); onUnlocked(); }
    catch (e) { err.textContent = e.message === 'Wrong password' ? 'That password is not correct.' : e.message; pw.select(); }
    finally { btn.disabled = false; btn.textContent = 'Unlock'; }
  };
  const bio = async () => {
    try { const p = await biometricUnlock(); await tryUnlock(p); }
    catch (e) { err.textContent = 'Fingerprint not recognised. Use your password.'; }
  };
  const form = h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); if (pw.value) tryUnlock(pw.value); } },
    pw, err, btn,
    biometricEnabled() ? h('button', { class: 'btn ghost block', type: 'button', onclick: bio }, icon('finger'), 'Unlock with fingerprint') : null
  );
  setTimeout(() => { if (biometricEnabled()) bio(); else pw.focus(); }, 250);
  return form;
}

function setupForm(onUnlocked) {
  const pw = h('input', { class: 'input', type: 'password', placeholder: 'Create master password', autocomplete: 'new-password', 'aria-label': 'New master password' });
  const pw2 = h('input', { class: 'input', type: 'password', placeholder: 'Repeat password', autocomplete: 'new-password', 'aria-label': 'Repeat password' });
  const meter = h('div', { class: 'meter' }, h('span'));
  const meterLabel = h('span', { class: 'hint' }, 'Use at least 8 characters');
  const ack = h('input', { type: 'checkbox', id: 'ack' });
  const err = h('p', { class: 'error', role: 'alert' });
  pw.addEventListener('input', () => {
    const s = passwordStrength(pw.value);
    meter.dataset.score = s.score;
    meterLabel.textContent = pw.value ? s.label : 'Use at least 8 characters';
  });
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (pw.value.length < 8) return err.textContent = 'Password needs at least 8 characters.';
    if (pw.value !== pw2.value) return err.textContent = 'The two passwords do not match.';
    if (!ack.checked) return err.textContent = 'Please confirm you understand the password cannot be recovered.';
    const b = busy('Creating your encrypted diary…');
    try {
      await db.setupVault(pw.value);
      b.done();
      await offerBiometric(pw.value);
      onUnlocked({ firstRun: true });
    } catch (e2) { b.done(); err.textContent = e2.message; }
  } },
    h('p', { class: 'lead' }, 'Create a master password. Everything you save is encrypted with it, on this device and in your backups.'),
    pw, h('div', { class: 'row gap' }, meter, meterLabel), pw2,
    h('label', { class: 'check', for: 'ack' }, ack, h('span', {}, 'I understand that if I forget this password, my data cannot be recovered.')),
    err,
    h('button', { class: 'btn primary block', type: 'submit' }, 'Create diary'),
    h('div', { class: 'divider' }, h('span', {}, 'Moving from another device?')),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn ghost grow', type: 'button', onclick: () => restoreFromFile(onUnlocked) }, icon('upload'), 'Restore backup file'),
      h('button', { class: 'btn ghost grow', type: 'button', onclick: () => restoreFromDrive(onUnlocked) }, icon('google'), 'Restore from Drive'))
  );
  return form;
}

async function offerBiometric(password) {
  if (!(await biometricAvailable())) return;
  await new Promise((resolve) => {
    let s;
    const done = () => { s.close(); resolve(); };
    s = openSheet(h('div', { class: 'stack' },
      h('p', {}, 'Unlock Next Journals with your fingerprint instead of typing the password every time? Your password stays required as a backup.'),
      h('div', { class: 'row end gap' },
        h('button', { class: 'btn ghost', onclick: done }, 'Not now'),
        h('button', { class: 'btn primary', onclick: async () => { try { await biometricEnable(password); toast('Fingerprint unlock is on', 'success'); } catch { toast('Fingerprint was not set up', 'error'); } done(); } }, icon('finger'), 'Use fingerprint'))
    ), { title: 'Fingerprint unlock', onClose: resolve });
  });
}

// Restoring on a fresh device: the backup password becomes the master password.
async function restoreBytes(bytes, onUnlocked) {
  if (!backup.isBackupFile(bytes)) return toast('This is not a Next Journals backup file', 'error');
  const pw = await promptDialog({ title: 'Restore backup', label: 'Backup password', type: 'password', ok: 'Restore', hint: 'This is the master password you used when the backup was made. It will become your password on this device.' });
  if (!pw) return;
  const b = busy('Decrypting backup…');
  try {
    const pkg = await backup.decryptBackup(bytes, pw);
    b.update('Setting up…');
    await db.setupVault(pw);
    await backup.restoreBackup(pkg, 'replace', (m) => b.update(m));
    b.done();
    toast('Backup restored', 'success');
    await offerBiometric(pw);
    onUnlocked({ restored: true });
  } catch (e) {
    b.done();
    toast(e.message, 'error', 4000);
  }
}

async function restoreFromFile(onUnlocked) {
  const [file] = await pickFile('.njbackup,application/octet-stream,*/*');
  if (!file) return;
  restoreBytes(new Uint8Array(await file.arrayBuffer()), onUnlocked);
}

async function restoreFromDrive(onUnlocked) {
  try {
    const b = busy('Connecting to Google Drive…');
    try { await drive.signIn(); } finally { b.done(); }
    const files = await drive.listBackups();
    if (!files.length) return toast('No backups found in your Google Drive', 'error');
    let s;
    const list = h('div', { class: 'list' }, files.map(f => h('button', { class: 'list-row', onclick: async () => {
      s.close();
      const b2 = busy('Downloading backup…');
      let bytes;
      try { bytes = await drive.downloadBackup(f.id); } catch (e) { b2.done(); return toast(e.message, 'error'); }
      b2.done();
      restoreBytes(bytes, onUnlocked);
    } }, icon('cloud'), h('span', { class: 'grow' }, h('b', {}, new Date(f.createdTime).toLocaleString()), h('small', { class: 'muted block' }, f.name)), h('small', { class: 'muted' }, fmtSize(Number(f.size || 0))))));
    s = openSheet(list, { title: 'Choose a backup' });
  } catch (e) { toast(e.message, 'error', 4000); }
}
