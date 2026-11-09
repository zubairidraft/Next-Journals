// Reminders.
// Android: @capacitor/local-notifications — scheduled by the OS, delivered
//          even when the app is closed.
// Browser: Notification API — delivered while the app (tab / installed PWA) is open.
import { isNative, plugin } from './native.js';
import * as store from './store.js';

const DAILY_ID = 1000001;
const BACKUP_ID = 1000002;
let webTimers = [];
let webDailyTimer = null;

function numericId(str) {
  let h = 0; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h % 900000000) + 1;
}

export function permissionState() {
  if (isNative()) return 'native';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // default | granted | denied
}

export async function requestPermission() {
  if (isNative()) {
    const LN = plugin('LocalNotifications');
    const r = await LN.requestPermissions();
    try {
      const ex = await LN.checkExactNotificationSetting();
      if (ex && ex.exact_alarm && ex.exact_alarm !== 'granted') await LN.changeExactNotificationSetting();
    } catch {}
    return r.display === 'granted';
  }
  if (!('Notification' in window)) return false;
  return (await Notification.requestPermission()) === 'granted';
}

async function webShow(title, body, tag) {
  if (permissionState() !== 'granted') return;
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) return reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
  } catch {}
  try { new Notification(title, { body, tag, icon: 'icons/icon-192.png' }); } catch {}
}

function reminderTime(t) {
  if (!t.due || !t.remind || t.done) return null;
  const due = new Date(t.due.length > 10 ? t.due : t.due + 'T09:00');
  const at = new Date(due.getTime() - (t.remind > 1 ? t.remind * 60000 : 0));
  return at > new Date() ? at : null;
}

// Re-schedule every reminder from the current data (cheap and robust)
export async function rescheduleAll() {
  const s = store.settings();
  const taskList = store.tasks();
  if (isNative()) {
    const LN = plugin('LocalNotifications');
    try {
      const pending = await LN.getPending();
      if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    } catch (e) { console.warn(e); }
    const list = [];
    for (const t of taskList) {
      const at = reminderTime(t);
      if (at) list.push({ id: numericId(t.id), title: t.title || 'Task reminder', body: t.notes ? t.notes.slice(0, 120) : 'Task due ' + at.toLocaleString(), schedule: { at, allowWhileIdle: true }, extra: { route: '#/tasks' } });
    }
    if (s.dailyReminder) {
      const [hh, mm] = s.dailyReminderTime.split(':').map(Number);
      list.push({ id: DAILY_ID, title: 'Time to write', body: 'How was your day? Add today\'s journal entry.', schedule: { on: { hour: hh, minute: mm }, allowWhileIdle: true }, extra: { route: '#/journal/new' } });
    }
    if (list.length) await LN.schedule({ notifications: list.slice(0, 60) });
    return;
  }
  // Browser
  webTimers.forEach(clearTimeout); webTimers = [];
  for (const t of taskList) {
    const at = reminderTime(t);
    if (!at) continue;
    const ms = at - Date.now();
    if (ms < 2147483000) webTimers.push(setTimeout(() => webShow(t.title || 'Task reminder', 'Task due ' + new Date(t.due).toLocaleString(), t.id), ms));
  }
  clearInterval(webDailyTimer);
  if (s.dailyReminder) {
    webDailyTimer = setInterval(() => {
      const now = new Date();
      const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const key = 'nj-daily-shown-' + now.toDateString();
      if (hm === s.dailyReminderTime && !localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        webShow('Time to write', 'How was your day? Add today\'s journal entry.', 'daily');
      }
    }, 20000);
  }
}

export async function notifyNow(title, body) {
  if (isNative()) {
    await plugin('LocalNotifications').schedule({ notifications: [{ id: BACKUP_ID, title, body, schedule: { at: new Date(Date.now() + 1000) } }] });
  } else webShow(title, body, 'now');
}

export function stopAll() {
  webTimers.forEach(clearTimeout); webTimers = [];
  clearInterval(webDailyTimer);
}

export function onNotificationTap(handler) {
  if (!isNative()) return;
  try {
    plugin('LocalNotifications').addListener('localNotificationActionPerformed', (e) => {
      const r = e.notification && e.notification.extra && e.notification.extra.route;
      if (r) handler(r);
    });
  } catch {}
}
