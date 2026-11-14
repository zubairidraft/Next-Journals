// Next Journals — app shell, router, auto-lock
import { h, icon, toast, openSheet, closeTopSheet, $ } from './ui.js';
import * as db from './db.js';
import * as store from './store.js';
import * as notify from './notify.js';
import { APP } from './config.js';
import { isNative, plugin } from './native.js';
import * as drive from './drive.js';
import * as sync from './sync.js';
import { renderLock } from './views/lock.js';
import * as journal from './views/journal.js';
import * as calendar from './views/calendar.js';
import * as tasks from './views/tasks.js';
import * as vault from './views/vault.js';
import * as lists from './views/lists.js';
import * as browse from './views/browse.js';
import * as settings from './views/settings.js';

const root = document.getElementById('app');
let cleanup = null;
let lockTimer = null;
let hiddenAt = 0;
let backupTimer = null;

const NAV = [
  ['journal', 'Journal', 'journal'],
  ['calendar', 'Calendar', 'calendar'],
  ['tasks', 'Tasks', 'tasks'],
  ['vault', 'Passwords', 'vault'],
  ['lists', 'Lists & notes', 'lists'],
  ['media', 'Media', 'media'],
  ['tags', 'Tags', 'tag'],
  ['search', 'Search', 'search'],
  ['settings', 'Settings', 'settings'],
];
const TABS = ['journal', 'calendar', 'tasks', 'vault'];

// ---------- Theme & Appearance Settings ----------
export const THEMES = {
  navy: {
    name: 'Navy & Amber',
    color: '#1B2744',
    light: { ink: '#1B2744', ink2: '#2D3D66', inkSoft: '#E7EBF4', ribbon: '#E39A2D', ribbonSoft: '#FBEFD9', ribbonInk: '#7A4B08' },
    dark: { ink: '#9DB2EA', ink2: '#B8C8F2', inkSoft: '#1F2A47', ribbon: '#F0AE48', ribbonSoft: '#3A2A12', ribbonInk: '#F7CB86' }
  },
  emerald: {
    name: 'Emerald Forest',
    color: '#134E39',
    light: { ink: '#134E39', ink2: '#1E6B4F', inkSoft: '#E2F3EC', ribbon: '#10B981', ribbonSoft: '#D1FAE5', ribbonInk: '#065F46' },
    dark: { ink: '#6EE7B7', ink2: '#A7F3D0', inkSoft: '#0E3527', ribbon: '#34D399', ribbonSoft: '#064E3B', ribbonInk: '#A7F3D0' }
  },
  purple: {
    name: 'Royal Amethyst',
    color: '#43236A',
    light: { ink: '#3B1B54', ink2: '#552779', inkSoft: '#F1E8FA', ribbon: '#8B5CF6', ribbonSoft: '#EDE9FE', ribbonInk: '#5B21B6' },
    dark: { ink: '#C4B5FD', ink2: '#DDD6FE', inkSoft: '#2B143E', ribbon: '#A78BFA', ribbonSoft: '#4C1D95', ribbonInk: '#DDD6FE' }
  },
  rose: {
    name: 'Crimson Rose',
    color: '#E11D48',
    light: { ink: '#4C121E', ink2: '#6E1B2C', inkSoft: '#FCE7EC', ribbon: '#E11D48', ribbonSoft: '#FFE4E6', ribbonInk: '#881337' },
    dark: { ink: '#FDA4AF', ink2: '#FECDD3', inkSoft: '#380C16', ribbon: '#FB7185', ribbonSoft: '#4C0519', ribbonInk: '#FECDD3' }
  },
  sky: {
    name: 'Ocean Azure',
    color: '#0284C7',
    light: { ink: '#0C4264', ink2: '#135F8E', inkSoft: '#E0F2FE', ribbon: '#0284C7', ribbonSoft: '#E0F2FE', ribbonInk: '#0369A1' },
    dark: { ink: '#7DD3FC', ink2: '#BAE6FD', inkSoft: '#082F49', ribbon: '#38BDF8', ribbonSoft: '#0C4A6E', ribbonInk: '#BAE6FD' }
  },
  amber: {
    name: 'Autumn Amber',
    color: '#D97706',
    light: { ink: '#452205', ink2: '#6A3408', inkSoft: '#FEF3C7', ribbon: '#D97706', ribbonSoft: '#FEF3C7', ribbonInk: '#78350F' },
    dark: { ink: '#FCD34D', ink2: '#FDE68A', inkSoft: '#331A03', ribbon: '#FBBF24', ribbonSoft: '#451A03', ribbonInk: '#FDE68A' }
  },
  slate: {
    name: 'Midnight Charcoal',
    color: '#475569',
    light: { ink: '#1E293B', ink2: '#334155', inkSoft: '#E2E8F0', ribbon: '#475569', ribbonSoft: '#F1F5F9', ribbonInk: '#0F172A' },
    dark: { ink: '#94A3B8', ink2: '#CBD5E1', inkSoft: '#1E293B', ribbon: '#64748B', ribbonSoft: '#0F172A', ribbonInk: '#E2E8F0' }
  }
};

export const FONTS = {
  manrope: { name: 'Manrope (Modern Sans)', value: "'Manrope', system-ui, -apple-system, sans-serif" },
  literata: { name: 'Literata (Editorial Serif)', value: "'Literata', Georgia, serif" },
  system: { name: 'System Native', value: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  georgia: { name: 'Georgia (Classic Serif)', value: "Georgia, 'Times New Roman', serif" },
  mono: { name: 'Monospace (Typewriter)', value: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" }
};

export const TEXT_CONTRASTS = {
  default: { name: 'Default', light: '#182035', dark: '#E5E9F3' },
  'high-contrast': { name: 'High Contrast (Pure)', light: '#000000', dark: '#FFFFFF' },
  warm: { name: 'Warm Charcoal', light: '#2D2421', dark: '#F5EBE6' },
  sepia: { name: 'Sepia Reading', light: '#3D2E1E', dark: '#EFE6D5' }
};

export function applyTheme() {
  const t = localStorage.getItem('nj-theme') || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const root = document.documentElement;

  // 1. Global Color Theme / Accent
  const themeKey = localStorage.getItem('nj-color-theme') || 'navy';
  const customColor = localStorage.getItem('nj-custom-color');
  if (themeKey === 'custom' && customColor) {
    root.style.setProperty('--ribbon', customColor);
    root.style.setProperty('--ribbon-soft', customColor + '26');
    root.style.setProperty('--ink', customColor);
  } else {
    const palette = THEMES[themeKey] || THEMES.navy;
    const colors = dark ? palette.dark : palette.light;
    root.style.setProperty('--ink', colors.ink);
    root.style.setProperty('--ink-2', colors.ink2);
    root.style.setProperty('--ink-soft', colors.inkSoft);
    root.style.setProperty('--ribbon', colors.ribbon);
    root.style.setProperty('--ribbon-soft', colors.ribbonSoft);
    root.style.setProperty('--ribbon-ink', colors.ribbonInk);
  }

  // 2. Global Font
  const fontKey = localStorage.getItem('nj-font') || 'manrope';
  const fontDef = FONTS[fontKey] || FONTS.manrope;
  root.style.setProperty('--sans', fontDef.value);
  if (fontKey === 'literata' || fontKey === 'georgia') {
    root.style.setProperty('--serif', fontDef.value);
  }

  // 3. Global Text Color
  const contrastKey = localStorage.getItem('nj-text-contrast') || 'default';
  const contrastDef = TEXT_CONTRASTS[contrastKey] || TEXT_CONTRASTS.default;
  const textColor = dark ? contrastDef.dark : contrastDef.light;
  root.style.setProperty('--text', textColor);

  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) {
    const pal = THEMES[themeKey] || THEMES.navy;
    meta.content = dark ? '#0F1527' : (pal.light ? pal.light.ink : '#1B2744');
  }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
applyTheme();

// ---------- Lock / unlock ----------
function lock() {
  if (!db.isUnlocked()) return;
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  while (closeTopSheet()) {}
  store.revokeAllURLs();
  notify.stopAll();
  db.lockVault();
  clearInterval(backupTimer);
  showLock();
}

function showLock() {
  document.body.classList.add('locked');
  renderLock(root, onUnlocked);
}

async function onUnlocked(info = {}) {
  document.body.classList.remove('locked');
  buildShell();
  if (!location.hash || location.hash === '#/' || info.firstRun) location.hash = '#/journal';
  route();
  resetAutoLock();
  notify.rescheduleAll().catch(console.warn);
  if (info.firstRun) toast('Your encrypted diary is ready', 'success');
  // Auto-sync on unlock if Google Drive is connected
  if (drive.isConnected()) {
    sync.smartSync({ quiet: true }).catch(() => {});
  }
  runBackupCheck();
  backupTimer = setInterval(runBackupCheck, 3600000);
}

async function runBackupCheck() {
  try {
    const r = await settings.checkAutoBackup();
    const banner = $('#backup-banner');
    if (r === 'due' && banner) {
      banner.hidden = false;
    } else if (banner) banner.hidden = true;
    // Gentle reminder if never backed up and there is real content
    if (!r && store.settings().backupReminder && !settings.lastDriveBackup() && !settings.lastLocalBackup() && store.db.all('entry').length >= 5 && banner) {
      banner.querySelector('span').textContent = 'You have not made a backup yet.';
      banner.hidden = false;
    }
  } catch (e) { console.warn(e); }
}

function resetAutoLock() {
  clearTimeout(lockTimer);
  const min = db.isUnlocked() ? store.settings().autoLockMin : 0;
  if (min > 0) lockTimer = setTimeout(lock, min * 60000);
}
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, () => db.isUnlocked() && resetAutoLock(), { passive: true, capture: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (!db.isUnlocked()) return;
  const min = store.settings().autoLockMin;
  if (min > 0 && hiddenAt && Date.now() - hiddenAt > min * 60000) lock();
  else if (drive.isConnected() && Date.now() - sync.lastSyncTime() > 90000) {
    // Silently sync if returning to app after 90 seconds
    sync.smartSync({ quiet: true }).catch(() => {});
  }
});

// Automatically debounced sync when records are created, updated, or removed
db.onChange((type) => {
  if (type === 'create' || type === 'update' || type === 'delete') {
    sync.scheduleDebouncedSync(4500);
  }
});

// React to sync status changes: spin nav icon and refresh view if remote data arrived
sync.onSyncStatus((state, info) => {
  const navIcon = root.querySelector('.sync-nav-icon');
  if (navIcon) {
    navIcon.classList.toggle('sync-spinning', state === 'start');
  }
  if (state === 'success' && info && (info.receivedCount > 0 || info.updatedCount > 0)) {
    const [path] = location.hash.replace(/^#\/?/, '').split('?');
    const parts = (path || '').split('/').map(decodeURIComponent);
    // Only re-render if user is on list view, not currently typing inside an editor
    if (parts.length < 2 || parts[1] === '') {
      route();
    }
  }
});

// ---------- Shell ----------
function buildShell() {
  root.innerHTML = '';
  const navLink = ([key, label, ic]) => h('a', { class: 'nav-item', href: '#/' + key, 'data-key': key }, icon(ic, 20), h('span', {}, label));
  const rail = h('aside', { class: 'rail', 'aria-label': 'Main navigation' },
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, icon('journal', 20)), h('div', {}, h('b', {}, APP.name), h('small', {}, 'by ' + APP.company))),
    h('a', { class: 'btn primary block new-btn', href: '#/journal/new' }, icon('plus'), 'New entry'),
    h('nav', { class: 'nav' }, NAV.map(navLink)),
    h('button', {
      class: 'nav-item sync-nav-btn',
      type: 'button',
      title: 'Synchronize with Google Drive',
      onclick: () => sync.smartSync({ quiet: false })
    },
      icon('refresh', 20, 'sync-nav-icon'),
      h('span', { class: 'grow' }, 'Sync Drive')
    ),
    h('button', { class: 'nav-item lock-btn', onclick: lock }, icon('lock', 20), h('span', {}, 'Lock')));

  const more = () => {
    const s = openSheet(h('div', { class: 'more-grid' },
      NAV.filter(n => !TABS.includes(n[0])).map(([key, label, ic]) => h('a', { class: 'more-item', href: '#/' + key, onclick: () => s.close() }, icon(ic, 24), h('span', {}, label))),
      h('button', { class: 'more-item', onclick: () => { s.close(); sync.smartSync({ quiet: false }); } }, icon('refresh', 24), h('span', {}, 'Sync Drive')),
      h('button', { class: 'more-item', onclick: () => { s.close(); lock(); } }, icon('lock', 24), h('span', {}, 'Lock'))
    ), { title: 'More' });
  };
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' },
    NAV.filter(n => TABS.includes(n[0])).map(([key, label, ic]) => h('a', { class: 'tab', href: '#/' + key, 'data-key': key }, icon(ic, 22), h('span', {}, label === 'Passwords' ? 'Vault' : label))),
    h('button', { class: 'tab', 'data-key': 'more', onclick: more, 'aria-label': 'More sections' }, icon('more', 22), h('span', {}, 'More')));

  const banner = h('div', { id: 'backup-banner', class: 'banner', hidden: true },
    icon('cloud', 18), h('span', {}, 'Your Google Drive backup is due.'),
    h('a', { class: 'btn small primary', href: '#/settings', onclick: () => { banner.hidden = true; } }, 'Back up'),
    h('button', { class: 'icon-btn small', 'aria-label': 'Dismiss', onclick: () => { banner.hidden = true; } }, icon('x', 16)));

  const fab = h('a', { class: 'fab', href: '#/journal/new', 'aria-label': 'New journal entry' }, icon('plus', 26));
  root.append(h('div', { class: 'shell' }, rail, h('div', { class: 'main' }, banner, h('main', { id: 'view', tabindex: '-1' }), fab), tabbar));
}

// ---------- Router ----------
function route() {
  if (!db.isUnlocked()) return;
  const view = document.getElementById('view');
  if (!view) return;
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  while (closeTopSheet()) {} // leaving a page closes its dialogs
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(qs || '');
  const [section = 'journal', id] = path.split('/').map(decodeURIComponent);
  view.innerHTML = '';
  view.className = 'view v-' + section + (id ? ' detail' : '');
  document.querySelectorAll('[data-key]').forEach(a => a.classList.toggle('active', a.dataset.key === section || (a.dataset.key === 'more' && !TABS.includes(section))));
  document.querySelector('.fab')?.classList.toggle('hidden', !!id || section === 'settings');

  const ctx = { lock, refresh: route, applyTheme, resetAutoLock };
  try {
    switch (section) {
      case 'journal': cleanup = id ? journal.renderEditor(view, id, params) : journal.renderList(view); break;
      case 'calendar': calendar.render(view, params); break;
      case 'tasks': tasks.render(view); break;
      case 'vault': vault.render(view); break;
      case 'lists': cleanup = id ? lists.renderEditor(view, id, params) : lists.render(view); break;
      case 'media': browse.renderMedia(view); break;
      case 'tags': browse.renderTags(view, id); break;
      case 'search': browse.renderSearch(view); break;
      case 'settings': settings.render(view, ctx); break;
      default: location.hash = '#/journal';
    }
  } catch (e) {
    console.error(e);
    view.append(h('p', { class: 'error' }, 'Something went wrong: ' + e.message));
  }
  document.title = `${(NAV.find(n => n[0] === section) || [, APP.name])[1]} · ${APP.name}`;
  if (!id) view.scrollTop = 0, window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// Keyboard shortcuts (desktop)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && closeTopSheet()) return;
  if (!db.isUnlocked()) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); location.hash = '#/search'; }
  if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); lock(); }
});

// ---------- Android integration ----------
if (isNative()) {
  document.body.classList.add('native');
  const App = plugin('App');
  App && App.addListener('backButton', () => {
    if (closeTopSheet()) return;
    const h0 = location.hash;
    if (!db.isUnlocked() || h0 === '#/journal' || h0 === '' || h0 === '#/') App.minimizeApp ? App.minimizeApp() : App.exitApp();
    else if (h0.split('/').length > 2) history.back();
    else location.hash = '#/journal';
  });
  App && App.addListener('pause', () => { hiddenAt = Date.now(); });
  App && App.addListener('resume', () => {
    if (!db.isUnlocked()) return;
    const min = store.settings().autoLockMin;
    if (min > 0 && hiddenAt && Date.now() - hiddenAt > min * 60000) lock();
  });
  notify.onNotificationTap((r) => { location.hash = r; });
}

// ---------- Service worker (offline support, browser only) ----------
if (!isNative() && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Ask the browser to keep our storage (prevents silent eviction)
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

showLock();
