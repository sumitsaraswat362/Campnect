package com.campnect.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    @PluginMethod
    public void openStore(PluginCall call) {
        String storeUrl = call.getString("url");
        if (storeUrl == null || storeUrl.trim().isEmpty()) {
            call.reject("A Google Play Store URL is required.");
            return;
        }

        Uri webUri = Uri.parse(storeUrl);
        String appId = webUri.getQueryParameter("id");

        try {
            if (appId != null && !appId.isEmpty()) {
                Intent playStoreIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + appId));
                playStoreIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(playStoreIntent);
            } else {
                openInBrowser(webUri);
            }
            call.resolve();
        } catch (ActivityNotFoundException error) {
            try {
                openInBrowser(webUri);
                call.resolve();
            } catch (Exception fallbackError) {
                call.reject("Unable to open the Google Play Store.", fallbackError);
            }
        } catch (Exception error) {
            call.reject("Unable to open the Google Play Store.", error);
        }
    }

    private void openInBrowser(Uri uri) {
        Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
        browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(browserIntent);
    }
}