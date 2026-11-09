// Journal list + entry editor
import { h, icon, iconBtn, toast, confirmDialog, fmtDate, parseDate, MONTHS, WEEKDAYS, MOODS, debounce, sanitize, todayStr, busy } from '../ui.js';
import * as store from '../store.js';
import { tagChips, tagInput, mediaThumb, recordVoice, emptyState, pageHead } from '../components.js';
import { pickFile } from '../native.js';

let filter = { fav: false, tag: '' };

export function renderList(root) {
  const all = store.entries();
  let list = all;
  if (filter.fav) list = list.filter(e => e.favorite);
  if (filter.tag) list = list.filter(e => (e.tags || []).includes(filter.tag));

  const streak = store.streak();
  const memories = store.onThisDay();
  const tags = store.allTags();

  root.append(pageHead('Journal',
    streak ? h('span', { class: 'pill ribbon', title: 'Days in a row with an entry' }, `${streak}-day streak`) : null,
    h('a', { class: 'btn primary', href: '#/journal/new' }, icon('plus'), h('span', { class: 'hide-sm' }, 'New entry'))));

  if (all.length) {
    root.append(h('div', { class: 'filters' },
      h('button', { class: 'chip' + (!filter.fav ? ' on' : ''), onclick: () => { filter.fav = false; rerender(root); } }, 'All entries'),
      h('button', { class: 'chip' + (filter.fav ? ' on' : ''), onclick: () => { filter.fav = true; rerender(root); } }, icon('star', 16), 'Favorites'),
      tags.length ? h('select', { class: 'chip select', 'aria-label': 'Filter by tag', onchange: (e) => { filter.tag = e.target.value; rerender(root); } },
        h('option', { value: '' }, 'Any tag'),
        tags.map(t => h('option', { value: t.name, selected: filter.tag === t.name }, '#' + t.name))) : null
    ));
  }

  if (memories.length && !filter.fav && !filter.tag) {
    root.append(h('section', { class: 'memory' },
      h('h2', {}, 'On this day'),
      memories.slice(0, 3).map(e => h('a', { class: 'memory-row', href: '#/journal/' + e.id },
        h('span', { class: 'memory-year' }, e.date.slice(0, 4)),
        h('span', { class: 'grow ellipsis' }, e.title || e.text.slice(0, 80) || 'Untitled entry')))));
  }

  if (!list.length) {
    root.append(all.length
      ? emptyState('search', 'Nothing matches this filter', 'Try another tag or show all entries.')
      : emptyState('journal', 'Your journal is empty', 'Write about your day, add photos or a voice note. Everything stays encrypted.',
        h('a', { class: 'btn primary', href: '#/journal/new' }, icon('plus'), 'Write first entry')));
    return;
  }

  let lastMonth = '';
  const wrap = h('div', { class: 'entries' });
  for (const e of list) {
    const m = e.date.slice(0, 7);
    if (m !== lastMonth) {
      lastMonth = m;
      const d = parseDate(e.date);
      wrap.append(h('h2', { class: 'month' }, `${MONTHS[d.getMonth()]} ${d.getFullYear()}`));
    }
    wrap.append(entryCard(e));
  }
  root.append(wrap);
}

function rerender(root) { root.innerHTML = ''; renderList(root); }

export function entryCard(e) {
  const d = parseDate(e.date);
  const mood = MOODS.find(m => m.v === e.mood);
  const media = (e.media || []).filter(id => store.db.get(id));
  return h('a', { class: 'entry-card', href: '#/journal/' + e.id },
    h('div', { class: 'date-block', style: mood ? { '--mood': mood.c } : null },
      h('span', { class: 'day' }, d.getDate()),
      h('span', { class: 'wd' }, WEEKDAYS[d.getDay()].slice(0, 3))),
    h('div', { class: 'entry-body' },
      h('h3', {}, e.title || (e.text ? e.text.slice(0, 60) : 'Untitled entry'), e.favorite ? icon('star', 15, 'fav') : null),
      e.text && e.title ? h('p', { class: 'excerpt' }, e.text.slice(0, 180)) : null,
      h('div', { class: 'meta' },
        mood ? h('span', { title: mood.label }, mood.e) : null,
        e.time ? h('span', {}, e.time) : null,
        media.length ? h('span', { class: 'row gap-xs' }, icon('clip', 14), media.length) : null,
        tagChips(e.tags))));
}

// ---------- Editor ----------
export function renderEditor(root, id, params) {
  let entry = id === 'new' ? store.newEntry(params.get('date')) : store.db.get(id);
  if (!entry) { root.append(emptyState('journal', 'Entry not found', 'It may have been deleted.', h('a', { class: 'btn', href: '#/journal' }, 'Back to journal'))); return; }
  entry = JSON.parse(JSON.stringify(entry));
  const isEmpty = () => !entry.title.trim() && !entry.html.replace(/<[^>]*>|&nbsp;/g, '').trim() && !(entry.media || []).length;

  const status = h('span', { class: 'save-status muted' }, entry.id ? 'Saved' : 'Draft');
  let deleted = false;
  const persist = async () => {
    if (deleted || (!entry.id && isEmpty())) return;
    entry.html = sanitize(body.innerHTML);
    const wasNew = !entry.id;
    const saved = await store.saveEntry(entry);
    if (wasNew) history.replaceState(null, '', '#/journal/' + saved.id);
    status.textContent = 'Saved';
  };
  const save = debounce(() => persist().catch(e => toast(e.message, 'error')), 700);
  const touch = () => { status.textContent = 'Saving…'; save(); };

  // Top bar
  const dateInput = h('input', { type: 'date', class: 'input slim', value: entry.date, 'aria-label': 'Entry date', onchange: (e) => { entry.date = e.target.value || todayStr(); touch(); } });
  const timeInput = h('input', { type: 'time', class: 'input slim', value: entry.time || '', 'aria-label': 'Entry time', onchange: (e) => { entry.time = e.target.value; touch(); } });
  const favBtn = iconBtn('star', 'Favorite', () => { entry.favorite = !entry.favorite; favBtn.classList.toggle('on', entry.favorite); touch(); }, entry.favorite ? 'on fav-btn' : 'fav-btn');
  const delBtn = iconBtn('trash', 'Delete entry', async () => {
    if (!entry.id) { location.hash = '#/journal'; return; }
    if (!(await confirmDialog('This entry and its attachments will be deleted permanently.'))) return;
    deleted = true;
    await store.deleteEntry(store.db.get(entry.id) || entry);
    toast('Entry deleted');
    location.hash = '#/journal';
  });

  // Title + mood
  const title = h('input', { class: 'title-input', placeholder: 'Title', value: entry.title, 'aria-label': 'Title', oninput: (e) => { entry.title = e.target.value; touch(); } });
  const moods = h('div', { class: 'moods', role: 'radiogroup', 'aria-label': 'Mood' }, MOODS.map(m =>
    h('button', { type: 'button', class: 'mood' + (entry.mood === m.v ? ' on' : ''), role: 'radio', 'aria-checked': String(entry.mood === m.v), title: m.label, style: { '--mood': m.c },
      onclick: (e) => {
        entry.mood = entry.mood === m.v ? null : m.v;
        moods.querySelectorAll('.mood').forEach((b, i) => { b.classList.toggle('on', MOODS[i].v === entry.mood); b.setAttribute('aria-checked', String(MOODS[i].v === entry.mood)); });
        touch();
      } }, h('span', {}, m.e), h('small', {}, m.label))));

  // Rich text
  const body = h('div', { class: 'rich', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Write your entry', 'data-placeholder': 'Write about your day…', html: sanitize(entry.html) });
  body.addEventListener('input', touch);
  body.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, html ? sanitize(html) : text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>'));
  });
  const cmd = (c, v) => () => { body.focus(); document.execCommand(c, false, v); touch(); };
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    iconBtn('bold', 'Bold', cmd('bold')), iconBtn('italic', 'Italic', cmd('italic')), iconBtn('underline', 'Underline', cmd('underline')),
    iconBtn('heading', 'Heading', cmd('formatBlock', '<h2>')), iconBtn('quote', 'Quote', cmd('formatBlock', '<blockquote>')),
    iconBtn('ul', 'Bulleted list', cmd('insertUnorderedList')), iconBtn('ol', 'Numbered list', cmd('insertOrderedList')),
    h('button', { class: 'icon-btn text', type: 'button', title: 'Normal text', 'aria-label': 'Normal text', onclick: cmd('formatBlock', '<p>') }, 'Aa'));
  toolbar.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection in editor

  // Attachments
  const strip = h('div', { class: 'thumbs' });
  const drawStrip = () => {
    strip.innerHTML = '';
    (entry.media || []).forEach(mid => {
      const t = mediaThumb(mid, { onRemove: async (rid) => {
        if (!(await confirmDialog('Remove this attachment?', { ok: 'Remove' }))) return;
        await store.deleteMedia(rid);
        entry.media = entry.media.filter(x => x !== rid);
        drawStrip(); await persist();
      } });
      t && strip.append(t);
    });
  };
  const attach = async (files) => {
    if (!files.length) return;
    if (!entry.id) { entry.html = sanitize(body.innerHTML); const s = await store.saveEntry(entry); history.replaceState(null, '', '#/journal/' + s.id); }
    const b = busy('Encrypting attachments…');
    try {
      for (let i = 0; i < files.length; i++) {
        b.update(`Encrypting ${i + 1} of ${files.length}…`);
        const rec = await store.addMediaFile(files[i], entry.id);
        entry.media = [...(entry.media || []), rec.id];
      }
    } catch (e) { toast(e.message, 'error'); }
    b.done();
    drawStrip();
    await persist();
  };
  drawStrip();

  const tagsBox = tagInput(entry.tags || [], (t) => { entry.tags = t; touch(); });

  root.append(h('div', { class: 'editor' },
    h('div', { class: 'editor-bar' },
      h('a', { class: 'icon-btn', href: '#/journal', 'aria-label': 'Back to journal', onclick: () => save.flush() }, icon('left')),
      dateInput, timeInput, h('span', { class: 'grow' }), status, favBtn, delBtn),
    h('article', { class: 'page' },
      title,
      moods,
      toolbar,
      body,
      h('section', { class: 'attach' },
        strip,
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => attach(await pickFile('*/*', true)) }, icon('clip'), 'Add files'),
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => attach(await pickFile('image/*,video/*', true)) }, icon('camera'), 'Photo or video'),
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => { const f = await recordVoice(); if (f) attach([f]); } }, icon('mic'), 'Voice note'))),
      h('section', { class: 'tags-row' }, icon('tag', 18, 'muted'), tagsBox))
  ));

  // Drop files onto the page
  const page = root.querySelector('.page');
  page.addEventListener('dragover', (e) => { e.preventDefault(); page.classList.add('drop'); });
  page.addEventListener('dragleave', () => page.classList.remove('drop'));
  page.addEventListener('drop', (e) => { e.preventDefault(); page.classList.remove('drop'); attach(Array.from(e.dataTransfer.files)); });

  if (id === 'new') setTimeout(() => (matchMedia('(pointer:coarse)').matches ? null : title.focus()), 50);
  return () => save.flush(); // cleanup: save when leaving
}
