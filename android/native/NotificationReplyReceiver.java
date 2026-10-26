package __PACKAGE__;

/*
 * Zero Club: reply to a message straight from its notification.
 *
 * HeadsUpNotifications.java adds a "Reply" box to direct and group message
 * notifications that carry a reply key (tag "...|zr:<key>", set by the
 * send-push function). Typing a reply lands here: it is posted to Zero Club
 * with that key (database function reply_from_notification, which only ever
 * posts as you, into that one conversation), and the notification is updated
 * to show what you sent, the way chat apps do. Nothing opens.
 */
public class NotificationReplyReceiver extends android.content.BroadcastReceiver {
    static final String ACTION = "__PACKAGE__.NOTIFICATION_REPLY";
    static final String KEY_TEXT = "zc_reply_text";
    static final String EXTRA_TOKEN = "zc_reply_token";
    static final String EXTRA_TAG = "zc_platform_tag";
    static final String EXTRA_ID = "zc_platform_id";

    private static final String ENDPOINT =
            "https://tiyifgfsuzhcvdvntjmp.supabase.co/rest/v1/rpc/reply_from_notification";
    // The public (anon) key, the same one the website ships. It can only call
    // public functions; the reply key is what proves who is replying.
    private static final String ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeWlmZ2ZzdXpoY3Zkdm50am1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzMyMzYsImV4cCI6MjA5NDMwOTIzNn0.Gb2AcxgfArsdEOrnkHyfwRhJpyn44W0WrM3PW6TC69M";

    @Override
    public void onReceive(final android.content.Context context, final android.content.Intent intent) {
        if (android.os.Build.VERSION.SDK_INT < 24) return;
        android.os.Bundle results = android.app.RemoteInput.getResultsFromIntent(intent);
        final CharSequence typed = results == null ? null : results.getCharSequence(KEY_TEXT);
        final String token = intent.getStringExtra(EXTRA_TOKEN);
        final String tag = intent.getStringExtra(EXTRA_TAG);
        final int id = intent.getIntExtra(EXTRA_ID, 0);
        if (typed == null || token == null || tag == null) return;
        final String text = typed.toString().trim();
        if (text.isEmpty()) {
            showResult(context, tag, id, null, false);
            return;
        }
        final PendingResult pending = goAsync();
        new Thread(() -> {
            boolean ok = false;
            try {
                ok = send(token, text);
            } catch (Exception ignored) {
                ok = false;
            } finally {
                showResult(context, tag, id, text, ok);
                pending.finish();
            }
        }, "zc-notification-reply").start();
    }

    private static boolean send(String token, String text) throws java.io.IOException, org.json.JSONException {
        java.net.HttpURLConnection connection =
                (java.net.HttpURLConnection) new java.net.URL(ENDPOINT).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", ANON_KEY);
            connection.setRequestProperty("Authorization", "Bearer " + ANON_KEY);
            org.json.JSONObject body = new org.json.JSONObject();
            body.put("p_token", token);
            body.put("p_text", text);
            byte[] bytes = body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
            try (java.io.OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            int status = connection.getResponseCode();
            return status >= 200 && status < 300;
        } finally {
            connection.disconnect();
        }
    }

    /** Updates the notification: your reply under the message, or a note that it didn't send. */
    private static void showResult(android.content.Context context, String tag, int id, String text, boolean ok) {
        android.app.NotificationManager manager =
                (android.app.NotificationManager) context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        if (manager == null || android.os.Build.VERSION.SDK_INT < 24) return;
        android.app.Notification current = null;
        for (android.service.notification.StatusBarNotification sbn : manager.getActiveNotifications()) {
            if (sbn.getId() == id && tag.equals(sbn.getTag())) {
                current = sbn.getNotification();
                break;
            }
        }
        if (current == null) return;
        CharSequence line = text == null
                ? null
                : ok ? text : "Couldn't send “" + text + "”. Open Zero Club to try again.";
        android.app.Notification.Builder builder = android.app.Notification.Builder.recoverBuilder(context, current)
                .setOnlyAlertOnce(true);
        if (line != null) builder.setRemoteInputHistory(new CharSequence[] {line});
        manager.notify(tag, id, builder.build());
    }
}
