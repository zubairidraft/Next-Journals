// Password vault
import { h, icon, iconBtn, toast, openSheet, confirmDialog } from '../ui.js';
import * as store from '../store.js';
import { tagChips, tagInput, emptyState, pageHead } from '../components.js';
import { generatePassword, passwordStrength } from '../crypto.js';
import { copyText } from '../native.js';

let q = '';
let cat = '';
let clipTimer = null;

async function copySecret(text, label) {
  if (!text) return;
  await copyText(text);
  toast(`${label} copied. Clipboard clears in 30 s`, 'success');
  clearTimeout(clipTimer);
  clipTimer = setTimeout(() => { copyText(' ').catch(() => {}); }, 30000);
}

export function render(root) {
  root.innerHTML = '';
  const all = store.passwords();
  let list = all;
  if (cat) list = list.filter(p => p.category === cat);
  if (q) { const s = q.toLowerCase(); list = list.filter(p => [p.name, p.username, p.url, p.notes].join(' ').toLowerCase().includes(s)); }
  list.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  const usedCats = store.CATEGORIES.filter(c => all.some(p => p.category === c));
  const weak = all.filter(p => passwordStrength(p.password).score <= 1).length;

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search passwords', value: q, 'aria-label': 'Search passwords',
    oninput: (e) => { q = e.target.value; const pos = e.target.selectionStart; render(root); const i = root.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(pos, pos); } });

  root.append(
    pageHead('Passwords',
      h('button', { class: 'btn ghost hide-sm', onclick: () => generatorSheet() }, icon('wand'), 'Generator'),
      h('button', { class: 'btn primary', onclick: () => editPassword(store.newPassword(), () => render(root)) }, icon('plus'), h('span', { class: 'hide-sm' }, 'Add password'))),
    all.length ? h('div', { class: 'stack-sm' },
      search,
      h('div', { class: 'filters' },
        h('button', { class: 'chip' + (!cat ? ' on' : ''), onclick: () => { cat = ''; render(root); } }, 'All', h('span', { class: 'count' }, all.length)),
        usedCats.map(c => h('button', { class: 'chip' + (cat === c ? ' on' : ''), onclick: () => { cat = c; render(root); } }, c))),
      weak ? h('p', { class: 'notice warn' }, `${weak} saved password${weak > 1 ? 's are' : ' is'} weak. Open ${weak > 1 ? 'them' : 'it'} and use the generator to replace.`) : null) : null,
    list.length
      ? h('div', { class: 'vault-list' }, list.map(p => vaultRow(p, root)))
      : emptyState('vault', all.length ? 'No matching passwords' : 'No passwords saved yet', all.length ? null : 'Store logins, PINs and Wi-Fi keys. They are encrypted with your master password.',
        all.length ? null : h('button', { class: 'btn primary', onclick: () => editPassword(store.newPassword(), () => render(root)) }, icon('plus'), 'Add first password'))
  );
}

function initials(name) { return (name || '?').trim().slice(0, 2).toUpperCase(); }

function vaultRow(p, root) {
  return h('div', { class: 'vault-row' },
    h('button', { class: 'vault-main', onclick: () => editPassword(p, () => render(root)) },
      h('span', { class: 'avatar' }, initials(p.name)),
      h('span', { class: 'grow ellipsis' },
        h('b', {}, p.name || 'Untitled', p.favorite ? icon('star', 14, 'fav') : null),
        h('small', { class: 'muted block ellipsis' }, p.username || p.url || p.category))),
    iconBtn('copy', 'Copy username', () => copySecret(p.username, 'Username'), p.username ? '' : 'invisible'),
    iconBtn('key', 'Copy password', () => copySecret(p.password, 'Password')));
}

function strengthBar(pw) {
  const s = passwordStrength(pw);
  return h('div', { class: 'row gap' }, h('div', { class: 'meter', 'data-score': s.score }, h('span')), h('span', { class: 'hint' }, pw ? s.label : ''));
}

export function editPassword(rec, refresh) {
  const p = JSON.parse(JSON.stringify(rec));
  const isNew = !p.id;
  const name = h('input', { class: 'input', value: p.name, placeholder: 'e.g. Gmail, HBL app, Office Wi-Fi', 'aria-label': 'Name' });
  const user = h('input', { class: 'input', value: p.username, placeholder: 'Username or email', autocomplete: 'off', 'aria-label': 'Username' });
  const pw = h('input', { class: 'input mono', type: 'password', value: p.password, autocomplete: 'new-password', 'aria-label': 'Password' });
  const meterWrap = h('div', {}, strengthBar(p.password));
  pw.addEventListener('input', () => { meterWrap.innerHTML = ''; meterWrap.append(strengthBar(pw.value)); });
  const eye = iconBtn('eye', 'Show password', () => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; eye.innerHTML = ''; eye.append(icon(show ? 'eyeOff' : 'eye')); });
  const url = h('input', { class: 'input', value: p.url, placeholder: 'https://', type: 'url', 'aria-label': 'Website' });
  const catSel = h('select', { class: 'input', 'aria-label': 'Category' }, store.CATEGORIES.map(c => h('option', { selected: p.category === c }, c)));
  const notes = h('textarea', { class: 'input', rows: 3, placeholder: 'Notes, security questions, PIN…', 'aria-label': 'Notes' }, p.notes || '');
  const fav = h('input', { type: 'checkbox', checked: p.favorite, id: 'pfav' });

  const s = openSheet(h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    if (!name.value.trim()) { name.focus(); return toast('Give it a name', 'error'); }
    Object.assign(p, { name: name.value.trim(), username: user.value, password: pw.value, url: url.value, category: catSel.value, notes: notes.value, favorite: fav.checked });
    await store.db.put(p);
    s.close(); toast('Saved', 'success'); refresh && refresh();
  } },
    h('label', { class: 'field' }, h('span', {}, 'Name'), name),
    h('label', { class: 'field' }, h('span', {}, 'Username'), h('div', { class: 'input-group' }, user, iconBtn('copy', 'Copy username', () => copySecret(user.value, 'Username')))),
    h('div', { class: 'field' }, h('span', {}, 'Password'),
      h('div', { class: 'input-group' }, pw, eye, iconBtn('wand', 'Generate password', () => generatorSheet((v) => { pw.value = v; pw.type = 'text'; pw.dispatchEvent(new Event('input')); })), iconBtn('copy', 'Copy password', () => copySecret(pw.value, 'Password'))),
      meterWrap),
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, 'Website'), url),
      h('label', { class: 'field' }, h('span', {}, 'Category'), catSel)),
    h('label', { class: 'field' }, h('span', {}, 'Notes'), notes),
    h('div', { class: 'field' }, h('span', {}, 'Tags'), tagInput(p.tags || [], (v) => { p.tags = v; })),
    h('label', { class: 'check', for: 'pfav' }, fav, h('span', {}, 'Favorite')),
    p.url ? h('a', { class: 'link', href: p.url, target: '_blank', rel: 'noopener' }, icon('link', 16), 'Open website') : null,
    h('div', { class: 'row between gap' },
      !isNew ? h('button', { class: 'btn danger ghost', type: 'button', onclick: async () => {
        if (!(await confirmDialog(`Delete the saved password for “${p.name}”?`))) return;
        await store.db.remove(p.id); s.close(); refresh && refresh();
      } }, icon('trash'), 'Delete') : h('span'),
      h('button', { class: 'btn primary', type: 'submit' }, 'Save'))
  ), { title: isNew ? 'Add password' : p.name });
}

export function generatorSheet(onUse) {
  const opts = { length: 20, upper: true, lower: true, digits: true, symbols: true };
  const out = h('output', { class: 'gen-out mono' });
  const meter = h('div');
  const regen = () => { out.textContent = generatePassword(opts); meter.innerHTML = ''; meter.append(strengthBar(out.textContent)); };
  const len = h('input', { type: 'range', min: 8, max: 64, value: opts.length, 'aria-label': 'Length' });
  const lenLabel = h('b', {}, opts.length);
  len.addEventListener('input', () => { opts.length = Number(len.value); lenLabel.textContent = len.value; regen(); });
  const tog = (k, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: opts[k], onchange: (e) => { opts[k] = e.target.checked; regen(); } }), h('span', {}, label));
  regen();
  const s = openSheet(h('div', { class: 'stack' },
    out, meter,
    h('label', { class: 'field' }, h('span', {}, 'Length ', lenLabel), len),
    h('div', { class: 'grid2' }, tog('upper', 'A–Z'), tog('lower', 'a–z'), tog('digits', '0–9'), tog('symbols', '!@#$')),
    h('div', { class: 'row end gap' },
      iconBtn('refresh', 'New password', regen),
      h('button', { class: 'btn ghost', onclick: () => copySecret(out.textContent, 'Password') }, icon('copy'), 'Copy'),
      onUse ? h('button', { class: 'btn primary', onclick: () => { onUse(out.textContent); s.close(); } }, 'Use this password') : null)
  ), { title: 'Password generator' });
}
