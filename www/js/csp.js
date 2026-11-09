// Content Security Policy for the browser build. (On Android, Capacitor injects
// its own bridge script inline, so the policy is only applied on the web.)
(function () {
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;
  var m = document.createElement('meta');
  m.httpEquiv = 'Content-Security-Policy';
  m.content = "default-src 'self'; script-src 'self' https://accounts.google.com; connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com; frame-src https://accounts.google.com blob:; img-src 'self' blob: data: https://*.googleusercontent.com; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://accounts.google.com; font-src 'self'; object-src 'none'; base-uri 'self'";
  document.head.appendChild(m);
})();
