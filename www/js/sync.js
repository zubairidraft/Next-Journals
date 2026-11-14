// Live Bidirectional Sync with Google Drive
// Merges local and remote records without deleting or overwriting data from either device.
// 100% Client-side, Zero-Knowledge AES-256-GCM.

import * as db from './db.js';
import * as store from './store.js';
import * as drive from './drive.js';
import * as backup from './backup.js';
import { h, icon, toast, promptDialog } from './ui.js';
import * as notify from './notify.js';

let syncing = false;
const listeners = new Set();
let debouncedTimer = null;

export const isSyncing = () => syncing;
export const lastSyncTime = () => Number(localStorage.getItem('nj-last-sync') || 0);

export function onSyncStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyStatus(state, info) {
  listeners.forEach(fn => {
    try { fn(state, info); } catch (e) { console.warn(e); }
  });
}

// Schedules silent background sync after user changes data
export function scheduleDebouncedSync(delayMs = 4000) {
  clearTimeout(debouncedTimer);
  debouncedTimer = setTimeout(() => {
    if (drive.isConnected()) {
      smartSync({ quiet: true }).catch(() => {});
    }
  }, delayMs);
}

// Live Bidirectional Smart Sync — 100% Background, Zero Popups!
export async function smartSync({ quiet = false } = {}) {
  if (syncing) return { ok: false, message: 'Sync already in progress' };
  if (!db.isUnlocked()) return { ok: false, message: 'Diary is locked' };

  // 1. Check if Google Drive is connected
  if (!drive.isConnected()) {
    if (!quiet) toast('Google Drive is not connected. Connect in Settings.', 'info');
    return { ok: false, message: 'Google Drive not connected' };
  }

  // 2. Ensure valid token silently in background — NEVER open popup modal on sync!
  try {
    await drive.ensureValidToken({ silentOnly: true });
  } catch (e) {
    if (!quiet) toast(e.message || 'Google session expired. Reconnect in Settings.', 'error');
    return { ok: false, error: e.message };
  }

  syncing = true;
  notifyStatus('start');

  try {
    // 2. Fetch list of remote backups from Google Drive folder
    const files = await drive.listBackups();
    let receivedCount = 0;
    let updatedCount = 0;
    let receivedMediaCount = 0;

    // 3. If there are remote backups, merge the latest one
    if (files && files.length > 0) {
      const latest = files[0];

      // Download remote backup bytes
      const remoteBytes = await drive.downloadBackup(latest.id);
      let sessionPw = db.getSessionPassword();
      let pkg = null;

      try {
        pkg = await backup.decryptBackup(remoteBytes, sessionPw);
      } catch (err) {
        // Fallback: prompt for master password if session password is not set or differs
        const pw = await promptDialog({
          title: 'Google Drive Sync',
          label: 'Master password used for this backup',
          type: 'password',
          ok: 'Unlock & Sync'
        });
        if (!pw) throw new Error('Password required to decrypt remote backup');
        pkg = await backup.decryptBackup(remoteBytes, pw);
        db.setSessionPassword(pw);
      }

      // Merge records
      const localRecords = db.all();
      const localMap = new Map(localRecords.map(r => [r.id, r]));
      const localTombstones = await db.getTombstones();
      const remoteTombstones = pkg.manifest.tombstones || {};

      // A. Merge remote tombstones (deletions from another device)
      for (const [delId, delTime] of Object.entries(remoteTombstones)) {
        const localRec = localMap.get(delId);
        if (localRec && delTime > (localRec.updated || 0)) {
          await db.remove(delId);
          localMap.delete(delId);
        }
      }

      // B. Merge remote records
      const toWrite = [];
      for (const remoteRec of pkg.manifest.records) {
        if (remoteRec.type === 'settings') continue; // preserve local theme/appearance settings

        // Check if deleted locally
        const localDelTime = localTombstones[remoteRec.id];
        if (localDelTime && localDelTime > (remoteRec.updated || 0)) {
          continue; // record was deleted locally, do not resurrect
        }

        const localRec = localMap.get(remoteRec.id);
        if (!localRec) {
          // Remote has an item not present locally
          toWrite.push(remoteRec);
          receivedCount++;
        } else if ((remoteRec.updated || 0) > (localRec.updated || 0)) {
          // Remote is newer
          toWrite.push(remoteRec);
          updatedCount++;
        }
      }

      if (toWrite.length > 0) {
        await db.putMany(toWrite);
      }

      // C. Merge media blobs
      const localBlobIds = new Set(await db.blobIds());
      for (const b of pkg.blobs) {
        if (!localBlobIds.has(b.id)) {
          await db.putBlob(b.id, b.bytes);
          receivedMediaCount++;
        }
      }
    }

    // 4. Create and upload the unified merged backup back to Google Drive
    // This ensures Google Drive contains the combined, newest state of both devices!
    const { bytes } = await backup.createBackup();
    const uploadedFile = await drive.uploadBackup(bytes, backup.backupFileName());
    if (uploadedFile && uploadedFile.id) {
      localStorage.setItem('nj-last-merged-drive-id', uploadedFile.id);
    }
    localStorage.setItem('nj-last-drive', Date.now());
    localStorage.setItem('nj-last-sync', Date.now());

    // Prune older backups
    await drive.pruneBackups(store.settings().driveKeep || 10).catch(() => {});

    // Reschedule reminders
    notify.rescheduleAll().catch(console.warn);

    syncing = false;
    notifyStatus('success', { receivedCount, updatedCount, receivedMediaCount });

    if (!quiet) {
      const totalNew = receivedCount + updatedCount;
      if (totalNew > 0) {
        toast(`Sync complete! ${totalNew} update(s) received.`, 'success');
      } else {
        toast('Sync complete! Everything is up to date.', 'success');
      }
    }

    return { ok: true, received: receivedCount + updatedCount };
  } catch (err) {
    syncing = false;
    notifyStatus('error', err);
    if (!quiet) {
      toast('Sync failed: ' + err.message, 'error', 4500);
    }
    return { ok: false, error: err.message };
  }
}

// Reactive Sync Button component
export function createSyncButton({ cls = '', showLabel = true } = {}) {
  const btn = h('button', {
    class: (showLabel ? 'btn ai-glow-btn slim sync-btn ' : 'icon-btn sync-btn ') + cls,
    type: 'button',
    title: 'Sync with Google Drive',
    'aria-label': 'Sync with Google Drive',
    onclick: () => smartSync({ quiet: false })
  },
    icon('refresh', 16, 'sync-icon'),
    showLabel ? h('span', { class: 'sync-btn-label hide-sm' }, 'Sync') : null
  );

  const updateState = (state) => {
    const iconEl = btn.querySelector('.sync-icon');
    if (state === 'start') {
      btn.disabled = true;
      iconEl && iconEl.classList.add('sync-spinning');
      btn.title = 'Syncing with Google Drive…';
    } else {
      btn.disabled = false;
      iconEl && iconEl.classList.remove('sync-spinning');
      const timeStr = lastSyncTime() ? new Date(lastSyncTime()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      btn.title = timeStr ? `Synced with Google Drive at ${timeStr}` : 'Sync with Google Drive';
    }
  };

  onSyncStatus((state) => updateState(state));
  if (syncing) updateState('start');

  return btn;
}
