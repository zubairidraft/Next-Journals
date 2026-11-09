// Small UI toolkit: element builder, icons, toasts, sheets, dialogs, formatting.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Icons (24px stroke icons) ----------
const P = {
  journal: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v16H6.5A1.5 1.5 0 0 0 5 20.5v-16Z"/><path d="M5 20.5A1.5 1.5 0 0 0 6.5 22H19v-3"/><path d="M9 7h6M9 11h4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  tasks: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12 3 3 5-6"/>',
  vault: '<rect x="4" y="10.5" width="16" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><circle cx="12" cy="15.5" r="1.4"/>',
  lists: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
  media: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5L6 19.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  tag: '<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7 7a1.4 1.4 0 0 1-2 0l-8.1-7.9Z"/><circle cx="8" cy="8" r="1.4"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  clip: '<path d="m20 11.5-8.3 8.3a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M4 4l16 16M10 6a9 9 0 0 1 2-.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.8M6.5 7.6A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1M9.9 9.9a2.8 2.8 0 0 0 4 4"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.6 1.4A3.4 3.4 0 0 0 7 18.5Z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M4.5 20h15"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5l1.5-2ZM10 20.5a2 2 0 0 0 4 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  finger: '<path d="M8.5 20.5c-1-2-1.5-4.4-1.5-7a5 5 0 0 1 10 0c0 1.2-.1 2.3-.3 3.4M12 13.5c0 3-.6 5.5-1.8 7.5M14.8 20c.5-1.3.8-2.7 1-4.1M4.5 16.5A13 13 0 0 1 4 13.5a8 8 0 0 1 13.4-5.9M19.6 10.5c.3 1 .4 2 .4 3"/><path d="M9.6 13.5a2.4 2.4 0 0 1 4.8 0"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  file: '<path d="M6 3.5h8l4.5 4.5v12.5H6V3.5Z"/><path d="M14 3.5V8h4.5"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  pin: '<path d="M9 3.5h6l-1 6 4 3.5H6l4-3.5-1-6ZM12 13v7.5"/>',
  bold: '<path d="M7 4.5h6a3.5 3.5 0 0 1 0 7H7zM7 11.5h7a3.8 3.8 0 0 1 0 7.5H7z"/>',
  italic: '<path d="M10 4.5h8M6 19.5h8M14.5 4.5l-5 15"/>',
  underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20.5h14"/>',
  heading: '<path d="M6 4.5v15M18 4.5v15M6 12h12"/>',
  ul: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
  ol: '<path d="M10 6.5h10M10 12h10M10 17.5h10M4 5l1.5-1v5M3.5 14.5c.3-.9 2.5-1 2.5.4 0 1-2.5 2-2.5 3.1H6"/>',
  quote: '<path d="M5 17.5c2.5 0 4-1.8 4-4.5V7H4.5v6H8M15 17.5c2.5 0 4-1.8 4-4.5V7h-4.5v6H18"/>',
  wand: '<path d="m4 20 11-11M14 4.5v2M19.5 10h-2M17.5 6.5 16 8M10 4l.5 1.5L12 6l-1.5.5L10 8l-.5-1.5L8 6l1.5-.5L10 4ZM19 14l.5 1.5L21 16l-1.5.5L19 18l-.5-1.5L17 16l1.5-.5L19 14Z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  google: '<path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.7-1.6 2.7-4 2.7-7Z" fill="#4285F4" stroke="none"/><path d="M12 21.5c2.6 0 4.7-.9 6.3-2.3l-3.1-2.4c-.9.6-2 .9-3.2.9-2.5 0-4.6-1.7-5.3-3.9H3.5v2.5A9.5 9.5 0 0 0 12 21.5Z" fill="#34A853" stroke="none"/><path d="M6.7 13.8a5.7 5.7 0 0 1 0-3.6V7.7H3.5a9.5 9.5 0 0 0 0 8.6l3.2-2.5Z" fill="#FBBC05" stroke="none"/><path d="M12 6.3c1.4 0 2.6.5 3.6 1.4l2.7-2.7A9.5 9.5 0 0 0 3.5 7.7l3.2 2.5C7.4 8 9.5 6.3 12 6.3Z" fill="#EA4335" stroke="none"/>',
};

export function icon(name, size = 20, cls = '') {
  const span = document.createElement('span');
  span.className = 'ic ' + cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return span;
}

export function iconBtn(name, label, onclick, cls = '') {
  return h('button', { class: 'icon-btn ' + cls, type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
}

// ---------- Toasts ----------
export function toast(msg, type = 'info', ms = 2600) {
  let wrap = $('#toasts');
  if (!wrap) { wrap = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(wrap); }
  const t = h('div', { class: 'toast ' + type }, msg);
  wrap.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- Sheets / dialogs ----------
const stack = [];
export function openSheet(content, { title, wide = false, onClose } = {}) {
  const close = () => {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 180);
    const i = stack.indexOf(close); if (i > -1) stack.splice(i, 1);
    onClose && onClose();
  };
  const panel = h('div', { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    title ? h('div', { class: 'sheet-head' }, h('h2', {}, title), iconBtn('x', 'Close', close)) : null,
    h('div', { class: 'sheet-body' }, content)
  );
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } }, panel);
  document.body.append(overlay);
  stack.push(close);
  setTimeout(() => { const f = panel.querySelector('input:not([type=hidden]),textarea,select,[contenteditable]'); f && !matchMedia('(pointer:coarse)').matches && f.focus(); }, 60);
  return { close, panel };
}

export function closeTopSheet() { const c = stack[stack.length - 1]; if (c) { c(); return true; } return false; }

export function confirmDialog(message, { ok = 'Delete', danger = true, title = 'Are you sure?' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; s.close(); resolve(v); };
    const s = openSheet(h('div', {},
      h('p', { class: 'dialog-msg' }, message),
      h('div', { class: 'row end gap' },
        h('button', { class: 'btn ghost', onclick: () => finish(false) }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => finish(true) }, ok))
    ), { title, onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

export function promptDialog({ title, label, type = 'text', value = '', ok = 'OK', hint }) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { class: 'input', type, value, autocomplete: type === 'password' ? 'current-password' : 'off' });
    const finish = (v) => { if (done) return; done = true; s.close(); resolve(v); };
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); finish(input.value); } },
      h('label', { class: 'field' }, h('span', {}, label), input),
      hint ? h('p', { class: 'hint' }, hint) : null,
      h('div', { class: 'row end gap' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(null) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, ok))
    );
    const s = openSheet(form, { title, onClose: () => { if (!done) { done = true; resolve(null); } } });
  });
}

export function busy(message) {
  const label = h('p', {}, message);
  const el = h('div', { class: 'busy' }, h('div', { class: 'spinner' }), label);
  document.body.append(el);
  return { update: (m) => { label.textContent = m; }, done: () => el.remove() };
}

// ---------- Formatting ----------
export const pad = (n) => String(n).padStart(2, '0');
export const todayStr = () => dateStr(new Date());
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function fmtDate(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!s) return '';
  const d = typeof s === 'string' && s.length === 10 ? parseDate(s) : new Date(s);
  return d.toLocaleDateString(undefined, opts);
}

export function fmtDue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const diff = Math.round((dd - t) / 86400000);
  const time = iso.length > 10 ? ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  if (diff === 0) return 'Today' + time;
  if (diff === 1) return 'Tomorrow' + time;
  if (diff === -1) return 'Yesterday' + time;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + time;
}

export function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' days ago';
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

// ---------- HTML sanitizer for rich text ----------
const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'DIV', 'SPAN', 'A', 'HR', 'MARK']);
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        if (!ALLOWED.has(child.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(child.tagName)) { child.remove(); continue; }
          walk(child);
          child.replaceWith(...child.childNodes);
          continue;
        }
        for (const a of Array.from(child.attributes)) {
          const ok = child.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value);
          if (!ok) child.removeAttribute(a.name);
        }
        if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener'); }
        walk(child);
      } else if (child.nodeType !== 3) child.remove();
    }
  };
  const root = doc.body.firstChild;
  walk(root);
  return root.innerHTML;
}

export const htmlToText = (html) => {
  const d = new DOMParser().parseFromString(html || '', 'text/html');
  d.querySelectorAll('br,p,div,li,h2,h3,blockquote').forEach(el => el.append(' '));
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
};

export const MOODS = [
  { v: 1, e: '😞', label: 'Awful', c: 'var(--mood-1)' },
  { v: 2, e: '😕', label: 'Low', c: 'var(--mood-2)' },
  { v: 3, e: '😐', label: 'Okay', c: 'var(--mood-3)' },
  { v: 4, e: '🙂', label: 'Good', c: 'var(--mood-4)' },
  { v: 5, e: '😄', label: 'Great', c: 'var(--mood-5)' },
];
