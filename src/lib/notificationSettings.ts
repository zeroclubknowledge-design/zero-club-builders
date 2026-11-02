/** Launch only from a user gesture. Never redirect a missing shortcut back to this page. */
export function notificationSettingsIntent(requestPermission = false) {
  return "intent://notifications#Intent;scheme=zeroclub-settings;package=xyz.zeroclubs.app;" +
    `B.requestPermission=${requestPermission};end`;
}
