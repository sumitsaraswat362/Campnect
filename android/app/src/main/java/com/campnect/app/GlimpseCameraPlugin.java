package com.campnect.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;

@CapacitorPlugin(name = "GlimpseCamera")
public class GlimpseCameraPlugin extends Plugin {
    private static final int MAX_VIDEO_SECONDS = 60;

    @PluginMethod
    public void capture(PluginCall call) {
        Intent intent = new Intent(getContext(), GlimpseCameraActivity.class);
        intent.putExtra("maxVideoSeconds", Math.max(1, Math.min(call.getInt("maxVideoSeconds", MAX_VIDEO_SECONDS), MAX_VIDEO_SECONDS)));
        try {
            startActivityForResult(call, intent, "captureResult");
        } catch (ActivityNotFoundException error) {
            call.reject("The native Glimpse camera is not installed correctly.", error);
        } catch (SecurityException error) {
            call.reject("Android blocked access to the native Glimpse camera.", error);
        }
    }

    @ActivityCallback
    private void captureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Capture cancelled.");
            return;
        }
        Intent data = result.getData();
        String uri = data.getStringExtra("uri");
        String mimeType = data.getStringExtra("mimeType");
        String name = data.getStringExtra("name");
        if (uri == null || mimeType == null || name == null) {
            call.reject("The captured media could not be opened.");
            return;
        }
        JSObject output = new JSObject();
        output.put("uri", uri);
        output.put("mimeType", mimeType);
        output.put("name", name);
        output.put("size", data.getLongExtra("size", 0));
        call.resolve(output);
    }
}