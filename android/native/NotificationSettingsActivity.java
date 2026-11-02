package __PACKAGE__;

/** Opens only this app's settings; no caller-supplied package or intent. */
public class NotificationSettingsActivity extends android.app.Activity {
    @Override
    protected void onCreate(android.os.Bundle state) {
        super.onCreate(state);
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
