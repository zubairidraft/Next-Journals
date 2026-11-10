// Settings: appearance, security, reminders, backups, Google Drive
import { h, icon, iconBtn, toast, busy, openSheet, confirmDialog, promptDialog, fmtSize, timeAgo } from '../ui.js';
import * as store from '../store.js';
import * as db from '../db.js';
import * as backup from '../backup.js';
import * as drive from '../drive.js';
import * as notify from '../notify.js';
import * as ai from '../ai.js';
import { APP } from '../config.js';
import { THEMES, FONTS, TEXT_CONTRASTS } from '../app.js';
import { isNative, saveFile, pickFile, biometricAvailable, biometricEnabled, biometricEnable, biometricDisable } from '../native.js';
import { pageHead } from '../components.js';

export const lastDriveBackup = () => Number(localStorage.getItem('nj-last-drive') || 0);
export const lastLocalBackup = () => Number(localStorage.getItem('nj-last-local') || 0);

export async function exportLocal() {
  const b = busy('Preparing backup…');
  try {
    const { bytes, stats } = await backup.createBackup((m) => b.update(m));
    b.done();
    await saveFile(bytes, backup.backupFileName());
    localStorage.setItem('nj-last-local', Date.now());
    toast(`Backup ready: ${stats.records} items, ${stats.media} files (${fmtSize(bytes.length)})`, 'success', 4000);
  } catch (e) { b.done(); toast(e.message, 'error', 4000); }
}

export async function runDriveBackup({ quiet = false } = {}) {
  const b = quiet ? null : busy('Connecting to Google Drive…');
  try {
    // Get the Google token first, while the tap still counts as a user action
    // (browsers block the sign-in popup if it opens after a long delay).
    if (!quiet) { await drive.ensureToken(); b.update('Encrypting backup…'); }
    const { bytes } = await backup.createBackup((m) => b && b.update(m));
    b && b.update(`Uploading ${fmtSize(bytes.length)} to Google Drive…`);
    await drive.uploadBackup(bytes, backup.backupFileName());
    localStorage.setItem('nj-last-drive', Date.now());
    await drive.pruneBackups(store.settings().driveKeep || 10).catch(() => {});
    b && b.done();
    if (!quiet) toast('Backed up to Google Drive', 'success');
    return true;
  } catch (e) {
    b && b.done();
    if (!quiet) toast(e.message, 'error', 4500);
    return false;
  }
}

// Called on unlock and every hour. Uploads silently only if a Google token is
// already valid; otherwise returns 'due' so the app can show a reminder.
export async function checkAutoBackup() {
  const s = store.settings();
  if (s.driveAuto === 'off' || !drive.isConnected()) return null;
  const every = s.driveAuto === 'daily' ? 86400000 : 7 * 86400000;
  if (Date.now() - lastDriveBackup() < every) return null;
  if (drive.hasValidToken()) { await runDriveBackup({ quiet: true }); return 'done'; }
  return 'due';
}

async function importLocal(refreshApp) {
  const [file] = await pickFile('.njbackup,application/octet-stream,*/*');
  if (!file) return;
  restoreFlow(new Uint8Array(await file.arrayBuffer()), refreshApp);
}

async function restoreFlow(bytes, refreshApp) {
  if (!backup.isBackupFile(bytes)) return toast('This is not a Next Journals backup file', 'error');
  const pw = await promptDialog({ title: 'Restore backup', label: 'Password used for this backup', type: 'password', ok: 'Decrypt' });
  if (!pw) return;
  const b = busy('Decrypting…');
  let pkg;
  try { pkg = await backup.decryptBackup(bytes, pw); } catch (e) { b.done(); return toast(e.message, 'error', 4000); }
  b.done();
  const n = pkg.manifest.records.filter(r => r.type !== 'settings').length;
  const choice = await new Promise((resolve) => {
    let done = false;
    const pick = (v) => { done = true; s.close(); resolve(v); };
    const s = openSheet(h('div', { class: 'stack' },
      h('p', {}, `This backup from ${new Date(pkg.manifest.created).toLocaleString()} has ${n} items and ${pkg.blobs.length} files.`),
      h('button', { class: 'btn primary block', onclick: () => pick('merge') }, 'Merge with my current data'),
      h('p', { class: 'hint' }, 'Adds missing items and keeps the newest version of each one.'),
      h('button', { class: 'btn danger ghost block', onclick: () => pick('replace') }, 'Replace everything'),
      h('p', { class: 'hint' }, 'Deletes what is on this device first, then restores the backup.')
    ), { title: 'How should it be restored?', onClose: () => { if (!done) resolve(null); } });
  });
  if (!choice) return;
  if (choice === 'replace' && !(await confirmDialog('All current data on this device will be replaced by the backup.', { ok: 'Replace' }))) return;
  const b2 = busy('Restoring…');
  try {
    const r = await backup.restoreBackup(pkg, choice, (m) => b2.update(m));
    b2.done();
    toast(`Restored ${r.records} items`, 'success');
    notify.rescheduleAll();
    refreshApp();
  } catch (e) { b2.done(); toast(e.message, 'error', 4000); }
}

async function driveRestore(refreshApp) {
  const b = busy('Loading your backups…');
  let files;
  try { files = await drive.listBackups(); } catch (e) { b.done(); return toast(e.message, 'error', 4000); }
  b.done();
  if (!files.length) return toast('No backups in Google Drive yet');
  let s;
  s = openSheet(h('div', { class: 'list' }, files.map(f => h('div', { class: 'list-row' },
    icon('cloud'),
    h('button', { class: 'grow plain left', onclick: async () => {
      s.close();
      const b2 = busy('Downloading…');
      try { const bytes = await drive.downloadBackup(f.id); b2.done(); restoreFlow(bytes, refreshApp); }
      catch (e) { b2.done(); toast(e.message, 'error'); }
    } }, h('b', {}, new Date(f.createdTime).toLocaleString()), h('small', { class: 'muted block' }, fmtSize(Number(f.size || 0)))),
    iconBtn('trash', 'Delete this backup', async () => {
      if (!(await confirmDialog('Delete this backup from Google Drive?'))) return;
      await drive.deleteBackup(f.id); s.close(); driveRestore(refreshApp);
    })))), { title: 'Backups in Google Drive' });
}

export async function render(root, ctx) {
  root.innerHTML = '';
  const s = store.settings();
  const set = async (patch) => { await store.saveSettings(patch); };
  const section = (title, ...rows) => h('section', { class: 'set-section' }, h('h2', {}, title), h('div', { class: 'set-card' }, rows));
  const row = (label, hint, control) => h('div', { class: 'set-row' }, h('div', { class: 'grow' }, h('b', {}, label), hint ? h('small', { class: 'muted block' }, hint) : null), control);
  const sel = (value, options, onchange, label) => h('select', { class: 'input slim', 'aria-label': label, onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: String(value) === String(v) }, l)));
  const toggle = (checked, onchange, label) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked, 'aria-label': label, onchange: (e) => onchange(e.target.checked) }), h('span'));

  // Appearance
  const theme = localStorage.getItem('nj-theme') || 'system';
  const colorTheme = localStorage.getItem('nj-color-theme') || 'navy';
  const currentFont = localStorage.getItem('nj-font') || 'manrope';
  const currentContrast = localStorage.getItem('nj-text-contrast') || 'default';
  const customColorVal = localStorage.getItem('nj-custom-color') || '#1B2744';

  const swatchesWrap = h('div', { class: 'color-swatches' });
  Object.entries(THEMES).forEach(([key, th]) => {
    const isActive = colorTheme === key;
    const btn = h('button', {
      class: 'color-swatch-btn' + (isActive ? ' active' : ''),
      type: 'button',
      title: th.name,
      'aria-label': th.name,
      style: `background: ${th.color};`,
      onclick: () => {
        localStorage.setItem('nj-color-theme', key);
        ctx.applyTheme();
        render(root, ctx);
      }
    });
    if (isActive) {
      btn.append(icon('check', 16, 'swatch-check'));
    }
    swatchesWrap.append(btn);
  });

  // Custom Color picker
  const customInput = h('input', {
    type: 'color',
    value: customColorVal,
    title: 'Custom accent color',
    'aria-label': 'Custom accent color',
    onchange: (e) => {
      localStorage.setItem('nj-color-theme', 'custom');
      localStorage.setItem('nj-custom-color', e.target.value);
      ctx.applyTheme();
      render(root, ctx);
    }
  });
  const customWrap = h('label', {
    class: 'custom-color-wrap' + (colorTheme === 'custom' ? ' active' : ''),
    title: 'Pick custom color',
    style: colorTheme === 'custom' ? `background: ${customColorVal}; border-style: solid; border-color: var(--text);` : ''
  },
    customInput,
    colorTheme === 'custom' ? icon('check', 16, 'swatch-check') : icon('plus', 16)
  );
  swatchesWrap.append(customWrap);

  const fontOptions = Object.entries(FONTS).map(([k, f]) => [k, f.name]);
  const contrastOptions = Object.entries(TEXT_CONTRASTS).map(([k, c]) => [k, c.name]);

  const appearance = section('Appearance',
    row('Theme', 'Light or dark color scheme', sel(theme, [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']], (v) => { localStorage.setItem('nj-theme', v); ctx.applyTheme(); }, 'Theme')),
    row('App color theme', 'Choose global accent and interface colors', swatchesWrap),
    row('App font', 'Choose your preferred typography', sel(currentFont, fontOptions, (v) => { localStorage.setItem('nj-font', v); ctx.applyTheme(); }, 'App font')),
    row('Text readability & contrast', 'Adjust reading contrast', sel(currentContrast, contrastOptions, (v) => { localStorage.setItem('nj-text-contrast', v); ctx.applyTheme(); }, 'Text contrast')),
    row('Week starts on', null, sel(s.weekStart, [[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']], (v) => set({ weekStart: Number(v) }), 'Week start')));

  // Security
  const bioAvail = await biometricAvailable();
  const security = section('Security',
    row('Auto-lock', 'Lock the diary after this much inactivity', sel(s.autoLockMin, [[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [0, 'Never']], async (v) => { await set({ autoLockMin: Number(v) }); ctx.resetAutoLock(); }, 'Auto-lock')),
    bioAvail ? row('Fingerprint unlock', 'Unlock with your fingerprint. The password still works.', toggle(biometricEnabled(), async (on) => {
      if (on) {
        const pw = await promptDialog({ title: 'Enable fingerprint', label: 'Master password', type: 'password', ok: 'Continue' });
        if (!pw || !(await db.verifyPassword(pw))) { toast(pw ? 'Wrong password' : 'Cancelled', 'error'); return render(root, ctx); }
        try { await biometricEnable(pw); toast('Fingerprint unlock is on', 'success'); } catch { toast('Fingerprint was not set up', 'error'); }
      } else { await biometricDisable(); toast('Fingerprint unlock is off'); }
      render(root, ctx);
    }, 'Fingerprint unlock')) : null,
    row('Master password', 'Old backups still open with the password they were made with', h('button', { class: 'btn ghost', onclick: () => changePasswordSheet() }, 'Change')),
    row('Lock now', null, h('button', { class: 'btn ghost', onclick: () => ctx.lock() }, icon('lock'), 'Lock')));

  // Reminders
  const perm = notify.permissionState();
  const reminders = section('Reminders',
    perm !== 'native' && perm !== 'granted' ? row('Notifications', perm === 'denied' ? 'Blocked. Allow notifications for this site in your browser settings.' : perm === 'unsupported' ? 'This browser does not support notifications.' : 'Allow notifications for task and journal reminders.',
      perm === 'default' ? h('button', { class: 'btn primary', onclick: async () => { await notify.requestPermission(); render(root, ctx); } }, 'Allow') : h('span')) : null,
    row('Daily journal reminder', 'A nudge to write every day', toggle(s.dailyReminder, async (on) => { await set({ dailyReminder: on }); if (on) await notify.requestPermission(); notify.rescheduleAll(); }, 'Daily journal reminder')),
    row('Reminder time', null, h('input', { type: 'time', class: 'input slim', value: s.dailyReminderTime, 'aria-label': 'Reminder time', onchange: async (e) => { await set({ dailyReminderTime: e.target.value || '21:00' }); notify.rescheduleAll(); } })),
    !isNative() ? h('p', { class: 'hint pad' }, 'In the browser, reminders appear while Next Journals is open. The Android app delivers them even when closed.') : null);

  // On-Device AI
  const aiEnabled = ai.isAiEnabled();
  const aiSection = section('On-Device AI (Cactus Needle)',
    row('Smart Assistant', 'Analyze journal entries for tasks, mood and tags locally',
      toggle(aiEnabled, (on) => {
        ai.setAiEnabled(on);
        toast(on ? 'On-Device AI enabled' : 'On-Device AI disabled');
        render(root, ctx);
      }, 'On-Device AI')),
    row('Privacy guarantee', 'Zero-knowledge: 100% offline on this device. No text is ever uploaded.',
      h('span', { class: 'chip on', style: 'border-color: var(--success); color: var(--success);' }, '100% Local & Private')),
    row('Engine status', 'Cactus Needle Architecture',
      h('span', { class: 'muted' }, ai.AI_CONFIG.version)));

  // Backup (local)
  const local = section('Backup on this device',
    row('Create encrypted backup', `Saves a .njbackup file locked with your master password. Last: ${timeAgo(lastLocalBackup())}`, h('button', { class: 'btn primary', onclick: exportLocal }, icon('download'), 'Back up')),
    row('Restore from file', 'Merge or replace with a .njbackup file', h('button', { class: 'btn ghost', onclick: () => importLocal(ctx.refresh) }, icon('upload'), 'Restore')));

  // Google Drive
  const acc = drive.account();
  const cloud = section('Google Drive backup',
    acc
      ? row(acc.name || 'Google account', acc.email, h('button', { class: 'btn ghost', onclick: async () => { await drive.signOut(); toast('Disconnected from Google'); render(root, ctx); } }, 'Disconnect'))
      : row('Connect Google Drive', 'Backups are encrypted before upload and saved in your own Drive, folder “Next Journals Backups”.', h('button', { class: 'btn primary', onclick: async () => {
          const b = busy('Opening Google sign-in…');
          try { await drive.signIn(); b.done(); toast('Google Drive connected', 'success'); } catch (e) { b.done(); toast(e.message, 'error', 4500); }
          render(root, ctx);
        } }, icon('google'), 'Sign in with Google')),
    acc ? row('Back up now', `Last Drive backup: ${timeAgo(lastDriveBackup())}`, h('button', { class: 'btn primary', onclick: async () => { await runDriveBackup(); render(root, ctx); } }, icon('cloud'), 'Back up')) : null,
    acc ? row('Automatic backup', 'Runs when the diary is open and signed in', sel(s.driveAuto, [['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly']], (v) => set({ driveAuto: v }), 'Automatic backup')) : null,
    acc ? row('Keep', 'Older backups are deleted automatically', sel(s.driveKeep, [[5, 'Last 5'], [10, 'Last 10'], [30, 'Last 30'], [100, 'Last 100']], (v) => set({ driveKeep: Number(v) }), 'Backups to keep')) : null,
    acc ? row('Restore from Drive', 'Pick a backup to merge or replace', h('button', { class: 'btn ghost', onclick: () => driveRestore(ctx.refresh) }, icon('download'), 'Browse')) : null);

  // Danger zone
  const danger = section('Danger zone',
    row('Erase everything', 'Deletes all journals, tasks, passwords, lists and files from this device. Backups are not touched.', h('button', { class: 'btn danger', onclick: async () => {
      if (!(await confirmDialog('Everything on this device will be erased permanently. Make a backup first if you need one.', { ok: 'Erase everything' }))) return;
      const pw = await promptDialog({ title: 'Confirm with password', label: 'Master password', type: 'password', ok: 'Erase' });
      if (!pw || !(await db.verifyPassword(pw))) return toast('Wrong password', 'error');
      await biometricDisable();
      await db.destroyEverything();
      location.reload();
    } }, 'Erase')));

  const stats = { entries: store.db.all('entry').length, tasks: store.db.all('task').length, passwords: store.db.all('password').length, media: store.db.all('media').length };
  root.append(pageHead('Settings'), appearance, security, reminders, aiSection, local, cloud, danger,
    h('footer', { class: 'about' },
      h('b', {}, `${APP.name} ${APP.version}`), h('span', {}, 'by ' + APP.company),
      h('small', { class: 'muted' }, `${stats.entries} entries · ${stats.tasks} tasks · ${stats.passwords} passwords · ${stats.media} files`),
      h('small', { class: 'muted' }, 'AES-256-GCM encryption · PBKDF2-SHA256 600,000 iterations'),
      h('p', { style: 'margin-top: 10px; font-size: 13px;' },
        h('a', { href: 'privacy.html', target: '_blank', style: 'color: var(--muted); text-decoration: underline; margin-right: 14px;' }, 'Privacy Policy'),
        h('a', { href: 'terms.html', target: '_blank', style: 'color: var(--muted); text-decoration: underline;' }, 'Terms of Service'))));
}

function changePasswordSheet() {
  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Current password' });
  const n1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', 'aria-label': 'New password' });
  const n2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', 'aria-label': 'Repeat new password' });
  const err = h('p', { class: 'error', role: 'alert' });
  const s = openSheet(h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (n1.value.length < 8) return err.textContent = 'New password needs at least 8 characters.';
    if (n1.value !== n2.value) return err.textContent = 'New passwords do not match.';
    const b = busy('Re-securing your diary…');
    try {
      await db.changePassword(cur.value, n1.value);
      if (biometricEnabled()) { try { await biometricEnable(n1.value); } catch { await biometricDisable(); } }
      b.done(); s.close(); toast('Password changed', 'success');
    } catch (e2) { b.done(); err.textContent = e2.message; }
  } },
    h('label', { class: 'field' }, h('span', {}, 'Current password'), cur),
    h('label', { class: 'field' }, h('span', {}, 'New password'), n1),
    h('label', { class: 'field' }, h('span', {}, 'Repeat new password'), n2),
    err,
    h('button', { class: 'btn primary block', type: 'submit' }, 'Change password')), { title: 'Change master password' });
}
