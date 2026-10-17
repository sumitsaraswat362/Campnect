package com.campnect.app;

import android.graphics.Rect;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemInsets")
public class SystemInsetsPlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            View decorView = getActivity().getWindow().getDecorView();
            View webView = getBridge().getWebView();
            WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(decorView);

            if (windowInsets == null || webView.getWidth() == 0 || webView.getHeight() == 0) {
                call.resolve(zeroInsets());
                return;
            }

            Insets visibleBars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets stableBars = windowInsets.getInsetsIgnoringVisibility(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets tappableBars = windowInsets.getInsetsIgnoringVisibility(
                WindowInsetsCompat.Type.tappableElement()
            );

            // Some Android 14/15 vendor builds consume the visible navigation
            // inset before Capacitor reads it, even while three-button system
            // navigation is still drawn over the WebView. Stable and tappable
            // insets retain that navigation-bar geometry.
            int barTop = Math.max(visibleBars.top, stableBars.top);
            int barRight = Math.max(Math.max(visibleBars.right, stableBars.right), tappableBars.right);
            int barBottom = Math.max(Math.max(visibleBars.bottom, stableBars.bottom), tappableBars.bottom);
            int barLeft = Math.max(Math.max(visibleBars.left, stableBars.left), tappableBars.left);

            int[] webLocation = new int[2];
            webView.getLocationOnScreen(webLocation);
            Rect windowBounds = getWindowBounds();
            int webRight = webLocation[0] + webView.getWidth();
            int webBottom = webLocation[1] + webView.getHeight();

            int alreadyReservedTop = Math.max(0, webLocation[1] - windowBounds.top);
            int alreadyReservedLeft = Math.max(0, webLocation[0] - windowBounds.left);
            int alreadyReservedRight = Math.max(0, windowBounds.right - webRight);
            int alreadyReservedBottom = Math.max(0, windowBounds.bottom - webBottom);
            float density = getContext().getResources().getDisplayMetrics().density;

            JSObject result = new JSObject();
            result.put("top", toCssPixels(Math.max(0, barTop - alreadyReservedTop), density));
            result.put("right", toCssPixels(Math.max(0, barRight - alreadyReservedRight), density));
            result.put("bottom", toCssPixels(Math.max(0, barBottom - alreadyReservedBottom), density));
            result.put("left", toCssPixels(Math.max(0, barLeft - alreadyReservedLeft), density));
            call.resolve(result);
        });
    }

    private Rect getWindowBounds() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return getActivity().getWindowManager().getCurrentWindowMetrics().getBounds();
        }

        DisplayMetrics metrics = new DisplayMetrics();
        getActivity().getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
        return new Rect(0, 0, metrics.widthPixels, metrics.heightPixels);
    }

    private double toCssPixels(int pixels, float density) {
        if (density <= 0) return pixels;
        return Math.ceil((pixels / density) * 100.0) / 100.0;
    }

    private JSObject zeroInsets() {
        JSObject result = new JSObject();
        result.put("top", 0);
        result.put("right", 0);
        result.put("bottom", 0);
        result.put("left", 0);
        return result;
    }
}