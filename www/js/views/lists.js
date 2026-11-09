// Checklists and notes
import { h, icon, iconBtn, toast, confirmDialog, debounce } from '../ui.js';
import * as store from '../store.js';
import { tagChips, tagInput, emptyState, pageHead } from '../components.js';
import { uid } from '../crypto.js';

export function render(root) {
  root.innerHTML = '';
  const all = store.lists();
  root.append(
    pageHead('Lists & notes',
      h('a', { class: 'btn ghost', href: '#/lists/new?kind=note' }, icon('edit'), h('span', { class: 'hide-sm' }, 'Note')),
      h('a', { class: 'btn primary', href: '#/lists/new?kind=checklist' }, icon('plus'), h('span', { class: 'hide-sm' }, 'Checklist'))),
    all.length
      ? h('div', { class: 'cards' }, all.map(card))
      : emptyState('lists', 'No lists yet', 'Shopping lists, packing lists, ideas, quick notes.', h('a', { class: 'btn primary', href: '#/lists/new?kind=checklist' }, icon('plus'), 'New checklist')));
}

function card(l) {
  const items = l.items || [];
  const done = items.filter(i => i.done).length;
  return h('a', { class: 'list-card c-' + (l.color || 'plain'), href: '#/lists/' + l.id },
    h('div', { class: 'row between' }, h('h3', { class: 'ellipsis' }, l.title || 'Untitled'), l.pinned ? icon('pin', 16, 'muted') : null),
    l.kind === 'checklist'
      ? h('ul', { class: 'mini-items' }, items.slice(0, 5).map(i => h('li', { class: i.done ? 'done' : '' }, i.text)), items.length > 5 ? h('li', { class: 'muted' }, `+${items.length - 5} more`) : null)
      : h('p', { class: 'note-preview' }, (l.body || '').slice(0, 220)),
    h('div', { class: 'meta' }, l.kind === 'checklist' && items.length ? h('span', {}, `${done}/${items.length} done`) : null, tagChips(l.tags)));
}

export function renderEditor(root, id, params) {
  let l = id === 'new' ? store.newList(params.get('kind') || 'checklist') : store.db.get(id);
  if (!l) { root.append(emptyState('lists', 'List not found', null, h('a', { class: 'btn', href: '#/lists' }, 'Back'))); return; }
  l = JSON.parse(JSON.stringify(l));
  let deleted = false;
  const status = h('span', { class: 'save-status muted' }, l.id ? 'Saved' : 'Draft');
  const persist = async () => {
    if (deleted) return;
    if (!l.id && !l.title.trim() && !l.body.trim() && !l.items.length) return;
    const wasNew = !l.id;
    const s = await store.db.put(l);
    if (wasNew) history.replaceState(null, '', '#/lists/' + s.id);
    status.textContent = 'Saved';
  };
  const save = debounce(() => persist().catch(e => toast(e.message, 'error')), 600);
  const touch = () => { status.textContent = 'Saving…'; save(); };

  const title = h('input', { class: 'title-input', value: l.title, placeholder: l.kind === 'note' ? 'Note title' : 'List name', 'aria-label': 'Title', oninput: (e) => { l.title = e.target.value; touch(); } });
  const content = h('div');

  const drawItems = () => {
    content.innerHTML = '';
    const open = l.items.filter(i => !i.done), done = l.items.filter(i => i.done);
    const row = (it) => h('div', { class: 'item-row' + (it.done ? ' done' : '') },
      h('input', { type: 'checkbox', checked: it.done, 'aria-label': 'Done', onchange: (e) => { it.done = e.target.checked; touch(); drawItems(); } }),
      h('input', { class: 'item-text', value: it.text, 'aria-label': 'Item', oninput: (e) => { it.text = e.target.value; touch(); },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); content.querySelector('.add-item').focus(); } } }),
      iconBtn('x', 'Remove item', () => { l.items = l.items.filter(x => x.id !== it.id); touch(); drawItems(); }));
    const add = h('input', { class: 'input add-item', placeholder: 'Add item and press Enter', 'aria-label': 'Add item', enterkeyhint: 'enter', onkeydown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const v = add.value.trim(); if (!v) return; l.items.push({ id: uid(), text: v, done: false }); touch(); drawItems(); content.querySelector('.add-item').focus(); }
    } });
    content.append(h('div', { class: 'items' }, open.map(row)), add,
      done.length ? h('details', { class: 'done-items', open: true }, h('summary', {}, `Completed (${done.length})`), done.map(row),
        h('button', { class: 'btn ghost small', onclick: () => { l.items = l.items.filter(i => !i.done); touch(); drawItems(); } }, 'Clear completed')) : null);
  };
  if (l.kind === 'checklist') drawItems();
  else content.append(h('textarea', { class: 'note-body', placeholder: 'Start typing…', 'aria-label': 'Note', oninput: (e) => { l.body = e.target.value; touch(); } }, l.body || ''));

  const colors = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' }, store.LIST_COLORS.map(c =>
    h('button', { type: 'button', class: 'swatch c-' + c + (l.color === c ? ' on' : ''), 'aria-label': c, role: 'radio', 'aria-checked': String(l.color === c), onclick: (e) => {
      l.color = c; colors.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b === e.currentTarget)); page.className = 'page list-page c-' + c; touch();
    } })));
  const pinBtn = iconBtn('pin', 'Pin to top', () => { l.pinned = !l.pinned; pinBtn.classList.toggle('on', l.pinned); touch(); }, l.pinned ? 'on' : '');
  const page = h('article', { class: 'page list-page c-' + (l.color || 'plain') }, title, content,
    h('section', { class: 'tags-row' }, icon('tag', 18, 'muted'), tagInput(l.tags || [], (v) => { l.tags = v; touch(); })));

  root.append(h('div', { class: 'editor' },
    h('div', { class: 'editor-bar' },
      h('a', { class: 'icon-btn', href: '#/lists', 'aria-label': 'Back to lists', onclick: () => save.flush() }, icon('left')),
      colors, h('span', { class: 'grow' }), status, pinBtn,
      iconBtn('trash', 'Delete', async () => {
        if (!l.id) { location.hash = '#/lists'; return; }
        if (!(await confirmDialog('Delete this ' + (l.kind === 'note' ? 'note' : 'list') + '?'))) return;
        deleted = true; await store.db.remove(l.id); location.hash = '#/lists';
      })),
    page));
  return () => save.flush();
}
