// Tasks / to-do with due dates, priorities, repeat, subtasks and reminders
import { h, icon, iconBtn, toast, openSheet, confirmDialog, fmtDue, todayStr } from '../ui.js';
import * as store from '../store.js';
import { tagChips, tagInput, emptyState, pageHead } from '../components.js';
import { uid } from '../crypto.js';
import * as notify from '../notify.js';

let tab = 'today';
const PRI = { 1: 'Low', 2: 'Medium', 3: 'High' };

function bucket(t) {
  if (t.done) return 'done';
  const d = store.taskDueDate(t);
  const today = todayStr();
  if (!d) return 'someday';
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  return 'upcoming';
}

export function render(root) {
  root.innerHTML = '';
  const all = store.tasks();
  const counts = { today: 0, upcoming: 0, overdue: 0, someday: 0, done: 0 };
  all.forEach(t => counts[bucket(t)]++);
  const tabs = [
    ['today', 'Today', counts.today + counts.overdue],
    ['upcoming', 'Upcoming', counts.upcoming],
    ['someday', 'No date', counts.someday],
    ['all', 'All open', all.length - counts.done],
    ['done', 'Completed', counts.done],
  ];
  let list = all.filter(t => {
    const b = bucket(t);
    if (tab === 'today') return b === 'today' || b === 'overdue';
    if (tab === 'all') return b !== 'done';
    return b === tab;
  });
  list.sort((a, b) => tab === 'done'
    ? (b.doneAt || 0) - (a.doneAt || 0)
    : (a.due || '9999').localeCompare(b.due || '9999') || b.priority - a.priority);

  const quick = h('input', { class: 'input', placeholder: 'Add a task and press Enter', 'aria-label': 'New task title', enterkeyhint: 'done' });
  const quickForm = h('form', { class: 'quick-add', onsubmit: async (e) => {
    e.preventDefault();
    if (!quick.value.trim()) return;
    const t = store.newTask(tab === 'today' ? todayStr() : '');
    t.title = quick.value.trim();
    await store.db.put(t);
    quick.value = '';
    render(root);
    root.querySelector('.quick-add input').focus();
  } }, icon('plus', 20, 'muted'), quick, h('button', { class: 'btn ghost', type: 'button', onclick: () => editTask(store.newTask(tab === 'today' ? todayStr() : ''), () => render(root)) }, 'Details'));

  root.append(
    pageHead('Tasks', h('button', { class: 'btn primary', onclick: () => editTask(store.newTask(tab === 'today' ? todayStr() : ''), () => render(root)) }, icon('plus'), h('span', { class: 'hide-sm' }, 'New task'))),
    h('div', { class: 'filters', role: 'tablist' }, tabs.map(([k, label, n]) =>
      h('button', { class: 'chip' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; render(root); } }, label, n ? h('span', { class: 'count' }, n) : null))),
    tab !== 'done' ? quickForm : null,
    list.length
      ? h('div', { class: 'task-list' }, list.map(t => taskRow(t, () => render(root))))
      : emptyState('tasks', tab === 'done' ? 'No completed tasks yet' : 'Nothing here', tab === 'today' ? 'Nothing due today. Add a task above.' : null)
  );
}

export function taskRow(t, refresh) {
  const overdue = !t.done && store.taskDueDate(t) && store.taskDueDate(t) < todayStr();
  const subs = t.subtasks || [];
  return h('div', { class: 'task p' + t.priority + (t.done ? ' done' : '') },
    h('button', { class: 'check-btn', 'aria-label': t.done ? 'Mark as not done' : 'Mark as done', onclick: async () => {
      await store.toggleTask(t);
      if (t.repeat !== 'none' && !t.done) toast('Moved to next: ' + fmtDue(t.due));
      notify.rescheduleAll();
      refresh();
    } }, t.done ? icon('check', 16) : null),
    h('button', { class: 'task-main', onclick: () => editTask(t, refresh) },
      h('span', { class: 'task-title' }, t.title || 'Untitled task'),
      h('span', { class: 'meta' },
        t.due ? h('span', { class: overdue ? 'overdue' : '' }, icon('calendar', 14), fmtDue(t.due)) : null,
        t.repeat && t.repeat !== 'none' ? h('span', { title: 'Repeats ' + t.repeat }, icon('repeat', 14), t.repeat) : null,
        t.remind ? h('span', { title: 'Reminder on' }, icon('bell', 14)) : null,
        subs.length ? h('span', {}, icon('lists', 14), `${subs.filter(s => s.done).length}/${subs.length}`) : null,
        tagChips(t.tags))));
}

export function editTask(task, refresh) {
  const t = JSON.parse(JSON.stringify(task));
  const isNew = !t.id;
  const [dPart, tPart] = (t.due || '').split('T');
  const title = h('input', { class: 'input big', value: t.title, placeholder: 'What needs doing?', 'aria-label': 'Task title' });
  const notes = h('textarea', { class: 'input', rows: 3, placeholder: 'Notes', 'aria-label': 'Notes' }, t.notes || '');
  const date = h('input', { class: 'input', type: 'date', value: dPart || '', 'aria-label': 'Due date' });
  const time = h('input', { class: 'input', type: 'time', value: tPart || '', 'aria-label': 'Due time' });
  const pri = h('select', { class: 'input', 'aria-label': 'Priority' }, [3, 2, 1].map(p => h('option', { value: p, selected: t.priority === p }, PRI[p])));
  const rep = h('select', { class: 'input', 'aria-label': 'Repeat' }, [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']].map(([v, l]) => h('option', { value: v, selected: t.repeat === v }, l)));
  const rem = h('select', { class: 'input', 'aria-label': 'Reminder' }, [[0, 'No reminder'], [1, 'At due time'], [10, '10 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before']].map(([v, l]) => h('option', { value: v, selected: Number(t.remind) === v }, l)));

  const subWrap = h('div', { class: 'subtasks' });
  const drawSubs = () => {
    subWrap.innerHTML = '';
    (t.subtasks || []).forEach((s, i) => subWrap.append(h('div', { class: 'sub-row' },
      h('input', { type: 'checkbox', checked: s.done, 'aria-label': 'Done', onchange: (e) => { s.done = e.target.checked; } }),
      h('input', { class: 'input slim grow', value: s.text, 'aria-label': 'Step', oninput: (e) => { s.text = e.target.value; } }),
      iconBtn('x', 'Remove step', () => { t.subtasks.splice(i, 1); drawSubs(); }))));
    const add = h('input', { class: 'input slim', placeholder: 'Add a step', 'aria-label': 'Add a step', onkeydown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (add.value.trim()) { t.subtasks = [...(t.subtasks || []), { id: uid(), text: add.value.trim(), done: false }]; drawSubs(); subWrap.querySelector('input:last-of-type').focus(); } }
    } });
    subWrap.append(add);
  };
  drawSubs();

  const save = async () => {
    if (!title.value.trim()) { title.focus(); return toast('Give the task a title', 'error'); }
    if (Number(rem.value) && !date.value) return toast('Set a due date for the reminder', 'error');
    Object.assign(t, {
      title: title.value.trim(), notes: notes.value, priority: Number(pri.value), repeat: rep.value, remind: Number(rem.value),
      due: date.value ? (time.value ? `${date.value}T${time.value}` : date.value) : '',
      subtasks: (t.subtasks || []).filter(s => s.text.trim()),
    });
    await store.db.put(t);
    if (t.remind) {
      if (notify.permissionState() === 'default' || notify.permissionState() === 'native') await notify.requestPermission();
      if (notify.permissionState() === 'denied') toast('Notifications are blocked in this browser', 'error');
    }
    notify.rescheduleAll();
    s.close();
    toast(isNew ? 'Task added' : 'Task saved', 'success');
    refresh && refresh();
  };

  const s = openSheet(h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); save(); } },
    title, notes,
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', {}, 'Due date'), date),
      h('label', { class: 'field' }, h('span', {}, 'Time'), time),
      h('label', { class: 'field' }, h('span', {}, 'Priority'), pri),
      h('label', { class: 'field' }, h('span', {}, 'Repeat'), rep)),
    h('label', { class: 'field' }, h('span', {}, 'Reminder'), rem),
    h('div', { class: 'field' }, h('span', {}, 'Steps'), subWrap),
    h('div', { class: 'field' }, h('span', {}, 'Tags'), tagInput(t.tags || [], (v) => { t.tags = v; })),
    h('div', { class: 'row between gap' },
      !isNew ? h('button', { class: 'btn danger ghost', type: 'button', onclick: async () => {
        if (!(await confirmDialog('Delete this task?'))) return;
        await store.db.remove(t.id); notify.rescheduleAll(); s.close(); refresh && refresh();
      } }, icon('trash'), 'Delete') : h('span'),
      h('button', { class: 'btn primary', type: 'submit' }, isNew ? 'Add task' : 'Save task'))
  ), { title: isNew ? 'New task' : 'Edit task' });
}
