/** A user gesture is required by Android browsers to open the native shortcut. */
export function notificationSettingsIntent(fallback: string) {
  return "intent://notifications#Intent;scheme=zeroclub-settings;package=xyz.zeroclubs.app;" +
    `S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}
