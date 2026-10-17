package com.campnect.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NativeExitConfirmationTest {
    @Test
    public void cannotExitWithoutANativeArm() {
        NativeExitConfirmation confirmation = new NativeExitConfirmation();
        assertFalse(confirmation.claim(2, 1000L, 0, 0));
    }

    @Test
    public void acceptsASeparateConfirmationInsideTheWindow() {
        NativeExitConfirmation confirmation = new NativeExitConfirmation();
        confirmation.arm(1, 1000L, 0, 0);
        assertTrue(confirmation.claim(
            2,
            1000L + NativeExitConfirmation.MIN_CONFIRM_DELAY_MS,
            0,
            0
        ));
    }

    @Test
    public void acceptsAQuickIntentionalSecondGesture() {
        NativeExitConfirmation confirmation = new NativeExitConfirmation();
        confirmation.arm(1, 1000L, 0, 0);
        assertTrue(confirmation.claim(2, 1180L, 0, 0));
    }

    @Test
    public void rejectsRapidAndExpiredExitRequests() {
        NativeExitConfirmation confirmation = new NativeExitConfirmation();
        confirmation.arm(1, 1000L, 0, 0);
        assertFalse(confirmation.claim(2, 1001L, 0, 0));

        confirmation.arm(3, 2000L, 0, 0);
        assertFalse(confirmation.claim(
            4,
            2000L + NativeExitConfirmation.CONFIRM_WINDOW_MS + 1L,
            0,
            0
        ));
    }

    @Test
    public void navigationCanClearANativeArm() {
        NativeExitConfirmation confirmation = new NativeExitConfirmation();
        confirmation.arm(1, 1000L, 0, 0);
        confirmation.clear();
        assertFalse(confirmation.claim(2, 1800L, 0, 0));
    }

    @Test
    public void replayedOrOlderEventCannotConfirmExit() {
        NativeExitConfirmation confirmation = new NativeExitConfirmation();
        confirmation.arm(7, 1000L, 0, 0);
        assertFalse(confirmation.claim(7, 1800L, 0, 0));

        confirmation.arm(7, 1000L, 0, 0);
        assertFalse(confirmation.claim(6, 1800L, 0, 0));
    }

    @Test
    public void aDifferentLifecycleGenerationCannotConfirmExit() {
        NativeExitConfirmation confirmation = new NativeExitConfirmation();
        confirmation.arm(1, 1000L, 3, 0);
        assertFalse(confirmation.claim(2, 1800L, 4, 0));
    }

    @Test
    public void aClearGenerationInvalidatesDelayedExitCalls() {
        NativeExitConfirmation confirmation = new NativeExitConfirmation();
        confirmation.arm(1, 1000L, 3, 5);
        assertFalse(confirmation.claim(2, 1800L, 3, 6));
    }
}