# Next Journals — by Next Edge Marketing

A private, encrypted all-in-one diary: daily journal, calendar, tasks, password vault, lists & notes, media, tags, reminders, and encrypted backups (local file + the user's own Google Drive).

One codebase runs as a **browser app (installable PWA) on desktop** and as a **native Android APK** (Capacitor 8).

---

## Features

| Area | What it does |
|---|---|
| Security | Master password → PBKDF2-SHA256 (600,000 iterations) → AES-256-GCM. Every record **and every media file** is encrypted on disk. Auto-lock, fingerprint unlock on Android, clipboard auto-clear for copied passwords. |
| Journal | Rich text (bold, italic, underline, headings, quotes, lists), date & time, mood, tags, favorites, word-level search, "On this day", writing streak. |
| Media | Photos, videos, audio, PDFs, any file. Camera capture and **voice notes** on Android. Drag & drop on desktop. Gallery of all media. |
| Calendar | Month view with entries coloured by mood and open-task markers; tap a day to see entries/tasks or write for that day. |
| Tasks | Due date/time, priority, repeat (daily/weekly/monthly/yearly), steps (subtasks), tags, reminders. Today / Upcoming / No date / Completed. |
| Password vault | Name, username, password, URL, category, notes, tags; show/hide, copy, strength meter, password generator, weak-password warning. |
| Lists & notes | Checklists and plain notes, colours, pin to top. |
| Tags | One tag system across journal, tasks, passwords, lists; rename, recolour, delete. |
| Search | One search box for everything (Ctrl/Cmd + K on desktop). |
| Reminders | Task reminders + daily "write your journal" reminder. Android: delivered by the OS even when the app is closed. Browser: while the app/tab is open. |
| Local backup | `.njbackup` — a single AES-256-GCM encrypted binary (not a zip). Nothing can be extracted without the password; tampering is detected. Restore = merge or replace. |
| Google Drive backup | Sign in with Google, backups go to the user's own Drive (folder **Next Journals Backups**), encrypted before upload. Auto backup daily/weekly, keep last N, restore on a new device. Scope `drive.file` (app can only see its own files). |
| Other | Dark/light theme, offline support, keyboard shortcuts (Ctrl+L to lock). |

> ⚠️ There is no password recovery. That is what makes the encryption real. Users must remember their master password (or keep a backup they can open).

---

## Project structure

```
next-journals/
├── www/                      ← the whole app (this is what you host for desktop)
│   ├── index.html, manifest.webmanifest, sw.js (offline cache)
│   ├── css/app.css, fonts/ (bundled, works offline), icons/
│   └── js/
│       ├── config.js         ← app name, Google Client ID
│       ├── crypto.js         ← PBKDF2 / AES-GCM helpers, password generator
│       ├── db.js             ← encrypted IndexedDB storage
│       ├── store.js          ← entries, tasks, passwords, lists, media, tags
│       ├── backup.js         ← .njbackup format (encrypt / decrypt / restore)
│       ├── drive.js          ← Google sign-in + Drive API
│       ├── notify.js         ← reminders (web + Android)
│       ├── native.js         ← Android bridges (files, share, fingerprint)
│       └── views/            ← lock, journal, calendar, tasks, vault, lists, browse, settings
├── android/                  ← Capacitor Android project
├── capacitor.config.json
├── .github/workflows/build-apk.yml   ← builds the APK on GitHub
└── package.json
```

No build step: plain HTML/CSS/JavaScript modules.

---

## 1. Run it locally

```bash
npm install
npm run serve          # http://localhost:8080
```

(Any static server works. It must be `http://localhost` or `https://` — not `file://` — for storage, the service worker and Google sign-in.)

---

## 2. Google Cloud setup (needed for Google Drive backup)

Do this once, in one Google Cloud project.

1. Go to **console.cloud.google.com** → create a project, e.g. *Next Journals*.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **Google Auth Platform → Branding** (OAuth consent screen): app name *Next Journals*, support email, developer email. User type **External**.
4. **Data access → Add scopes**: add `.../auth/drive.file` (plus `openid`, `email`, `profile`). `drive.file` is a non-sensitive scope, so no security review is needed.
5. **Audience**: while in *Testing*, add the Google accounts that will test it as **Test users**. When ready for everyone, click **Publish app**.
6. **Clients → Create client → Web application** (used by the browser AND by Android):
   - Authorized JavaScript origins: your desktop URL, e.g. `https://journal.yourdomain.com`, and `http://localhost:8080` for testing.
   - Copy the **Client ID** (`xxxx.apps.googleusercontent.com`).
7. **Clients → Create client → Android**:
   - Package name: `com.nextedgemarketing.nextjournals`
   - SHA-1: from `signing/SIGNING-KEY-README.txt` (the release key provided with this project).
8. Put the **Web client ID** in `www/js/config.js`:
   ```js
   export const GOOGLE_WEB_CLIENT_ID = 'xxxx.apps.googleusercontent.com';
   ```
   (It can also be pasted inside the app: Settings → Google Drive backup → Google Client ID.)

Changes in Google Cloud can take a few minutes (sometimes hours) to apply.

---

## 3. Desktop version (browser)

Upload the **`www/` folder** to any HTTPS static host — your own domain/cPanel, Vercel, Netlify, GitHub Pages, Cloudflare Pages. Add that exact URL to the Web client's *Authorized JavaScript origins* (step 2.6).

Users open the URL and can click **Install** in Chrome/Edge to get a desktop app window. All data stays in that browser on that computer, encrypted.

---

## 4. Android APK

### Option A — GitHub Actions (no Android Studio needed)

1. Create a GitHub repository (private is recommended) and push this project. **Do not push the `signing/` folder.**
2. Repo → **Settings → Secrets and variables → Actions** → add the 4 secrets listed in `signing/SIGNING-KEY-README.txt`.
3. **Actions → Build Android APK → Run workflow** (it also runs on every push to `main`).
4. When it finishes, open the run → **Artifacts → next-journals-apk** → `NextJournals.apk`. Install it on the phone (allow "Install unknown apps").

### Option B — Android Studio on your PC

1. Install Android Studio and Node.js 22+.
2. `npm install` then `npx cap sync android`.
3. Create `android/keystore.properties` (template in `signing/SIGNING-KEY-README.txt`).
4. `npx cap open android` → **Build → Build App Bundle(s) / APK(s) → Build APK(s)**, or run `npm run apk:release`.
5. APK: `android/app/build/outputs/apk/release/app-release.apk`.

Always sign with the same key — its SHA-1 is what Google sign-in trusts.

---

## 5. Updating the app

1. Edit files in `www/`.
2. Bump the version: `APP.version` in `www/js/config.js`, `CACHE` in `www/sw.js` (so browsers fetch the new files), and `versionCode`/`versionName` in `android/app/build.gradle` (versionCode must increase for Android to accept the update).
3. Desktop: re-upload `www/`. Android: push to GitHub (or rebuild), install the new APK over the old one — data is kept.

---

## How the security works

- On first run the user creates a master password. A random 256-bit **data key** is generated; it is wrapped (encrypted) by a key derived from the password with PBKDF2-SHA256, 600,000 iterations, random salt.
- Every record (entry, task, password, list, settings) and every file is encrypted separately with AES-256-GCM and a fresh random IV. IndexedDB only ever contains ciphertext.
- Changing the password only re-wraps the data key (fast, no re-encryption).
- **Backup file format (`.njbackup`)**: `"NXTJRNL"` + version, flags, PBKDF2 iterations, 16-byte salt, 12-byte IV, then one AES-256-GCM ciphertext of the whole package (all records + all media). The header is authenticated, so any edit to the file makes it fail to open.
- Backups are encrypted with a key from the master password (separate salt). An old backup opens with the password that was in use when it was made.
- Fingerprint unlock (Android) stores the master password in the Android Keystore, protected by the enrolled fingerprints. Adding a new fingerprint on the phone disables it until it is turned on again.
- Android's own cloud backup is disabled for the app so the encrypted store is not copied behind the user's back; use the app's backups instead.

## Known limits

- Browser reminders only fire while the app is open (browsers do not allow scheduled notifications without a push server). Android reminders work when the app is closed.
- In the browser, automatic Drive backup runs while the user is signed in to Google in that session (about 1 hour after sign-in); otherwise the app shows a "backup due" banner with a one-tap button.
- Very large videos are held in memory while encrypting; keep single attachments under a few hundred MB on low-end phones.
- iOS is not included (the same code can be wrapped for iOS with Capacitor later).
