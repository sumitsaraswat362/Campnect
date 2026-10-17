package com.campnect.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

/**
 * Exercises the full native exit-confirmation gate exactly as MainActivity
 * wires it together: CampnectBackDispatcher.matchesCurrentIssuedEvent(...)
 * gates entry to NativeExitConfirmation.arm()/claim(). The existing
 * NativeExitConfirmationTest only covers claim() in isolation and cannot
 * catch a bug in this composition, which is where a real on-device report
 * (two Back presses, ~2264ms apart, identical lifecycle/reset generations)
 * was traced back to.
 */
public class NativeExitGateTest {
    private static final class Harness {
        final List<CampnectBackDispatcher.BackEvent> delivered = new ArrayList<>();
        final long[] now = { 1_000_000L };
        final CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> { delivered.add(event); return true; },
            () -> now[0]
        );
        final NativeExitConfirmation confirmation = new NativeExitConfirmation();

        Harness() {
            dispatcher.setReady(true);
        }

        CampnectBackDispatcher.BackEvent pressBack() {
            dispatcher.onBack();
            CampnectBackDispatcher.BackEvent event = delivered.get(delivered.size() - 1);
            dispatcher.onDeliveryResult(event.id, 1, true);
            return event;
        }

        boolean arm(CampnectBackDispatcher.BackEvent event) {
            boolean matches = dispatcher.matchesCurrentIssuedEvent(
                event.id, event.committedAtMs, event.lifecycleGeneration, event.exitResetGeneration
            );
            if (matches) {
                confirmation.arm(event.id, event.committedAtMs, event.lifecycleGeneration, event.exitResetGeneration);
            } else {
                confirmation.clear();
            }
            return matches;
        }

        // Confirms using an explicit (possibly stale/forged) event snapshot,
        // as a real device call always does: the plugin call args are
        // whatever the JS side last received in its DOM event detail, not
        // necessarily the dispatcher's live state at call time.
        boolean confirm(int eventId, long committedAtMs, int lifecycleGeneration, int exitResetGeneration) {
            boolean matches = dispatcher.matchesCurrentIssuedEvent(
                eventId, committedAtMs, lifecycleGeneration, exitResetGeneration
            );
            if (!matches) {
                confirmation.clear();
                return false;
            }
            return confirmation.claim(eventId, committedAtMs, lifecycleGeneration, exitResetGeneration);
        }

        boolean confirm(CampnectBackDispatcher.BackEvent event) {
            return confirm(event.id, event.committedAtMs, event.lifecycleGeneration, event.exitResetGeneration);
        }
    }

    // A: the exact on-device values reported (armExit id=1 @1366756744,
    // exitApp id=2 @1366759008, both lifecycle=5/reset=11) must be accepted.
    @Test
    public void acceptsTheExactReportedDevicePair() {
        Harness h = new Harness();
        for (int i = 0; i < 5; i++) h.dispatcher.advanceLifecycleGeneration();
        for (int i = 0; i < 11; i++) h.dispatcher.invalidateExitEvents();
        h.now[0] = 1366756744L;

        CampnectBackDispatcher.BackEvent event1 = h.pressBack();
        assertTrue(h.arm(event1));

        h.now[0] = 1366756744L + 2264L;
        CampnectBackDispatcher.BackEvent event2 = h.pressBack();
        assertTrue(h.confirm(event2));
    }

    // B: a lifecycle transition (onPause/onResume) between arm and confirm
    // must invalidate the pending exit, not silently confirm anyway.
    @Test
    public void rejectsConfirmAfterALifecycleGenerationChange() {
        Harness h = new Harness();
        CampnectBackDispatcher.BackEvent event1 = h.pressBack();
        assertTrue(h.arm(event1));

        h.dispatcher.advanceLifecycleGeneration();
        h.now[0] += 500L;
        CampnectBackDispatcher.BackEvent event2 = h.pressBack();
        assertFalse(h.confirm(event2));
    }

    // C: an explicit reset (e.g. a route change firing clearExitArm) between
    // arm and confirm must invalidate the pending exit.
    @Test
    public void rejectsConfirmAfterAnExitResetInvalidation() {
        Harness h = new Harness();
        CampnectBackDispatcher.BackEvent event1 = h.pressBack();
        assertTrue(h.arm(event1));

        h.dispatcher.invalidateExitEvents();
        h.now[0] += 500L;
        CampnectBackDispatcher.BackEvent event2 = h.pressBack();
        assertFalse(h.confirm(event2));
    }

    // D: a confirm that arrives too fast (under the debounce floor) must be
    // rejected even though every generation still matches.
    @Test
    public void rejectsConfirmBelowTheMinimumDelay() {
        Harness h = new Harness();
        CampnectBackDispatcher.BackEvent event1 = h.pressBack();
        assertTrue(h.arm(event1));

        h.now[0] += NativeExitConfirmation.MIN_CONFIRM_DELAY_MS - 1;
        CampnectBackDispatcher.BackEvent event2 = h.pressBack();
        assertFalse(h.confirm(event2));
    }

    // E: a confirm that arrives after the window has elapsed must be
    // rejected, requiring a fresh arm instead.
    @Test
    public void rejectsConfirmAboveTheConfirmationWindow() {
        Harness h = new Harness();
        CampnectBackDispatcher.BackEvent event1 = h.pressBack();
        assertTrue(h.arm(event1));

        h.now[0] += NativeExitConfirmation.CONFIRM_WINDOW_MS + 1;
        CampnectBackDispatcher.BackEvent event2 = h.pressBack();
        assertFalse(h.confirm(event2));
    }

    // F: replaying the same event id as its own confirmation must never
    // succeed — the contract requires a distinct, later Back action.
    @Test
    public void rejectsReplayOfTheSameEventIdAsItsOwnConfirmation() {
        Harness h = new Harness();
        CampnectBackDispatcher.BackEvent event1 = h.pressBack();
        assertTrue(h.arm(event1));

        h.now[0] += 500L;
        assertFalse(h.confirm(event1.id, event1.committedAtMs, event1.lifecycleGeneration, event1.exitResetGeneration));
    }

    // G: an out-of-order (earlier) eventId can never confirm a later armed
    // event, even with otherwise-matching fields.
    @Test
    public void rejectsAnEarlierEventIdConfirmingALaterArm() {
        Harness h = new Harness();
        CampnectBackDispatcher.BackEvent event1 = h.pressBack();
        h.now[0] += 100L;
        CampnectBackDispatcher.BackEvent event2 = h.pressBack();
        assertTrue(h.arm(event2));

        h.now[0] += 500L;
        assertFalse(h.confirm(event1.id, event1.committedAtMs, event2.lifecycleGeneration, event2.exitResetGeneration));
    }

    // H: once an armed event ages out of the issued-event tracking window
    // (32-entry cap), confirming it must fail closed instead of throwing or
    // silently succeeding on stale data.
    @Test
    public void rejectsConfirmForAnEvictedIssuedEvent() {
        Harness h = new Harness();
        CampnectBackDispatcher.BackEvent event1 = h.pressBack();
        assertTrue(h.arm(event1));

        for (int i = 0; i < 40; i++) {
            h.now[0] += 10L;
            h.pressBack();
        }

        h.now[0] += 10L;
        assertFalse(h.confirm(event1.id, event1.committedAtMs, event1.lifecycleGeneration, event1.exitResetGeneration));
    }
}
