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
