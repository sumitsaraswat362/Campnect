package com.campnect.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeNavigation")
public class NativeNavigationPlugin extends Plugin {
    @PluginMethod
    public void armExit(PluginCall call) {
        int eventId = call.getInt("eventId", -1);
        long committedAtMs = getCommittedAtMs(call);
        int lifecycleGeneration = call.getInt("lifecycleGeneration", -1);
        int exitResetGeneration = call.getInt("exitResetGeneration", -1);
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).armNativeExit(
                eventId,
                committedAtMs,
                lifecycleGeneration,
                exitResetGeneration
            );
            call.resolve();
        });
    }

    @PluginMethod
    public void clearExitArm(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).clearNativeExitConfirmation();
            call.resolve();
        });
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        int eventId = call.getInt("eventId", -1);
        long committedAtMs = getCommittedAtMs(call);
        int lifecycleGeneration = call.getInt("lifecycleGeneration", -1);
        int exitResetGeneration = call.getInt("exitResetGeneration", -1);
        getActivity().runOnUiThread(() -> {
            if (!((MainActivity) getActivity()).claimNativeExit(
                eventId,
                committedAtMs,
                lifecycleGeneration,
                exitResetGeneration
            )) {
                call.reject("Native exit was not confirmed by a separate Back action.");
                return;
            }
            call.resolve();
            getActivity().finish();
        });
    }

    @PluginMethod
    public void setBackHandlerReady(PluginCall call) {
        boolean ready = call.getBoolean("ready", false);
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).setWebBackHandlerReady(ready);
            call.resolve();
        });
    }

    /**
     * Capacitor 8's PluginCall#getLong only accepts a boxed Long. JSON values
     * below Integer.MAX_VALUE arrive as Integer, which made valid elapsed-time
     * stamps become the -1 default in the exit confirmation gate.
     */
    static long getCommittedAtMs(PluginCall call) {
        Object value = call.getData().opt("committedAtMs");
        if (!(value instanceof Number)) return -1L;

        if (value instanceof Double || value instanceof Float) {
            double numericValue = ((Number) value).doubleValue();
            if (
                !Double.isFinite(numericValue)
                    || numericValue != Math.rint(numericValue)
                    || numericValue < 0L
                    || numericValue > Long.MAX_VALUE
            ) {
                return -1L;
            }
        }

        return ((Number) value).longValue();
    }
}