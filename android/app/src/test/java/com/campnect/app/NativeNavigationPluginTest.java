package com.campnect.app;

import static org.junit.Assert.assertEquals;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

@RunWith(RobolectricTestRunner.class)
public class NativeNavigationPluginTest {
    private PluginCall callWith(String methodName, String data) throws Exception {
        return new PluginCall(
            null,
            "NativeNavigation",
            "test-callback",
            methodName,
            new JSObject(data)
        );
    }

    @Test
    public void parsesIntegerBackEventTimestampsFromTheCapacitorBridge() throws Exception {
        PluginCall armExit = callWith(
            "armExit",
            "{\"eventId\":1,\"committedAtMs\":1537433827,\"lifecycleGeneration\":1,\"exitResetGeneration\":3}"
        );
        PluginCall exitApp = callWith(
            "exitApp",
            "{\"eventId\":2,\"committedAtMs\":1537434963,\"lifecycleGeneration\":1,\"exitResetGeneration\":3}"
        );

        long armedAtMs = NativeNavigationPlugin.getCommittedAtMs(armExit);
        long confirmedAtMs = NativeNavigationPlugin.getCommittedAtMs(exitApp);
        assertEquals(1537433827L, armedAtMs);
        assertEquals(1537434963L, confirmedAtMs);

        NativeExitConfirmation confirmation = new NativeExitConfirmation();
        confirmation.arm(1, armedAtMs, 1, 3);
        assertEquals(true, confirmation.claim(2, confirmedAtMs, 1, 3));
    }

    @Test
    public void rejectsMissingOrMalformedBridgeTimestamps() throws Exception {
        assertEquals(-1L, NativeNavigationPlugin.getCommittedAtMs(callWith("armExit", "{}")));
        assertEquals(
            -1L,
            NativeNavigationPlugin.getCommittedAtMs(callWith("armExit", "{\"committedAtMs\":\"1537433827\"}"))
        );
        assertEquals(
            -1L,
            NativeNavigationPlugin.getCommittedAtMs(callWith("armExit", "{\"committedAtMs\":1537433827.5}"))
        );
    }
}