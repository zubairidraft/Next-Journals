// Shared widgets: tag input, tag chips, media thumbnails/viewer, voice recorder.
import { h, icon, iconBtn, openSheet, toast, fmtSize, esc } from './ui.js';
import * as store from './store.js';
import { saveFile } from './native.js';
import { createSyncButton } from './sync.js';

export function tagChip(name, { onRemove, onClick } = {}) {
  return h('span', { class: 'tag t-' + store.tagColor(name), onclick: onClick ? (e) => { e.stopPropagation(); onClick(name); } : null },
    '#' + name,
    onRemove ? h('button', { type: 'button', class: 'tag-x', 'aria-label': 'Remove tag ' + name, onclick: (e) => { e.stopPropagation(); onRemove(name); } }, '×') : null);
}

export function tagChips(tags = [], onClick) {
  if (!tags.length) return null;
  return h('span', { class: 'tags' }, tags.map(t => tagChip(t, { onClick: onClick || ((n) => { location.hash = '#/tags/' + encodeURIComponent(n); }) })));
}

export function tagInput(initial = [], onChange) {
  let tags = [...initial];
  const listId = 'tags-' + Math.random().toString(36).slice(2);
  const wrap = h('div', { class: 'tag-input' });
  const input = h('input', { class: 'tag-field', placeholder: 'Add tag', list: listId, 'aria-label': 'Add tag', enterkeyhint: 'done' });
  const dl = h('datalist', { id: listId }, store.allTags().map(t => h('option', { value: t.name })));
  const add = (raw) => {
    const t = raw.trim().replace(/^#/, '').replace(/[,\s]+/g, '-').toLowerCase();
    if (t && !tags.includes(t)) { tags.push(t); onChange(tags); draw(); }
    input.value = '';
  };
  const draw = () => {
    wrap.innerHTML = '';
    tags.forEach(t => wrap.append(tagChip(t, { onRemove: (n) => { tags = tags.filter(x => x !== n); onChange(tags); draw(); } })));
    wrap.append(input, dl);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); }
    if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); onChange(tags); draw(); input.focus(); }
  });
  input.addEventListener('change', () => { if (store.allTags().some(t => t.name === input.value)) add(input.value); });
  input.addEventListener('blur', () => { if (input.value) add(input.value); });
  draw();
  return wrap;
}

// ---------- Media ----------
export function mediaThumb(id, { onRemove, onOpen } = {}) {
  const rec = store.db.get(id);
  if (!rec) return null;
  const kind = store.mediaKind(rec.mime);
  const el = h('div', { class: 'thumb k-' + kind, role: 'button', tabindex: '0', title: rec.name,
    onclick: () => (onOpen || openMedia)(id),
    onkeydown: (e) => { if (e.key === 'Enter') (onOpen || openMedia)(id); } });
  if (kind === 'image') {
    const img = h('img', { alt: rec.name, loading: 'lazy' });
    store.mediaURL(id, { thumb: true }).then(u => { if (u) img.src = u; });
    el.append(img);
  } else {
    el.append(icon(kind === 'video' ? 'play' : kind === 'audio' ? 'mic' : 'file', 26),
      h('span', { class: 'thumb-name' }, rec.name));
  }
  if (onRemove) el.append(h('button', { type: 'button', class: 'thumb-x', 'aria-label': 'Remove ' + rec.name, onclick: (e) => { e.stopPropagation(); onRemove(id); } }, '×'));
  return el;
}

export async function openMedia(id) {
  const rec = store.db.get(id);
  if (!rec) return;
  const kind = store.mediaKind(rec.mime);
  const url = await store.mediaURL(id);
  let body;
  if (kind === 'image') body = h('img', { class: 'viewer-media', src: url, alt: rec.name });
  else if (kind === 'video') body = h('video', { class: 'viewer-media', src: url, controls: true, playsinline: true });
  else if (kind === 'audio') body = h('audio', { src: url, controls: true, style: { width: '100%' } });
  else if (rec.mime === 'application/pdf') body = h('iframe', { class: 'viewer-pdf', src: url, title: rec.name });
  else body = h('div', { class: 'empty small' }, icon('file', 36), h('p', {}, 'Preview is not available for this file type.'));
  openSheet(h('div', { class: 'viewer' }, body,
    h('div', { class: 'row between gap' },
      h('small', { class: 'muted' }, `${rec.name} · ${fmtSize(rec.size)}`),
      h('button', { class: 'btn ghost', onclick: async () => {
        const bytes = await store.db.getBlob(id);
        await saveFile(bytes, rec.name, rec.mime);
      } }, icon('download'), 'Save a copy'))
  ), { title: rec.name, wide: true });
}

// ---------- Voice recorder ----------
export function recordVoice() {
  return new Promise(async (resolve) => {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Voice recording is not supported here', 'error'); return resolve(null); }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast('Microphone permission was denied', 'error'); return resolve(null); }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    let started = Date.now();
    let finished = false;
    const timer = h('div', { class: 'rec-time' }, '0:00');
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 250);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const cleanup = () => { clearInterval(tick); stream.getTracks().forEach(t => t.stop()); };
    rec.onstop = () => {
      cleanup();
      if (!finished) return resolve(null);
      const type = (rec.mimeType || 'audio/webm').split(';')[0];
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const d = new Date();
      resolve(new File(chunks, `Voice note ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.${ext}`, { type }));
    };
    rec.start(500);
    const s = openSheet(h('div', { class: 'recorder' },
      h('div', { class: 'rec-dot' }), timer,
      h('button', { class: 'btn primary', onclick: () => { finished = true; rec.stop(); s.close(); } }, icon('stop'), 'Stop and attach')
    ), { title: 'Recording voice note', onClose: () => { if (!finished && rec.state !== 'inactive') rec.stop(); } });
  });
}

export function emptyState(iconName, title, text, action) {
  return h('div', { class: 'empty' }, icon(iconName, 40), h('h3', {}, title), text ? h('p', {}, text) : null, action || null);
}

export function pageHead(title, ...actions) {
  return h('header', { class: 'page-head' },
    h('h1', {}, title),
    h('div', { class: 'row gap page-actions wrap' },
      createSyncButton({ showLabel: true }),
      actions
    )
  );
}

export { esc };
