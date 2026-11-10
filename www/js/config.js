// Next Journals — app configuration
export const APP = {
  name: 'Next Journals',
  company: 'Next Edge Marketing',
  version: '1.1.0',
  androidId: 'com.nextedgemarketing.nextjournals',
};

// Google Cloud "Web application" OAuth client ID.
// Used by the browser version AND by the Android app (as webClientId).
export const GOOGLE_WEB_CLIENT_ID = '361672187355-47jrv3u7sbhu32ds1gup23grbds103tg.apps.googleusercontent.com';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FOLDER = 'Next Journals Backups';

export function googleClientId() {
  return GOOGLE_WEB_CLIENT_ID;
}
