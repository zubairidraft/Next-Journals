// Domain helpers on top of the encrypted db: entries, tasks, passwords, lists,
// media, tags and settings.
import * as db from './db.js';
import { uid } from './crypto.js';
import { htmlToText, todayStr } from './ui.js';

export { db };

// ---------- Settings (encrypted record) ----------
const DEFAULT_SETTINGS = {
  id: 'settings', type: 'settings',
  autoLockMin: 5,
  weekStart: 1,              // 0 = Sunday, 1 = Monday
  dailyReminder: false, dailyReminderTime: '21:00',
  backupReminder: true,
  driveAuto: 'off',          // off | daily | weekly
  driveKeep: 10,
  tagColors: {},
};
export function settings() { return { ...DEFAULT_SETTINGS, ...(db.get('settings') || {}) }; }
export async function saveSettings(patch) { return db.put({ ...settings(), ...patch }); }

// ---------- Generic ----------
export const byUpdated = (a, b) => (b.updated || 0) - (a.updated || 0);

// ---------- Journal ----------
export function entries() {
  return db.all('entry').sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || b.created - a.created);
}
export function newEntry(date) {
  const now = new Date();
  return {
    type: 'entry', title: '', html: '', text: '', date: date || todayStr(),
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    mood: null, tags: [], media: [], favorite: false,
  };
}
export async function saveEntry(e) {
  e.text = htmlToText(e.html);
  return db.put(e);
}
export async function deleteEntry(e) {
  for (const mid of e.media || []) await deleteMedia(mid);
  await db.remove(e.id);
}

export function streak() {
  const days = new Set(db.all('entry').map(e => e.date));
  let n = 0;
  const d = new Date();
  if (!days.has(todayStr())) d.setDate(d.getDate() - 1); // today not written yet doesn't break the streak
  while (true) {
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!days.has(s)) break;
    n++; d.setDate(d.getDate() - 1);
  }
  return n;
}

export function onThisDay() {
  const md = todayStr().slice(5);
  const year = todayStr().slice(0, 4);
  return db.all('entry').filter(e => e.date.slice(5) === md && e.date.slice(0, 4) !== year)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- Tasks ----------
export function tasks() { return db.all('task'); }
export function newTask(due) {
  return { type: 'task', title: '', notes: '', due: due || '', priority: 2, repeat: 'none', subtasks: [], remind: 0, tags: [], done: false };
}
// remind: 0 = off, otherwise minutes before due (use 1 for "at due time")
export function nextDue(due, repeat) {
  if (!due) return due;
  const hasTime = due.length > 10;
  const d = new Date(hasTime ? due : due + 'T00:00');
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
  const p = (n) => String(n).padStart(2, '0');
  const ds = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return hasTime ? `${ds}T${p(d.getHours())}:${p(d.getMinutes())}` : ds;
}
export async function toggleTask(t) {
  if (!t.done && t.repeat && t.repeat !== 'none' && t.due) {
    // Repeating task: move to the next occurrence instead of closing it
    t.due = nextDue(t.due, t.repeat);
    t.lastDone = Date.now();
    t.subtasks = (t.subtasks || []).map(s => ({ ...s, done: false }));
  } else {
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
  }
  return db.put(t);
}
export const taskDueDate = (t) => (t.due || '').slice(0, 10);

// ---------- Passwords ----------
export const CATEGORIES = ['Personal', 'Social', 'Email', 'Banking', 'Work', 'Shopping', 'Wi-Fi', 'Other'];
export function passwords() { return db.all('password').sort((a, b) => (a.name || '').localeCompare(b.name || '')); }
export function newPassword() { return { type: 'password', name: '', username: '', password: '', url: '', category: 'Personal', notes: '', tags: [], favorite: false }; }

// ---------- Lists & notes ----------
export const LIST_COLORS = ['plain', 'sky', 'sage', 'sand', 'rose', 'lilac'];
export function lists() {
  return db.all('list').sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || byUpdated(a, b));
}
export function newList(kind = 'checklist') { return { type: 'list', kind, title: '', items: [], body: '', color: 'plain', pinned: false, tags: [] }; }

// ---------- Media ----------
const urlCache = new Map();

export async function addMediaFile(file, ownerId) {
  const id = uid();
  const bytes = new Uint8Array(await file.arrayBuffer());
  await db.putBlob(id, bytes);
  let thumb = false;
  if (file.type.startsWith('image/')) {
    try {
      const t = await makeThumb(file);
      if (t) { await db.putBlob(id + '_t', t); thumb = true; }
    } catch (e) { console.warn('thumb failed', e); }
  }
  const rec = { id, type: 'media', name: file.name || 'file', mime: file.type || 'application/octet-stream', size: bytes.length, owner: ownerId || null, thumb };
  await db.put(rec);
  return rec;
}

async function makeThumb(file) {
  const bmp = await createImageBitmap(file);
  const max = 360;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.78));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

export async function mediaURL(id, { thumb = false } = {}) {
  const rec = db.get(id);
  if (!rec) return null;
  const key = thumb && rec.thumb ? id + '_t' : id;
  if (urlCache.has(key)) return urlCache.get(key);
  const bytes = await db.getBlob(key);
  if (!bytes) return null;
  const url = URL.createObjectURL(new Blob([bytes], { type: key.endsWith('_t') ? 'image/jpeg' : rec.mime }));
  urlCache.set(key, url);
  return url;
}

export function revokeAllURLs() {
  for (const u of urlCache.values()) URL.revokeObjectURL(u);
  urlCache.clear();
}

export async function deleteMedia(id) {
  const rec = db.get(id);
  await db.removeBlob(id);
  if (rec && rec.thumb) await db.removeBlob(id + '_t');
  for (const k of [id, id + '_t']) if (urlCache.has(k)) { URL.revokeObjectURL(urlCache.get(k)); urlCache.delete(k); }
  if (rec) await db.remove(id);
}

export function mediaKind(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

// ---------- Tags ----------
const TAGGED = ['entry', 'task', 'password', 'list'];
export function allTags() {
  const counts = new Map();
  for (const r of db.all()) {
    if (!TAGGED.includes(r.type)) continue;
    for (const t of r.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}
export const TAG_COLORS = ['ink', 'ribbon', 'sage', 'rose', 'sky', 'lilac', 'slate'];
export function tagColor(name) {
  const c = settings().tagColors[name];
  if (c) return c;
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
export function itemsWithTag(tag) {
  return db.all().filter(r => TAGGED.includes(r.type) && (r.tags || []).includes(tag));
}
export async function renameTag(oldName, newName) {
  const recs = itemsWithTag(oldName).map(r => ({ ...r, tags: Array.from(new Set(r.tags.map(t => t === oldName ? newName : t))) }));
  await db.putMany(recs.map(r => ({ ...r, updated: Date.now() })));
}
export async function deleteTag(name) {
  const recs = itemsWithTag(name).map(r => ({ ...r, tags: r.tags.filter(t => t !== name), updated: Date.now() }));
  await db.putMany(recs);
}

// ---------- Search ----------
export function search(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const hay = (r) => {
    switch (r.type) {
      case 'entry': return [r.title, r.text, (r.tags || []).join(' '), r.date].join(' ');
      case 'task': return [r.title, r.notes, (r.subtasks || []).map(s => s.text).join(' '), (r.tags || []).join(' ')].join(' ');
      case 'password': return [r.name, r.username, r.url, r.category, r.notes, (r.tags || []).join(' ')].join(' ');
      case 'list': return [r.title, r.body, (r.items || []).map(i => i.text).join(' '), (r.tags || []).join(' ')].join(' ');
      case 'media': return r.name;
      default: return '';
    }
  };
  return db.all().filter(r => r.type !== 'settings' && terms.every(t => hay(r).toLowerCase().includes(t)));
}
