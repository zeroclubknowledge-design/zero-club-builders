package __PACKAGE__;

/** Opens only this app's settings; no caller-supplied package or intent. */
public class NotificationSettingsActivity extends android.app.Activity {
    @Override
    protected void onCreate(android.os.Bundle state) {
        super.onCreate(state);
        if (android.os.Build.VERSION.SDK_INT >= 33 && getIntent().getBooleanExtra("requestPermission", false)
                && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED
                && !getPreferences(MODE_PRIVATE).getBoolean("notificationPermissionAsked", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("notificationPermissionAsked", true).apply();
            requestPermissions(new String[] {"android.permission.POST_NOTIFICATIONS"}, 73);
            return;
        }
        openSettings();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != 73) return;
        if (results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) finish();
        else openSettings();
    }

    private void openSettings() {
        try {
            android.content.Intent settings;
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                settings = new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                settings.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
            } else {
                settings = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        android.net.Uri.parse("package:" + getPackageName()));
            }
            startActivity(settings);
        } catch (android.content.ActivityNotFoundException error) {
            startActivity(new android.content.Intent(android.provider.Settings.ACTION_SETTINGS));
        }
        finish();
    }
}
