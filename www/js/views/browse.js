// Media gallery, tags, and global search
import { h, icon, iconBtn, toast, promptDialog, confirmDialog, fmtSize, fmtDate, fmtDue, esc } from '../ui.js';
import * as store from '../store.js';
import { mediaThumb, openMedia, tagChip, emptyState, pageHead } from '../components.js';
import { entryCard } from './journal.js';
import { taskRow, editTask } from './tasks.js';
import { editPassword } from './vault.js';

// ---------- Media ----------
let mediaTab = 'all';
export function renderMedia(root) {
  root.innerHTML = '';
  const all = store.db.all('media').sort((a, b) => b.created - a.created);
  const kinds = { image: 'Photos', video: 'Videos', audio: 'Audio', file: 'Files' };
  const list = mediaTab === 'all' ? all : all.filter(m => store.mediaKind(m.mime) === mediaTab);
  const total = all.reduce((a, m) => a + (m.size || 0), 0);
  root.append(
    pageHead('Media', h('span', { class: 'muted small' }, `${all.length} files · ${fmtSize(total)}`)),
    all.length ? h('div', { class: 'filters' },
      h('button', { class: 'chip' + (mediaTab === 'all' ? ' on' : ''), onclick: () => { mediaTab = 'all'; renderMedia(root); } }, 'All'),
      Object.entries(kinds).map(([k, l]) => {
        const n = all.filter(m => store.mediaKind(m.mime) === k).length;
        return n ? h('button', { class: 'chip' + (mediaTab === k ? ' on' : ''), onclick: () => { mediaTab = k; renderMedia(root); } }, l, h('span', { class: 'count' }, n)) : null;
      })) : null,
    list.length
      ? h('div', { class: 'gallery' }, list.map(m => h('figure', {},
          mediaThumb(m.id),
          h('figcaption', {},
            m.owner && store.db.get(m.owner) ? h('a', { href: '#/journal/' + m.owner, class: 'ellipsis' }, fmtDate(store.db.get(m.owner).date)) : h('span', { class: 'ellipsis' }, m.name),
            h('small', { class: 'muted' }, fmtSize(m.size))))))
      : emptyState('media', 'No media yet', 'Photos, videos, voice notes and files you attach to journal entries appear here.'));
}

// ---------- Tags ----------
export function renderTags(root, tag) {
  root.innerHTML = '';
  if (tag) return renderTag(root, tag);
  const tags = store.allTags();
  root.append(pageHead('Tags'),
    tags.length
      ? h('div', { class: 'tag-table' }, tags.map(t => h('div', { class: 'tag-line' },
          h('a', { href: '#/tags/' + encodeURIComponent(t.name), class: 'grow' }, tagChip(t.name)),
          h('span', { class: 'muted small' }, `${t.count} item${t.count > 1 ? 's' : ''}`),
          h('div', { class: 'swatches small' }, store.TAG_COLORS.map(c => h('button', { class: 'swatch t-' + c + (store.tagColor(t.name) === c ? ' on' : ''), 'aria-label': `Color ${c} for ${t.name}`,
            onclick: async () => { const s = store.settings(); await store.saveSettings({ tagColors: { ...s.tagColors, [t.name]: c } }); renderTags(root); } }))),
          iconBtn('edit', 'Rename tag', async () => {
            const n = await promptDialog({ title: 'Rename tag', label: 'New name', value: t.name, ok: 'Rename' });
            if (n && n.trim() && n !== t.name) { await store.renameTag(t.name, n.trim().toLowerCase().replace(/\s+/g, '-')); renderTags(root); }
          }),
          iconBtn('trash', 'Delete tag', async () => {
            if (await confirmDialog(`Remove #${t.name} from ${t.count} item(s)? The items themselves stay.`, { ok: 'Remove tag' })) { await store.deleteTag(t.name); renderTags(root); }
          }))))
      : emptyState('tag', 'No tags yet', 'Add tags to entries, tasks, passwords and lists to group them across the app.'));
}

function renderTag(root, tag) {
  const items = store.itemsWithTag(tag);
  root.append(
    h('header', { class: 'page-head' }, h('div', { class: 'row gap' }, h('a', { class: 'icon-btn', href: '#/tags', 'aria-label': 'All tags' }, icon('left')), h('h1', {}, '#' + tag))),
    groupResults(items, () => renderTags(root, tag)));
}

// ---------- Search ----------
let lastQ = '';
export function renderSearch(root) {
  root.innerHTML = '';
  const input = h('input', { class: 'input big', type: 'search', placeholder: 'Search everything', value: lastQ, 'aria-label': 'Search everything', autofocus: true });
  const results = h('div');
  const run = () => {
    lastQ = input.value;
    results.innerHTML = '';
    if (!lastQ.trim()) { results.append(h('p', { class: 'muted' }, 'Search journals, tasks, passwords, lists, tags and file names.')); return; }
    const r = store.search(lastQ);
    results.append(r.length ? groupResults(r, run) : emptyState('search', 'No results', `Nothing matches “${lastQ}”.`));
  };
  input.addEventListener('input', run);
  root.append(pageHead('Search'), input, results);
  run();
  setTimeout(() => input.focus(), 30);
}

function groupResults(items, refresh) {
  const by = (t) => items.filter(r => r.type === t);
  const sec = (title, arr, fn) => arr.length ? h('section', { class: 'result-group' }, h('h2', { class: 'sub' }, `${title} (${arr.length})`), fn(arr)) : null;
  return h('div', {},
    sec('Journal', by('entry').sort((a, b) => b.date.localeCompare(a.date)), (a) => h('div', { class: 'entries' }, a.map(entryCard))),
    sec('Tasks', by('task'), (a) => h('div', { class: 'task-list' }, a.map(t => taskRow(t, refresh)))),
    sec('Passwords', by('password'), (a) => h('div', { class: 'vault-list' }, a.map(p => h('button', { class: 'list-row', onclick: () => editPassword(p, refresh) }, icon('key'), h('span', { class: 'grow' }, h('b', {}, p.name), h('small', { class: 'muted block' }, p.username)))))),
    sec('Lists & notes', by('list'), (a) => h('div', { class: 'vault-list' }, a.map(l => h('a', { class: 'list-row', href: '#/lists/' + l.id }, icon('lists'), h('span', { class: 'grow' }, h('b', {}, l.title || 'Untitled')))))),
    sec('Files', by('media'), (a) => h('div', { class: 'thumbs' }, a.map(m => mediaThumb(m.id)))));
}
