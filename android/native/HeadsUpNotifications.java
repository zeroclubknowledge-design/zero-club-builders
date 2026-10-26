    /* ── Zero Club: notifications that pop over other apps ──────────────────
     *
     * Injected into the generated DelegationService by scripts/build-android.mjs
     * (source: android/native/HeadsUpNotifications.java).
     *
     * Chrome hands every web-push notification to this service, and the
     * androidx default posts it on a channel created at IMPORTANCE_DEFAULT:
     * a sound and a status-bar icon, but never the banner that drops down over
     * whatever app you're in. Android only shows that banner (a "heads-up"
     * notification) for IMPORTANCE_HIGH channels, so every notification is
     * moved onto one here.
     *
     * The channel id is new on purpose: Android never lets an app raise the
     * importance of a channel that already exists on a phone, so installs that
     * already have the old default channel would otherwise stay silent-ish.
     * The old channels are removed so Settings shows one clear switch.
     */
    static final String ZC_ALERTS_CHANNEL_ID = "zc_alerts_heads_up";

    /* ── Incoming calls ring like a phone call ─────────────────────────────
     *
     * A group call or a club going live is pushed with the web tag
     * "zc-ring:..." (src/sw.ts). Those go on their own channel that plays the
     * phone's ringtone on the ringer volume and vibrates in long pulses, and
     * the notification is made "insistent", so the ringtone repeats until it
     * is answered, declined or swiped away. It stops by itself after 45
     * seconds, the same time the app gives up on the ring.
     */
    static final String ZC_CALLS_CHANNEL_ID = "zc_incoming_calls";
    static final String ZC_RING_MARK = "zc-ring:";
    static final long[] ZC_RING_VIBRATION = new long[] {0, 900, 600, 900, 600, 900, 600, 900, 600};

    static void zcEnsureCallsChannel(android.content.Context context) {
        if (android.os.Build.VERSION.SDK_INT < 26) return;
        android.app.NotificationManager manager =
                (android.app.NotificationManager) context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(ZC_CALLS_CHANNEL_ID) != null) return;
        android.app.NotificationChannel channel = new android.app.NotificationChannel(
                ZC_CALLS_CHANNEL_ID, "Incoming calls",
                android.app.NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Rings when someone calls you or a club you follow goes live");
        channel.setSound(
                android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE),
                new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
        channel.enableVibration(true);
        channel.setVibrationPattern(ZC_RING_VIBRATION);
        channel.enableLights(true);
        channel.setLightColor(0xFFC3217E);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    static void zcEnsureAlertsChannel(android.content.Context context) {
        if (android.os.Build.VERSION.SDK_INT < 26) return;
        android.app.NotificationManager manager =
                (android.app.NotificationManager) context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(ZC_ALERTS_CHANNEL_ID) == null) {
            android.app.NotificationChannel channel = new android.app.NotificationChannel(
                    ZC_ALERTS_CHANNEL_ID, "Messages and activity",
                    android.app.NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Messages, replies, mentions, follows and other Zero Club activity");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] {0, 120, 80, 120});
            channel.enableLights(true);
            channel.setLightColor(0xFFC3217E);
            channel.setShowBadge(true);
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
        }
        // Retire the default-importance channels androidx created earlier.
        for (android.app.NotificationChannel old : manager.getNotificationChannels()) {
            String id = old.getId();
            if (!ZC_ALERTS_CHANNEL_ID.equals(id) && id.endsWith("_channel_id")) {
                manager.deleteNotificationChannel(id);
            }
        }
    }

    /* ── Reply from the notification ───────────────────────────────────────
     * Message pushes carry a private reply key at the end of their web tag
     * ("chat:<id>|zr:<key>" or "group:<id>|zr:<key>", set by send-push). */
    private static final java.util.regex.Pattern ZC_REPLY_KEY =
            java.util.regex.Pattern.compile("\\|zr:([0-9a-f]{48})");

    static String zcReplyToken(String platformTag) {
        if (platformTag == null) return null;
        java.util.regex.Matcher m = ZC_REPLY_KEY.matcher(platformTag);
        return m.find() ? m.group(1) : null;
    }

    @android.annotation.TargetApi(24)
    private android.app.Notification.Action zcReplyAction(String platformTag, int platformId, String token) {
        android.content.Intent intent = new android.content.Intent(this, NotificationReplyReceiver.class)
                .setAction(NotificationReplyReceiver.ACTION)
                .putExtra(NotificationReplyReceiver.EXTRA_TOKEN, token)
                .putExtra(NotificationReplyReceiver.EXTRA_TAG, platformTag)
                .putExtra(NotificationReplyReceiver.EXTRA_ID, platformId);
        int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        // The reply text is filled in by the system, so the intent must be mutable (Android 12+).
        if (android.os.Build.VERSION.SDK_INT >= 31) flags |= android.app.PendingIntent.FLAG_MUTABLE;
        android.app.PendingIntent reply = android.app.PendingIntent.getBroadcast(
                this, platformTag.hashCode() ^ platformId, intent, flags);
        android.app.RemoteInput input = new android.app.RemoteInput.Builder(NotificationReplyReceiver.KEY_TEXT)
                .setLabel("Reply\u2026")
                .build();
        return new android.app.Notification.Action.Builder(
                android.graphics.drawable.Icon.createWithResource("android", android.R.drawable.ic_menu_send),
                "Reply", reply)
                .addRemoteInput(input)
                .setAllowGeneratedReplies(true)
                .build();
    }

    private boolean zcNotificationsAllowed() {
        android.app.NotificationManager manager =
                (android.app.NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;
        if (android.os.Build.VERSION.SDK_INT >= 24 && !manager.areNotificationsEnabled()) return false;
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            zcEnsureAlertsChannel(this);
            android.app.NotificationChannel channel =
                    manager.getNotificationChannel(ZC_ALERTS_CHANNEL_ID);
            return channel == null
                    || channel.getImportance() != android.app.NotificationManager.IMPORTANCE_NONE;
        }
        return true;
    }

    @Override
    public boolean onAreNotificationsEnabled(@androidx.annotation.NonNull String channelName) {
        return zcNotificationsAllowed();
    }

    // The binder has already verified the caller (Chrome) before this runs, and
    // Chrome only delegates once the person has allowed notifications.
    @android.annotation.SuppressLint("MissingPermission")
    @Override
    public boolean onNotifyNotificationWithChannel(
            @androidx.annotation.NonNull String platformTag, int platformId,
            @androidx.annotation.NonNull android.app.Notification notification,
            @androidx.annotation.NonNull String channelName) {
        // A call in progress: run the microphone service instead (CallForegroundService.java).
        if (CallForegroundService.handles(platformTag)) {
            return CallForegroundService.onCallNotification(this, notification);
        }
        if (!zcNotificationsAllowed()) return false;
        android.app.NotificationManager manager =
                (android.app.NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        android.app.Notification out = notification;
        if (platformTag.contains(ZC_RING_MARK)) {
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                zcEnsureCallsChannel(this);
                out = android.app.Notification.Builder.recoverBuilder(this, notification)
                        .setChannelId(ZC_CALLS_CHANNEL_ID)
                        .setCategory(android.app.Notification.CATEGORY_CALL)
                        .setTimeoutAfter(45_000)
                        .build();
            } else {
                out.priority = android.app.Notification.PRIORITY_MAX;
                out.sound = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE);
                out.vibrate = ZC_RING_VIBRATION;
            }
            // Repeat the ringtone until the ring is answered, declined or dismissed.
            out.flags |= android.app.Notification.FLAG_INSISTENT;
            manager.notify(platformTag, platformId, out);
            return true;
        }
        // A direct or group message: add a Reply box (NotificationReplyReceiver.java).
        String replyToken = zcReplyToken(platformTag);
        if (replyToken != null && android.os.Build.VERSION.SDK_INT >= 24) {
            android.app.Notification.Builder builder =
                    android.app.Notification.Builder.recoverBuilder(this, notification)
                            .addAction(zcReplyAction(platformTag, platformId, replyToken));
            if (android.os.Build.VERSION.SDK_INT >= 26) builder.setChannelId(ZC_ALERTS_CHANNEL_ID);
            out = builder.build();
            if (android.os.Build.VERSION.SDK_INT < 26) {
                out.priority = android.app.Notification.PRIORITY_HIGH;
                out.defaults |= android.app.Notification.DEFAULT_SOUND;
            }
            manager.notify(platformTag, platformId, out);
            return true;
        }
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            out = android.app.Notification.Builder.recoverBuilder(this, notification)
                    .setChannelId(ZC_ALERTS_CHANNEL_ID)
                    .build();
        } else {
            // Android 7 and older: high priority plus sound is what makes it pop.
            out.priority = android.app.Notification.PRIORITY_HIGH;
            out.defaults |= android.app.Notification.DEFAULT_SOUND;
        }
        manager.notify(platformTag, platformId, out);
        return true;
    }

    // The web closed the ongoing-call notification: the call ended, so release the microphone.
    @Override
    public void onCancelNotification(@androidx.annotation.NonNull String platformTag, int platformId) {
        if (CallForegroundService.handles(platformTag)) {
            CallForegroundService.onCallEnded(this);
            return;
        }
        super.onCancelNotification(platformTag, platformId);
    }
