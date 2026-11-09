# Handover — Next Journals (for the next AI agent)

Read this first. It tells you what exists, what is verified, what is not, and what to do next.

## 1. Owner and working rules

- Owner: Arshad (brand: **Next Edge Marketing**). Writes in Roman Urdu; reply in Roman Urdu. App UI text stays in English.
- **Make only the changes he asks for.** Do not add features, sections or content without asking first.
- He does not want builds on his laptop: **APK is built by GitHub Actions**, the **desktop/web version is hosted on Vercel**.

## 2. What the app is

**Next Journals** — private, encrypted all-in-one diary. One codebase:
- Browser / desktop: installable PWA (`www/`), hosted on Vercel.
- Android: native APK via **Capacitor 8**, package `com.nextedgemarketing.nextjournals`.

Features (all implemented): master-password lock + auto-lock + fingerprint unlock (Android); journal (rich text, date/time, mood, tags, favorites, "On this day", streak); media attachments (photos, video, audio, any file, voice notes, camera); calendar (mood dots + task markers); tasks (due, priority, repeat, subtasks, reminders); password vault (generator, strength, clipboard auto-clear 30 s); checklists & notes; tags manager; global search (Ctrl/Cmd+K); reminders; encrypted local backup `.njbackup`; Google Drive backup (sign in with Google, `drive.file` scope, auto daily/weekly, keep last N, restore); dark/light theme; offline.

## 3. Where things are

- Project: `D:\Anti Gravity\Tools\next-journals\` (Windows laptop "zubbi-lap").
- Signing key (PRIVATE, outside the repo on purpose): `D:\Anti Gravity\Tools\Next Journals - Signing Key (PRIVATE)\` — `.jks`, `.jks.base64`, `SIGNING-KEY-README.txt` (alias, passwords, SHA-1/SHA-256, GitHub secret names). **Never commit it, never print its password in chat or logs.**
- `node_modules` is not on the laptop (not needed for GitHub/Vercel).

## 4. Status

### Verified (headless Chrome + Playwright, desktop 1280px and mobile 390px, light + dark)
- Setup, lock/unlock, wrong-password rejection.
- Create/edit entries with photo + file attachments, moods, tags; tasks (quick add, details sheet, repeat, steps); vault; checklist + note; calendar, media, tags, search, settings screens.
- IndexedDB holds **no plaintext** (checked raw records/blobs).
- Backup: header `NXTJRNL`, no plaintext inside, wrong password rejected, 1-byte tamper rejected, round-trip restore on a fresh browser profile including media.
- Web task reminder fired at the right minute.

### NOT verified yet (could not run in the previous environment)
- **Android build has never been compiled** (no Android SDK there). First GitHub Actions run is the first compile — expect possible fixes.
- **Google sign-in / Drive API** (web GIS and Android native) never executed — no network to Google there.
- Fingerprint, Android notifications, camera/mic, hardware back button — need a real phone.

## 5. Immediate next steps (in order)

1. **Workflow file is misplaced.** Remote tools cannot write into `.github`, so it sits at `MOVE-TO-.github-workflows\build-apk.yml`. Move it to `.github\workflows\build-apk.yml` and delete the `MOVE-TO-…` folder (PowerShell in project root):
   ```powershell
   mkdir .github\workflows; move MOVE-TO-.github-workflows\build-apk.yml .github\workflows\; rmdir MOVE-TO-.github-workflows
   ```
2. **GitHub**: `git init`, commit, push to a new (preferably private) repo, branch `main`. Confirm `.gitignore` excludes `*.jks`, `*.base64`, `android/keystore.properties`, `signing/`, `node_modules/`.
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions): `NJ_KEYSTORE_BASE64`, `NJ_KEYSTORE_PASSWORD`, `NJ_KEY_ALIAS` (`nextjournals`), `NJ_KEY_PASSWORD` — values in the signing README. Without them the workflow builds a debug APK whose SHA-1 changes every run (Google sign-in breaks).
4. Run **Actions → Build Android APK**. If it fails, read the Gradle log and fix; likely suspects in §8.
5. **Vercel**: import the GitHub repo. **Root Directory = `www`**, Framework Preset = **Other**, no build command, no install command. (Deploying the repo root would serve the wrong folder.) Note the production URL.
6. **Google Cloud** (README §2): enable Drive API, consent screen (External, scope `drive.file` + openid/email/profile, test users or Publish), **Web client** with Authorized JavaScript origin = the Vercel URL (+ `http://localhost:8080`), **Android client** with the package name + SHA-1 from the signing README.
7. Put the Web client ID in `www/js/config.js` → `GOOGLE_WEB_CLIENT_ID` (it can also be pasted in-app: Settings → Google Drive backup → Google Client ID). Push → Vercel redeploys, Actions rebuilds APK.
8. Device test checklist: install APK, create diary, enable fingerprint, add entry with camera photo + voice note, task with reminder (close app, wait), Drive connect + back up + restore on second device/browser, back button behaviour, auto-lock after background.

## 6. Architecture

No bundler, no framework, no build step. Plain ES modules loaded by `www/index.html`.

```
www/
  index.html            loads js/csp.js (web-only CSP) then js/app.js (module)
  sw.js                 network-first cache of app shell; web only (not registered on Android)
  manifest.webmanifest, css/app.css, fonts/ (Literata + Manrope, bundled), icons/
  js/
    config.js           APP name/version, GOOGLE_WEB_CLIENT_ID, DRIVE_SCOPE, DRIVE_FOLDER
    crypto.js           PBKDF2-SHA256 600k, AES-256-GCM helpers, uid(), password generator/strength
    db.js               encrypted IndexedDB "nextjournals": stores meta / records / blobs; in-memory decrypted cache
    store.js            domain layer: settings, entries, tasks, passwords, lists, media (+thumbnails), tags, search
    backup.js           .njbackup create / decrypt / restore (merge | replace)
    drive.js            Google sign-in (GIS on web, @capgo/capacitor-social-login on Android) + Drive REST
    notify.js           reminders: LocalNotifications on Android, Notification API timers on web
    native.js           Capacitor bridge: plugin(), saveFile (Filesystem+Share), pickFile, copyText, biometric*
    ui.js               h() element builder, icons, toasts, sheets/dialogs, formatting, sanitize(), MOODS
    components.js       tag input/chips, media thumbs/viewer, voice recorder, empty states
    app.js              shell (rail + mobile tabbar + FAB), hash router, auto-lock, Android back button
    views/              lock, journal, calendar, tasks, vault, lists, browse (media/tags/search), settings
android/                Capacitor project (custom MainActivity, manifest, icons, signing config)
capacitor.config.json   appId, appName, webDir "www", LocalNotifications icon/color
.github/workflows/build-apk.yml   (currently in MOVE-TO-… folder, see §5.1)
```

Routes: `#/journal`, `#/journal/new?date=`, `#/journal/:id`, `#/calendar?d=`, `#/tasks`, `#/vault`, `#/lists`, `#/lists/new?kind=checklist|note`, `#/lists/:id`, `#/media`, `#/tags`, `#/tags/:name`, `#/search`, `#/settings`. Editors return a cleanup fn the router calls (flushes autosave).

## 7. Data and security model

- **meta** store (unencrypted): `vault` = `{salt, iterations, iv, wrapped, backupSalt}`.
- Master password → PBKDF2 → KEK → unwraps random AES-256 **data key**. Each record/blob encrypted with data key + fresh IV. Password change only re-wraps the key.
- **Backup key** = PBKDF2(master password, `backupSalt`), derived at unlock and kept in memory so auto-backups need no prompt. Old backups open with the password used when they were made.
- Records (all encrypted, all have `id, type, created, updated`):
  - `entry`: title, html, text, date `YYYY-MM-DD`, time, mood 1–5|null, tags[], media[], favorite
  - `task`: title, notes, due (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`), priority 1–3, repeat none|daily|weekly|monthly|yearly, subtasks[{id,text,done}], remind (0 off, 1 at due, else minutes before), tags[], done, doneAt
  - `password`: name, username, password, url, category, notes, tags[], favorite
  - `list`: kind checklist|note, title, items[{id,text,done}], body, color, pinned, tags[]
  - `media`: name, mime, size, owner (entry id), thumb (bool); bytes in blobs store under same id, thumbnail under `id + "_t"`
  - `settings` (id `settings`): autoLockMin, weekStart, dailyReminder(+Time), backupReminder, driveAuto, driveKeep, tagColors
- `.njbackup` = magic `NXTJRNL`+0x01 | flags(gzip) | iterations u32 | salt 16 | IV 12 | AES-GCM ciphertext (header is AAD). Plaintext = `MDPK` + u32 manifest length + JSON manifest (records, blob index) + concatenated blob bytes.
- localStorage (non-secret only): `nj-theme`, `nj-bio`, `nj-google` (email/name), `nj-drive-folder`, `nj-last-drive`, `nj-last-local`, `nj-google-client-id`.
- Fingerprint: master password stored in Android Keystore via `@capgo/capacitor-native-biometric` (`accessControl: 1` = BIOMETRY_CURRENT_SET). Re-saved on password change.
- Android auto-backup disabled (`allowBackup=false`, `data_extraction_rules.xml`).

## 8. Gotchas and things that bit before

- **`db.put()` mutates the object** (assigns `id`) and caches that same object. When checking "was this new?", capture `const wasNew = !obj.id` *before* calling put. (This bug once merged new journal entries into the previous one.)
- Rich text is HTML from `contenteditable`; always pass through `sanitize()` (ui.js) on save, render and paste.
- CSP is injected by `js/csp.js` only on the web. On Android Capacitor injects an inline bridge script, so a meta CSP would break it. If Google sign-in on the web is blocked by CSP, extend the policy in `csp.js`.
- Capacitor plugins are reached without a bundler: `window.Capacitor.Plugins[name] || Capacitor.registerPlugin(name)` (see `native.js`). Adding a plugin = `npm i` + `npx cap sync android` (CI does the sync).
- `MainActivity.java` implements `ModifiedMainActivityForSocialLoginPlugin` and forwards `onActivityResult` — required for Drive scope on Android. Keep it if regenerating the android folder.
- Web Google sign-in must open from a user tap: `runDriveBackup()` calls `drive.ensureToken()` **before** building the backup so the popup is not blocked.
- Browser auto-backup only runs while the GIS token (~1 h) is valid; otherwise the "backup due" banner shows.
- Leaving a route closes open sheets (`route()` loops `closeTopSheet()`).
- Remote file tools cannot write inside `.github` (protected path).
- Possible first-build issues to check: `@capgo/capacitor-social-login` pulls Facebook/Apple/Twitter deps by default (no `providers` config set); `android:dataExtractionRules` needs API 31 (lint warning only); exact alarms (`SCHEDULE_EXACT_ALARM`) are requested at runtime via `LocalNotifications.changeExactNotificationSetting()`.
- Plugin versions (package.json): Capacitor 8.6, app 8, filesystem 8.1.5, local-notifications 8.3.1, share 8.0.3, native-biometric 8.9.1, social-login 8.7.7. CI uses Node 22 + Temurin JDK 21. Gradle wrapper 8.14.3, minSdk 24.

## 9. Releasing an update

Bump `APP.version` (`www/js/config.js`), `CACHE` in `www/sw.js`, and `versionCode` (+1) / `versionName` in `android/app/build.gradle`. Push to `main` → Vercel redeploys `www`, Actions builds a new signed APK that installs over the old one (data kept, same key).

## 10. Local testing (optional)

`npx --yes http-server www -p 8080 -c-1` then open `http://localhost:8080`. Must be http(s), not `file://`. Previous tests used Playwright against a local server; scripts were not kept in the repo.
