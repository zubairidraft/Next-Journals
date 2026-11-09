// Month calendar: journal entries (coloured by mood) and task due dates
import { h, icon, iconBtn, MONTHS, MOODS, dateStr, todayStr, fmtDate, fmtDue } from '../ui.js';
import * as store from '../store.js';
import { entryCard } from './journal.js';
import { taskRow } from './tasks.js';

let cursor = null;     // first day of the shown month
let selected = null;   // YYYY-MM-DD

export function render(root, params) {
  if (params.get('d')) { selected = params.get('d'); cursor = null; }
  if (!selected) selected = todayStr();
  if (!cursor) { const s = new Date(selected + 'T00:00'); cursor = new Date(s.getFullYear(), s.getMonth(), 1); }
  draw(root);
}

function draw(root) {
  root.innerHTML = '';
  const weekStart = store.settings().weekStart;
  const byDay = new Map();
  for (const e of store.entries()) { if (!byDay.has(e.date)) byDay.set(e.date, { entries: [], tasks: [] }); byDay.get(e.date).entries.push(e); }
  for (const t of store.tasks()) {
    const d = store.taskDueDate(t); if (!d) continue;
    if (!byDay.has(d)) byDay.set(d, { entries: [], tasks: [] });
    byDay.get(d).tasks.push(t);
  }

  const y = cursor.getFullYear(), m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const head = Array.from({ length: 7 }, (_, i) => names[(i + weekStart) % 7]);

  const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': `${MONTHS[m]} ${y}` },
    head.map(n => h('div', { class: 'cal-wd', role: 'columnheader' }, n)));
  for (let i = 0; i < offset; i++) grid.append(h('div', { class: 'cal-cell blank' }));
  const today = todayStr();
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateStr(new Date(y, m, d));
    const info = byDay.get(ds);
    const moods = info ? info.entries.map(e => MOODS.find(x => x.v === e.mood)) : [];
    const openTasks = info ? info.tasks.filter(t => !t.done).length : 0;
    grid.append(h('button', {
      class: 'cal-cell' + (ds === today ? ' today' : '') + (ds === selected ? ' sel' : '') + (info && info.entries.length ? ' has' : ''),
      role: 'gridcell', 'aria-label': `${fmtDate(ds, { weekday: 'long', day: 'numeric', month: 'long' })}${info ? `, ${info.entries.length} entries, ${openTasks} open tasks` : ''}`,
      onclick: () => { selected = ds; draw(root); }
    },
      h('span', { class: 'cal-num' }, d),
      h('span', { class: 'cal-dots' },
        moods.slice(0, 3).map(mo => h('i', { class: 'dot', style: { background: mo ? mo.c : 'var(--ink)' } })),
        openTasks ? h('i', { class: 'dot dtask' }) : null)));
  }

  const info = byDay.get(selected) || { entries: [], tasks: [] };
  const monthEntries = store.entries().filter(e => e.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`));
  const moodAvg = monthEntries.filter(e => e.mood).reduce((a, e, _, arr) => a + e.mood / arr.length, 0);

  root.append(
    h('header', { class: 'page-head' },
      h('h1', {}, `${MONTHS[m]} ${y}`),
      h('div', { class: 'row gap' },
        iconBtn('left', 'Previous month', () => { cursor = new Date(y, m - 1, 1); draw(root); }),
        h('button', { class: 'btn ghost', onclick: () => { selected = todayStr(); cursor = null; render(root, new URLSearchParams()); } }, 'Today'),
        iconBtn('right', 'Next month', () => { cursor = new Date(y, m + 1, 1); draw(root); }))),
    h('div', { class: 'cal-layout' },
      h('div', { class: 'cal-panel' }, grid,
        h('div', { class: 'cal-legend' },
          h('span', {}, `${monthEntries.length} ${monthEntries.length === 1 ? 'entry' : 'entries'} this month`),
          moodAvg ? h('span', {}, 'Average mood ' + MOODS[Math.round(moodAvg) - 1].e) : null,
          h('span', { class: 'row gap-xs' }, h('i', { class: 'dot dtask' }), 'Open tasks'))),
      h('section', { class: 'day-panel' },
        h('div', { class: 'row between' },
          h('h2', {}, fmtDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })),
          h('a', { class: 'btn primary', href: '#/journal/new?date=' + selected }, icon('plus'), 'Entry')),
        info.entries.length ? h('div', { class: 'entries' }, info.entries.map(entryCard)) : h('p', { class: 'muted' }, 'No journal entry on this day.'),
        info.tasks.length ? h('div', {}, h('h3', { class: 'sub' }, 'Tasks due'), h('div', { class: 'task-list' }, info.tasks.map(t => taskRow(t, () => draw(root))))) : null)));
}
