package __PACKAGE__;

/*
 * Zero Club: stay heard with the app minimised during a call.
 *
 * Copied into the generated project by scripts/build-android.mjs
 * (source: android/native/CallForegroundService.java; __PACKAGE__ is replaced
 * with the packageId from twa-manifest.json).
 *
 * Why this exists. The app is a Trusted Web Activity: calls run in Chrome.
 * A few seconds after Chrome goes to the background, Android stops giving it
 * microphone sound unless the app holds a foreground service of type
 * "microphone". The person still looks unmuted, but the call gets silence.
 *
 * How it works. While a call is up, the web app shows an "ongoing call"
 * notification tagged "zc-ongoing-call" (src/features/calls/backgroundCall.ts).
 * Chrome hands it to DelegationService, which calls onCallNotification() here
 * and this service starts in the foreground with that notification. Our
 * LauncherActivity binds Chrome with BIND_INCLUDE_CAPABILITIES
 * (androidbrowserhelper's bindCustomTabsServicePreservePriority), so Chrome
 * inherits the microphone capability while this service runs. When the call
 * ends the web closes the notification, Chrome calls onCancelNotification,
 * and the service stops. The web re-shows the notification every minute; if
 * that stops (page gone), the service stops itself after STALE_MS.
 *
 * Android 14+ only allows a microphone foreground service when the app has
 * RECORD_AUDIO, so the first call asks for it (KeepMicActivity). Android 12+
 * may refuse to start a foreground service while the app is not on screen; in
 * that case the notification gets a "Keep mic on" button, which starts it from
 * a tap (always allowed).
 */
public class CallForegroundService extends android.app.Service {
    static final String TAG_MARK = "zc-ongoing-call";
    static final String CHANNEL_ID = "zc_ongoing_call";
    static final int NOTIFICATION_ID = 0x2C11;
    static final long STALE_MS = 4 * 60 * 1000L;
    static final String PREFS = "zc_call_service";
    static final String PREF_ASKS = "mic_permission_asks";

    static volatile android.app.Notification lastNotification;
    static volatile long lastPing;
    static volatile boolean running;

    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable watchdog = new Runnable() {
        @Override
        public void run() {
            if (System.currentTimeMillis() - lastPing > STALE_MS) {
                stopSelf();
                return;
            }
            handler.postDelayed(this, 60_000L);
        }
    };

    /** True for the web app's ongoing-call notification. */
    static boolean handles(String platformTag) {
        return platformTag != null && platformTag.contains(TAG_MARK);
    }

    static boolean hasMicPermission(android.content.Context context) {
        if (android.os.Build.VERSION.SDK_INT < 23) return true;
        return context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    static android.app.NotificationManager manager(android.content.Context context) {
        return (android.app.NotificationManager) context.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
    }

    static void ensureChannel(android.content.Context context) {
        if (android.os.Build.VERSION.SDK_INT < 26) return;
        android.app.NotificationManager manager = manager(context);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        android.app.NotificationChannel channel = new android.app.NotificationChannel(
                CHANNEL_ID, "Ongoing calls", android.app.NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shown while you are in a call or live class, so people can still hear you when Zero Club is minimised");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    /** Chrome's notification, moved to the quiet ongoing-call channel; tapping it still returns to the call. */
    static android.app.Notification asCallNotification(android.content.Context context, android.app.Notification fromChrome, boolean askForMic) {
        ensureChannel(context);
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            android.app.Notification.Builder builder = android.app.Notification.Builder.recoverBuilder(context, fromChrome)
                    .setChannelId(CHANNEL_ID)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setCategory(android.app.Notification.CATEGORY_CALL);
            if (askForMic) {
                builder.setContentText("Tap “Keep mic on” so people can hear you while Zero Club is minimised");
                builder.addAction(new android.app.Notification.Action.Builder(
                        null, "Keep mic on", keepMicIntent(context)).build());
            }
            return builder.build();
        }
        fromChrome.flags |= android.app.Notification.FLAG_ONGOING_EVENT | android.app.Notification.FLAG_ONLY_ALERT_ONCE;
        fromChrome.defaults = 0;
        fromChrome.sound = null;
        fromChrome.vibrate = null;
        return fromChrome;
    }

    static android.app.PendingIntent keepMicIntent(android.content.Context context) {
        android.content.Intent intent = new android.content.Intent(context, KeepMicActivity.class)
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
        return android.app.PendingIntent.getActivity(context, NOTIFICATION_ID, intent, flags);
    }

    /** DelegationService: Chrome showed (or refreshed) the ongoing-call notification. */
    @android.annotation.SuppressLint("MissingPermission")
    static boolean onCallNotification(android.content.Context context, android.app.Notification fromChrome) {
        lastPing = System.currentTimeMillis();
        android.app.NotificationManager manager = manager(context);

        if (running) {
            lastNotification = asCallNotification(context, fromChrome, false);
            if (manager != null) manager.notify(NOTIFICATION_ID, lastNotification);
            return true;
        }

        if (!hasMicPermission(context)) {
            if (manager != null) manager.notify(NOTIFICATION_ID, asCallNotification(context, fromChrome, true));
            // Ask in-app the first couple of times; after that the button in the notification is enough.
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
            int asks = prefs.getInt(PREF_ASKS, 0);
            if (asks < 2) {
                prefs.edit().putInt(PREF_ASKS, asks + 1).apply();
                try {
                    context.startActivity(new android.content.Intent(context, KeepMicActivity.class)
                            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (RuntimeException ignored) {
                    // Not allowed from here: the notification button does the same thing.
                }
            }
            lastNotification = asCallNotification(context, fromChrome, false);
            return true;
        }

        lastNotification = asCallNotification(context, fromChrome, false);
        if (!start(context) && manager != null) {
            // Android would not start it from the background; offer a tap instead.
            manager.notify(NOTIFICATION_ID, asCallNotification(context, fromChrome, true));
        }
        return true;
    }

    /** DelegationService: the web closed the notification because the call ended. */
    static void onCallEnded(android.content.Context context) {
        lastNotification = null;
        lastPing = 0;
        context.stopService(new android.content.Intent(context, CallForegroundService.class));
        android.app.NotificationManager manager = manager(context);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
    }

    /** Starts the service. Returns false if Android refused (background start limits, missing permission). */
    static boolean start(android.content.Context context) {
        if (lastNotification == null || !hasMicPermission(context)) return false;
        android.content.Intent intent = new android.content.Intent(context, CallForegroundService.class);
        try {
            if (android.os.Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
            return true;
        } catch (RuntimeException refused) {
            return false;
        }
    }

    @Override
    public int onStartCommand(android.content.Intent intent, int flags, int startId) {
        android.app.Notification notification = lastNotification;
        if (notification == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                startForeground(NOTIFICATION_ID, notification,
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            running = true;
            handler.removeCallbacks(watchdog);
            handler.postDelayed(watchdog, 60_000L);
        } catch (RuntimeException refused) {
            // e.g. no RECORD_AUDIO on Android 14+, or started from the background on Android 12+.
            running = false;
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(android.content.Intent rootIntent) {
        // Swiping Zero Club away from recents ends the call, so stop holding the mic.
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacks(watchdog);
        super.onDestroy();
    }

    @Override
    public android.os.IBinder onBind(android.content.Intent intent) {
        return null;
    }
}
