package com.campnect.app;

import android.Manifest;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    private static final String BACK_TAG = "CampnectBack";
    private static final String TAG = "CampnectPermissions";
    private static final String PERMISSION_PREFS = "campnect_native_permissions";
    private static final String STARTUP_COMPLETE = "startup_sequence_complete_v3";
    private static final int STARTUP_PERMISSION_REQUEST = 7314;
    private boolean startupPermissionRequestInFlight = false;
    private int startupPermissionIndex = 0;
    private CampnectBackDispatcher backDispatcher;
    private final NativeExitConfirmation exitConfirmation = new NativeExitConfirmation();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallAudioPlugin.class);
        registerPlugin(RuntimePermissionsPlugin.class);
        registerPlugin(SystemInsetsPlugin.class);
        registerPlugin(AppVersionPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(NativeNavigationPlugin.class);
        registerPlugin(PhotoGalleryPlugin.class);
        registerPlugin(GlimpseCameraPlugin.class);
        super.onCreate(savedInstanceState);
        configureMediaPlayback();

        // Request dangerous permissions from the Activity itself on a fresh
        // install. React and OneSignal both initialize asynchronously and
        // must not be responsible for winning a first-launch permission race.
        requestStartupPermissions();

        backDispatcher = new CampnectBackDispatcher(this::dispatchBackToWeb);
        OnBackPressedCallback webBackCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (isDebuggable()) Log.d(BACK_TAG, "AndroidX callback received system Back");
                backDispatcher.onBack();
            }
        };
        getOnBackPressedDispatcher().addCallback(this, webBackCallback);
    }

    private void configureMediaPlayback() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebSettings settings = getBridge().getWebView().getSettings();
        // Clip creation begins from a user-selected local file. Let its audio
        // start normally instead of forcing creators to first unmute autoplay.
        settings.setMediaPlaybackRequiresUserGesture(false);
    }

    public void setWebBackHandlerReady(boolean ready) {
        backDispatcher.setReady(ready);
    }

    public void armNativeExit(
        int eventId,
        long committedAtMs,
        int lifecycleGeneration,
        int exitResetGeneration
    ) {
        boolean matches = backDispatcher.matchesCurrentIssuedEvent(
            eventId,
            committedAtMs,
            lifecycleGeneration,
            exitResetGeneration
        );
        if (isDebuggable()) {
            Log.d(BACK_TAG, "armExit eventId=" + eventId
                + " committedAtMs=" + committedAtMs
                + " lifecycleGeneration=" + lifecycleGeneration
                + " exitResetGeneration=" + exitResetGeneration
                + " decision=" + (matches ? "armed" : "rejected")
                + " reason=" + (matches ? "matches" : backDispatcher.describeIssuedEventMismatch(
                    eventId, committedAtMs, lifecycleGeneration, exitResetGeneration
                )));
        }
        if (!matches) {
            exitConfirmation.clear();
            return;
        }
        exitConfirmation.arm(
            eventId,
            committedAtMs,
            lifecycleGeneration,
            exitResetGeneration
        );
    }

    public boolean claimNativeExit(
        int eventId,
        long committedAtMs,
        int lifecycleGeneration,
        int exitResetGeneration
    ) {
        boolean matches = backDispatcher.matchesCurrentIssuedEvent(
            eventId,
            committedAtMs,
            lifecycleGeneration,
            exitResetGeneration
        );
        String issuedEventReason = matches ? "matches" : backDispatcher.describeIssuedEventMismatch(
            eventId, committedAtMs, lifecycleGeneration, exitResetGeneration
        );
        if (!matches) {
            if (isDebuggable()) {
                Log.d(BACK_TAG, "exitApp eventId=" + eventId
                    + " committedAtMs=" + committedAtMs
                    + " lifecycleGeneration=" + lifecycleGeneration
                    + " exitResetGeneration=" + exitResetGeneration
                    + " decision=rejected reason=issuedEventGate: " + issuedEventReason);
            }
            exitConfirmation.clear();
            return false;
        }
        String claimReason = exitConfirmation.describeClaimFailure(
            eventId, committedAtMs, lifecycleGeneration, exitResetGeneration
        );
        boolean claimed = exitConfirmation.claim(
            eventId,
            committedAtMs,
            lifecycleGeneration,
            exitResetGeneration
        );
        if (isDebuggable()) {
            Log.d(BACK_TAG, "exitApp eventId=" + eventId
                + " committedAtMs=" + committedAtMs
                + " lifecycleGeneration=" + lifecycleGeneration
                + " exitResetGeneration=" + exitResetGeneration
                + " decision=" + (claimed ? "confirmed" : "rejected")
                + " reason=" + (claimed ? "matches" : "confirmationGate: " + claimReason));
        }
        return claimed;
    }

    public void clearNativeExitConfirmation() {
        if (isDebuggable() && backDispatcher != null) {
            Log.d(BACK_TAG, "clearNativeExitConfirmation invoked; invalidating exit events"
                + " (lifecycleGeneration=" + backDispatcher.getLifecycleGeneration() + ")");
        }
        if (backDispatcher != null) backDispatcher.invalidateExitEvents();
        exitConfirmation.clear();
    }

    private boolean dispatchBackToWeb(
        CampnectBackDispatcher.BackEvent event,
        int generation
    ) {
        if (getBridge() == null || getBridge().getWebView() == null) {
            if (isDebuggable()) Log.d(BACK_TAG, "WebView unavailable; queueing Back event " + event.id);
            return false;
        }
        if (isDebuggable()) Log.d(BACK_TAG, "Dispatching Back event " + event.id + " to DOM");
        getBridge().getWebView().evaluateJavascript(
            "(function(){var e=new CustomEvent('campnect:native-back',"
                + "{cancelable:true,detail:{id:" + event.id
                + ",committedAtMs:" + event.committedAtMs
                + ",lifecycleGeneration:" + event.lifecycleGeneration
                + ",exitResetGeneration:" + event.exitResetGeneration
                + "}});return !window.dispatchEvent(e);})()",
            claimed -> {
                String normalized = claimed == null ? "" : claimed.replace("\"", "");
                if (isDebuggable()) {
                    Log.d(
                        BACK_TAG,
                        "DOM delivery result for Back event " + event.id + ": " + normalized
                    );
                }
                backDispatcher.onDeliveryResult(
                    event.id,
                    generation,
                    "true".equalsIgnoreCase(normalized)
                );
            }
        );
        return true;
    }

    private boolean isDebuggable() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    @Override
    public void onResume() {
        super.onResume();
        if (isDebuggable()) Log.d(BACK_TAG, "onResume: advancing lifecycle generation and invalidating exit arm");
        if (backDispatcher != null) backDispatcher.advanceLifecycleGeneration();
        clearNativeExitConfirmation();
        dispatchLifecycleResetToWeb();
        if (backDispatcher != null) backDispatcher.flush();
    }

    @Override
    public void onPause() {
        if (isDebuggable()) Log.d(BACK_TAG, "onPause: advancing lifecycle generation and invalidating exit arm");
        if (backDispatcher != null) backDispatcher.advanceLifecycleGeneration();
        clearNativeExitConfirmation();
        dispatchLifecycleResetToWeb();
        super.onPause();
    }

    private void dispatchLifecycleResetToWeb() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript(
            "window.dispatchEvent(new Event('campnect:lifecycle-reset'))",
            null
        );
    }

    private void requestStartupPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || getSharedPreferences(PERMISSION_PREFS, MODE_PRIVATE).getBoolean(STARTUP_COMPLETE, false)
                || startupPermissionRequestInFlight) {
            return;
        }
        requestNextStartupPermission();
    }

    private void requestNextStartupPermission() {
        String[] permissions = startupPermissions();
        while (startupPermissionIndex < permissions.length
                && checkSelfPermission(permissions[startupPermissionIndex]) == PackageManager.PERMISSION_GRANTED) {
            startupPermissionIndex++;
        }

        if (startupPermissionIndex >= permissions.length) {
            getSharedPreferences(PERMISSION_PREFS, MODE_PRIVATE)
                .edit()
                .putBoolean(STARTUP_COMPLETE, true)
                .apply();
            startupPermissionRequestInFlight = false;
            Log.i(TAG, "Startup permission sequence complete.");
            return;
        }

        String permission = permissions[startupPermissionIndex];
        startupPermissionRequestInFlight = true;
        Log.i(TAG, "Requesting startup permission: " + permission);
        try {
            requestPermissions(new String[] { permission }, STARTUP_PERMISSION_REQUEST);
        } catch (RuntimeException error) {
            startupPermissionRequestInFlight = false;
            Log.w(TAG, "Could not request startup permission: " + permission, error);
        }
    }

    private String[] startupPermissions() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? new String[] {
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO,
                    Manifest.permission.POST_NOTIFICATIONS,
                    Manifest.permission.READ_MEDIA_IMAGES,
                    Manifest.permission.READ_MEDIA_VIDEO
                }
                : new String[] {
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO,
                    Manifest.permission.READ_EXTERNAL_STORAGE
                };
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != STARTUP_PERMISSION_REQUEST) return;

        // A denial advances this first-launch sequence exactly once. The
        // feature bridge can request again when a feature needs access, and
        // permanent denials are handled through Android Settings.
        startupPermissionRequestInFlight = false;
        startupPermissionIndex++;
        requestNextStartupPermission();
    }
}
