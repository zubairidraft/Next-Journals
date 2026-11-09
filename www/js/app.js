// Next Journals — app shell, router, auto-lock
import { h, icon, toast, openSheet, closeTopSheet, $ } from './ui.js';
import * as db from './db.js';
import * as store from './store.js';
import * as notify from './notify.js';
import { APP } from './config.js';
import { isNative, plugin } from './native.js';
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

// ---------- Theme ----------
function applyTheme() {
  const t = localStorage.getItem('nj-theme') || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#0F1527' : '#1B2744';
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
});

// ---------- Shell ----------
function buildShell() {
  root.innerHTML = '';
  const navLink = ([key, label, ic]) => h('a', { class: 'nav-item', href: '#/' + key, 'data-key': key }, icon(ic, 20), h('span', {}, label));
  const rail = h('aside', { class: 'rail', 'aria-label': 'Main navigation' },
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, icon('journal', 20)), h('div', {}, h('b', {}, APP.name), h('small', {}, 'by ' + APP.company))),
    h('a', { class: 'btn primary block new-btn', href: '#/journal/new' }, icon('plus'), 'New entry'),
    h('nav', { class: 'nav' }, NAV.map(navLink)),
    h('button', { class: 'nav-item lock-btn', onclick: lock }, icon('lock', 20), h('span', {}, 'Lock')));

  const more = () => {
    const s = openSheet(h('div', { class: 'more-grid' },
      NAV.filter(n => !TABS.includes(n[0])).map(([key, label, ic]) => h('a', { class: 'more-item', href: '#/' + key, onclick: () => s.close() }, icon(ic, 24), h('span', {}, label))),
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
