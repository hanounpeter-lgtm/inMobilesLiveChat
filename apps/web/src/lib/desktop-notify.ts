// Browser desktop notifications + a tab-title unread badge. No server push —
// works while the site is open (even in a background tab).

let asked = false;

/** Ask once, lazily, for notification permission (no-op if unsupported/decided). */
export function ensureNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default' && !asked) {
    asked = true;
    void Notification.requestPermission().catch(() => undefined);
  }
}

/** Show a desktop notification, but only when the tab isn't focused. */
export function showDesktopNotification(title: string, body: string, onClick?: () => void) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const n = new Notification(title, { body, icon: '/logo.svg', tag: 'inchat-msg' });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    /* some browsers throw if constructed without a service worker — ignore */
  }
}

const BASE_TITLE = 'inChat';

/** Reflect the unread mention/DM count in the browser tab title. */
export function setTabBadge(count: number) {
  document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
}
