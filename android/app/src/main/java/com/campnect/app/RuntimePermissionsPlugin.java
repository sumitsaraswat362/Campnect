package com.campnect.app;

import android.content.Intent;
import android.content.Context;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PluginMethod;

import java.util.Locale;

@CapacitorPlugin(
    name = "RuntimePermissions",
    permissions = {
        @Permission(alias = "camera", strings = { "android.permission.CAMERA" }),
        @Permission(alias = "microphone", strings = { "android.permission.RECORD_AUDIO" }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class RuntimePermissionsPlugin extends Plugin {
    private static final String PERMISSION_PREFS = "campnect_native_permissions";
    private static final String STARTUP_COMPLETE = "startup_sequence_complete_v3";

    @PluginMethod
    public void check(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void startupStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put(
            "complete",
            getContext()
                .getSharedPreferences(PERMISSION_PREFS, Context.MODE_PRIVATE)
                .getBoolean(STARTUP_COMPLETE, false)
        );
        call.resolve(result);
    }

    @PluginMethod
    public void request(PluginCall call) {
        String alias = call.getString("permission");
        if (!"camera".equals(alias) && !"microphone".equals(alias) && !"notifications".equals(alias)) {
            call.reject("Unknown runtime permission.");
            return;
        }
        requestPermissionForAlias(alias, call, "permissionsCallback");
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        call.resolve(permissionResult());
    }

    private JSObject permissionResult() {
        JSObject result = new JSObject();
        result.put("camera", state("camera"));
        result.put("microphone", state("microphone"));
        result.put("notifications", state("notifications"));
        return result;
    }

    private String state(String alias) {
        PermissionState permissionState = getPermissionState(alias);
        if (permissionState == null) {
            return "unavailable";
        }
        // JavaScript has one actionable "prompt" state. Capacitor uses
        // PROMPT_WITH_RATIONALE after a previous denial, but the permission can
        // still be requested and must not be treated as unavailable.
        if (permissionState == PermissionState.PROMPT_WITH_RATIONALE) {
            return "prompt";
        }
        return permissionState.toString().toLowerCase(Locale.ROOT);
    }
}