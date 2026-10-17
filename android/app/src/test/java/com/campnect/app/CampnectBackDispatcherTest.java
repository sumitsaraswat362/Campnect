package com.campnect.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class CampnectBackDispatcherTest {
    @Test
    public void queuesBackBeforeWebHandlerIsReady() {
        List<Integer> events = new ArrayList<>();
        CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> {
                events.add(event.id);
                return true;
            },
            () -> 1000L
        );

        dispatcher.onBack();
        assertEquals(1, dispatcher.getPendingEventsForTesting());
        assertEquals(0, events.size());

        dispatcher.setReady(true);
        assertEquals(List.of(1), events);
    }

    @Test
    public void queuesTemporaryLifecycleGapAfterWebWasReady() {
        List<Integer> events = new ArrayList<>();
        CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> {
                events.add(event.id);
                return true;
            },
            () -> 1000L
        );

        dispatcher.setReady(true);
        dispatcher.setReady(false);
        dispatcher.onBack();
        assertEquals(1, dispatcher.getPendingEventsForTesting());

        dispatcher.setReady(true);
        assertEquals(0, dispatcher.getPendingEventsForTesting());
        assertEquals(List.of(1), events);
    }

    @Test
    public void neverDropsBackWhenWebViewIsTemporarilyUnavailable() {
        List<Integer> events = new ArrayList<>();
        boolean[] available = { false };
        CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> {
                if (!available[0]) return false;
                events.add(event.id);
                return true;
            },
            () -> 1000L
        );

        dispatcher.setReady(true);
        dispatcher.onBack();
        assertEquals(1, dispatcher.getPendingEventsForTesting());

        available[0] = true;
        dispatcher.flush();
        assertEquals(0, dispatcher.getPendingEventsForTesting());
        assertEquals(List.of(1), events);
    }

    @Test
    public void assignsDistinctIdsToRapidBackEvents() {
        List<Integer> events = new ArrayList<>();
        CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> {
                events.add(event.id);
                return true;
            },
            () -> 1000L
        );
        dispatcher.setReady(true);

        dispatcher.onBack();
        dispatcher.onBack();
        dispatcher.onBack();

        assertEquals(List.of(1), events);
        dispatcher.onDeliveryResult(1, 1, true);
        assertEquals(List.of(1, 2), events);
        dispatcher.onDeliveryResult(2, 1, true);
        assertEquals(List.of(1, 2, 3), events);
    }

    @Test
    public void failedJavascriptClaimWaitsForFreshReadinessBeforeRedelivery() {
        List<Integer> events = new ArrayList<>();
        CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> {
                events.add(event.id);
                return true;
            },
            () -> 1000L
        );
        dispatcher.setReady(true);

        dispatcher.onBack();
        dispatcher.onDeliveryResult(1, 1, false);
        assertEquals(1, dispatcher.getPendingEventsForTesting());

        dispatcher.setReady(true);
        assertEquals(0, dispatcher.getPendingEventsForTesting());
        assertEquals(List.of(1, 1), events);
    }

    @Test
    public void staleFailureCannotDisableANewerReadyGeneration() {
        List<Integer> events = new ArrayList<>();
        CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> {
                events.add(event.id);
                return true;
            },
            () -> 1000L
        );
        dispatcher.setReady(true);
        dispatcher.onBack();
        dispatcher.setReady(false);
        dispatcher.setReady(true);

        dispatcher.onDeliveryResult(1, 1, false);
        dispatcher.onBack();

        assertEquals(List.of(1, 1), events);
        dispatcher.onDeliveryResult(1, 2, true);
        assertEquals(List.of(1, 1, 2), events);
    }

    @Test
    public void requeuedEventRetainsIdentityAndOriginalCommitTimestamp() {
        List<CampnectBackDispatcher.BackEvent> events = new ArrayList<>();
        long[] now = { 1000L };
        CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> {
                events.add(event);
                return true;
            },
            () -> now[0]
        );
        dispatcher.setReady(true);

        dispatcher.onBack();
        dispatcher.setReady(false);
        now[0] = 5000L;
        dispatcher.setReady(true);

        assertEquals(2, events.size());
        assertEquals(events.get(0).id, events.get(1).id);
        assertEquals(events.get(0).committedAtMs, events.get(1).committedAtMs);
        assertEquals(1000L, events.get(1).committedAtMs);
    }

    @Test
    public void rapidPhysicalBacksKeepOriginalCommitTimesWhenDeliveryIsDelayed() {
        List<CampnectBackDispatcher.BackEvent> events = new ArrayList<>();
        long[] now = { 1000L };
        CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> {
                events.add(event);
                return true;
            },
            () -> now[0]
        );
        dispatcher.setReady(false);

        dispatcher.onBack();
        now[0] = 1200L;
        dispatcher.onBack();
        now[0] = 5000L;
        dispatcher.setReady(true);
        dispatcher.onDeliveryResult(1, 1, true);

        assertEquals(List.of(1, 2), events.stream().map(event -> event.id).toList());
        assertEquals(
            List.of(1000L, 1200L),
            events.stream().map(event -> event.committedAtMs).toList()
        );
    }

    @Test
    public void exitMetadataMustMatchACurrentDispatcherIssuedEventExactly() {
        List<CampnectBackDispatcher.BackEvent> events = new ArrayList<>();
        CampnectBackDispatcher dispatcher = new CampnectBackDispatcher(
            (event, generation) -> {
                events.add(event);
                return true;
            },
            () -> 1000L
        );
        dispatcher.setReady(true);
        dispatcher.onBack();

        CampnectBackDispatcher.BackEvent event = events.get(0);
        assertTrue(dispatcher.matchesCurrentIssuedEvent(
            event.id,
            event.committedAtMs,
            event.lifecycleGeneration,
            event.exitResetGeneration
        ));
        assertFalse(dispatcher.matchesCurrentIssuedEvent(
            event.id,
            event.committedAtMs + 1L,
            event.lifecycleGeneration,
            event.exitResetGeneration
        ));

        dispatcher.invalidateExitEvents();
        assertFalse(dispatcher.matchesCurrentIssuedEvent(
            event.id,
            event.committedAtMs,
            event.lifecycleGeneration,
            event.exitResetGeneration
        ));
    }
}