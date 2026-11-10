// Password vault
import { h, icon, iconBtn, toast, busy, openSheet, confirmDialog } from '../ui.js';
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
      h('button', { class: 'btn ghost', title: 'Import passwords from CSV', onclick: () => importCsvSheet(() => render(root)) }, icon('csv'), h('span', { class: 'hide-sm' }, 'Import CSV')),
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
        all.length ? null : h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn primary', onclick: () => editPassword(store.newPassword(), () => render(root)) }, icon('plus'), 'Add first password'),
          h('button', { class: 'btn ghost', onclick: () => importCsvSheet(() => render(root)) }, icon('csv'), 'Import CSV')))
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

export function downloadSampleCsv() {
  const headers = 'Name,Username,Password,URL,Category,Notes,Tags';
  const rows = [
    'Google,myemail@gmail.com,Secr3t!P@ss2026,https://accounts.google.com,Email,"Personal Google account",google email',
    'Netflix,myemail@gmail.com,M0vi3s!Stream#77,https://netflix.com,Personal,"Family plan",entertainment stream',
    'GitHub,zubairidraft,ghp_DevTokenSample123,https://github.com,Work,"Work repo token",dev github',
    'Wi-Fi Home,HomeNet-5G,SuperFastWifi99!,http://192.168.1.1,Wi-Fi,"Living room router",wifi home'
  ];
  const csvContent = [headers, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'NextJournals_Passwords_Sample.csv';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsv(text) {
  const lines = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      if (row.length > 1 || row[0].trim() !== '') lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || (row[0] && row[0].trim() !== '')) {
    lines.push(row);
  }
  if (!lines.length) return [];

  const rawHeaders = lines[0].map(h => h.trim().toLowerCase());
  const colIndex = {
    name: rawHeaders.findIndex(h => ['name', 'title', 'site', 'service'].includes(h)),
    username: rawHeaders.findIndex(h => ['username', 'login', 'email', 'user'].includes(h)),
    password: rawHeaders.findIndex(h => ['password', 'pass', 'code'].includes(h)),
    url: rawHeaders.findIndex(h => ['url', 'website', 'link', 'uri'].includes(h)),
    category: rawHeaders.findIndex(h => ['category', 'folder', 'group'].includes(h)),
    notes: rawHeaders.findIndex(h => ['notes', 'note', 'comment', 'description'].includes(h)),
    tags: rawHeaders.findIndex(h => ['tags', 'tag', 'labels'].includes(h))
  };

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i];
    const name = colIndex.name >= 0 ? (r[colIndex.name] || '').trim() : '';
    const username = colIndex.username >= 0 ? (r[colIndex.username] || '').trim() : '';
    const password = colIndex.password >= 0 ? (r[colIndex.password] || '').trim() : '';
    const url = colIndex.url >= 0 ? (r[colIndex.url] || '').trim() : '';
    const category = colIndex.category >= 0 ? (r[colIndex.category] || '').trim() : 'Personal';
    const notes = colIndex.notes >= 0 ? (r[colIndex.notes] || '').trim() : '';
    const tagsRaw = colIndex.tags >= 0 ? (r[colIndex.tags] || '').trim() : '';
    const tags = tagsRaw ? tagsRaw.split(/[\s,]+/).filter(Boolean) : [];

    const item = {
      name: name || username || url || (r[0] || '').trim() || 'Untitled',
      username: username || (colIndex.username === -1 && r[1] ? r[1].trim() : ''),
      password: password || (colIndex.password === -1 && r[2] ? r[2].trim() : ''),
      url,
      category: category || 'Personal',
      notes,
      tags
    };
    if (item.name || item.password || item.username) {
      results.push(item);
    }
  }
  return results;
}

export function importCsvSheet(refresh) {
  let parsed = [];
  const statusEl = h('div');
  const previewWrap = h('div', { class: 'csv-preview-wrap', style: 'display: none;' });
  const table = h('table', { class: 'csv-preview-table' });
  previewWrap.append(table);

  const importBtn = h('button', {
    class: 'btn primary block',
    type: 'button',
    disabled: true,
    style: 'display: none;',
    onclick: async () => {
      if (!parsed.length) return;
      importBtn.disabled = true;
      const b = busy(`Encrypting and saving ${parsed.length} passwords…`);
      try {
        for (const p of parsed) {
          await store.db.put({
            type: 'password',
            name: p.name || 'Untitled',
            username: p.username || '',
            password: p.password || '',
            url: p.url || '',
            category: p.category || 'Personal',
            notes: p.notes || '',
            tags: p.tags || [],
            favorite: false
          });
        }
        b.done();
        sheet.close();
        toast(`Successfully imported ${parsed.length} passwords!`, 'success');
        refresh();
      } catch (err) {
        b.done();
        toast(err.message, 'error');
        importBtn.disabled = false;
      }
    }
  }, 'Import passwords');

  const fileInput = h('input', {
    type: 'file',
    accept: '.csv,text/csv,text/plain',
    style: 'display: none;',
    onchange: async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const text = await file.text();
      parsed = parseCsv(text);
      if (!parsed.length) {
        statusEl.innerHTML = '';
        statusEl.append(h('p', { class: 'notice warn' }, 'No valid password rows found in this CSV. Please check the sample format.'));
        previewWrap.style.display = 'none';
        importBtn.style.display = 'none';
        importBtn.disabled = true;
        return;
      }

      statusEl.innerHTML = '';
      statusEl.append(h('p', { class: 'notice ok' }, `Found ${parsed.length} password(s) ready to import:`));

      table.innerHTML = `
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Category</th>
            <th>Password</th>
          </tr>
        </thead>
        <tbody>
          ${parsed.slice(0, 5).map(p => `
            <tr>
              <td><b>${p.name || ''}</b></td>
              <td>${p.username || '<span class="muted">—</span>'}</td>
              <td><span class="chip">${p.category || 'Personal'}</span></td>
              <td class="mono">••••••••</td>
            </tr>
          `).join('')}
          ${parsed.length > 5 ? `<tr><td colspan="4" class="muted" style="text-align: center; font-size: 12px;">+ ${parsed.length - 5} more passwords…</td></tr>` : ''}
        </tbody>
      `;
      previewWrap.style.display = 'block';
      importBtn.style.display = 'block';
      importBtn.disabled = false;
      importBtn.textContent = `Import ${parsed.length} passwords`;
    }
  });

  const sheet = openSheet(h('div', { class: 'stack' },
    h('p', { class: 'muted' }, 'Import multiple logins and passwords from a CSV file. All records are encrypted with your master password.'),
    h('div', { class: 'row gap wrap' },
      h('button', {
        class: 'btn ghost grow',
        type: 'button',
        onclick: downloadSampleCsv
      }, icon('download'), 'Download Sample CSV'),
      h('button', {
        class: 'btn primary grow',
        type: 'button',
        onclick: () => fileInput.click()
      }, icon('upload'), 'Choose CSV File')
    ),
    fileInput,
    statusEl,
    previewWrap,
    importBtn
  ), { title: 'Import passwords from CSV' });
}
