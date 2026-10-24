package __PACKAGE__;

/*
 * Zero Club: asks for the microphone permission the call service needs, then
 * starts it. Invisible (translucent) and finishes straight away, so the person
 * lands back in their call.
 *
 * Copied into the generated project by scripts/build-android.mjs
 * (source: android/native/KeepMicActivity.java). See CallForegroundService.
 *
 * Opened when a call starts without the permission, or from the
 * "Keep mic on" button on the ongoing-call notification. Starting the service
 * from here is always allowed because this activity is on screen.
 */
public class KeepMicActivity extends android.app.Activity {
    private static final int REQUEST_MIC = 0x2C12;

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (CallForegroundService.hasMicPermission(this)) {
            startAndClose();
            return;
        }
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            requestPermissions(new String[] {android.Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
        } else {
            startAndClose();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQUEST_MIC) return;
        boolean granted = results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
        if (granted) {
            startAndClose();
        } else {
            android.widget.Toast.makeText(this,
                    "Without the microphone permission, people can't hear you while Zero Club is minimised.",
                    android.widget.Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void startAndClose() {
        if (CallForegroundService.lastNotification != null && CallForegroundService.start(this)) {
            android.app.NotificationManager manager = CallForegroundService.manager(this);
            // The service now owns the notification; drop the "Keep mic on" version.
            if (manager != null && CallForegroundService.lastNotification != null) {
                manager.notify(CallForegroundService.NOTIFICATION_ID, CallForegroundService.lastNotification);
            }
        }
        finish();
        overridePendingTransition(0, 0);
    }
}
