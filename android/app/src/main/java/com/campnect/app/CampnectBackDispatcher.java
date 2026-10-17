package com.campnect.app;

import android.os.SystemClock;
import java.util.ArrayDeque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.LongSupplier;

final class CampnectBackDispatcher {
    static final class BackEvent {
        final int id;
        final long committedAtMs;
        final int lifecycleGeneration;
        final int exitResetGeneration;

        BackEvent(
            int id,
            long committedAtMs,
            int lifecycleGeneration,
            int exitResetGeneration
        ) {
            this.id = id;
            this.committedAtMs = committedAtMs;
            this.lifecycleGeneration = lifecycleGeneration;
            this.exitResetGeneration = exitResetGeneration;
        }
    }

    interface EventSink {
        boolean dispatch(BackEvent event, int generation);
    }

    private static final int MAX_PENDING_EVENTS = 8;
    private final EventSink sink;
    private final LongSupplier clock;
    private final ArrayDeque<BackEvent> pendingEvents = new ArrayDeque<>();
    private final LinkedHashMap<Integer, BackEvent> issuedEvents = new LinkedHashMap<>();
    private boolean ready = false;
    private int eventSequence = 0;
    private int readyGeneration = 0;
    private int lifecycleGeneration = 0;
    private int exitResetGeneration = 0;
    private BackEvent inFlightEvent = null;
    private int inFlightGeneration = 0;

    CampnectBackDispatcher(EventSink sink) {
        this(sink, SystemClock::elapsedRealtime);
    }

    CampnectBackDispatcher(EventSink sink, LongSupplier clock) {
        this.sink = sink;
        this.clock = clock;
    }

    void onBack() {
        BackEvent event = new BackEvent(
            ++eventSequence,
            clock.getAsLong(),
            lifecycleGeneration,
            exitResetGeneration
        );
        issuedEvents.put(event.id, event);
        if (issuedEvents.size() > 32) {
            Integer oldestId = issuedEvents.keySet().iterator().next();
            issuedEvents.remove(oldestId);
        }
        if (!ready) {
            // The native layer cannot know whether a restored WebView is on a
            // root or an internal route. Hold Back until React can apply the
            // route policy instead of risking an unconditional Activity exit.
            enqueueLast(event);
            return;
        }
        if (inFlightEvent != null) {
            enqueueLast(event);
        } else if (!dispatch(event)) {
            enqueueFirst(event);
        }
    }

    void onDeliveryResult(int eventId, int generation, boolean claimed) {
        if (
            inFlightEvent == null
                || eventId != inFlightEvent.id
                || generation != inFlightGeneration
                || generation != readyGeneration
        ) return;
        BackEvent deliveredEvent = inFlightEvent;
        inFlightEvent = null;
        inFlightGeneration = 0;
        if (!claimed) {
            ready = false;
            enqueueFirst(deliveredEvent);
            return;
        }
        flush();
    }

    private void enqueueLast(BackEvent event) {
        if (pendingEvents.size() < MAX_PENDING_EVENTS) pendingEvents.addLast(event);
    }

    private void enqueueFirst(BackEvent event) {
        if (pendingEvents.size() < MAX_PENDING_EVENTS) pendingEvents.addFirst(event);
    }

    void setReady(boolean ready) {
        if (this.ready == ready) {
            if (ready) flush();
            return;
        }
        if (!ready && inFlightEvent != null) {
            BackEvent interruptedEvent = inFlightEvent;
            inFlightEvent = null;
            inFlightGeneration = 0;
            enqueueFirst(interruptedEvent);
        }
        this.ready = ready;
        if (ready) {
            readyGeneration++;
        }
        flush();
    }

    void flush() {
        if (!ready) return;
        if (inFlightEvent == null && !pendingEvents.isEmpty()) {
            BackEvent event = pendingEvents.removeFirst();
            if (!dispatch(event)) enqueueFirst(event);
        }
    }

    void advanceLifecycleGeneration() {
        lifecycleGeneration++;
    }

    int getLifecycleGeneration() {
        return lifecycleGeneration;
    }

    void invalidateExitEvents() {
        exitResetGeneration++;
    }

    boolean matchesCurrentIssuedEvent(
        int eventId,
        long committedAtMs,
        int eventLifecycleGeneration,
        int eventExitResetGeneration
    ) {
        BackEvent event = issuedEvents.get(eventId);
        return event != null
            && event.committedAtMs == committedAtMs
            && event.lifecycleGeneration == eventLifecycleGeneration
            && event.exitResetGeneration == eventExitResetGeneration
            && eventLifecycleGeneration == lifecycleGeneration
            && eventExitResetGeneration == exitResetGeneration;
    }

    int getPendingEventsForTesting() {
        return pendingEvents.size();
    }

    /**
     * Non-mutating diagnostic for {@link #matchesCurrentIssuedEvent}. Never
     * used for control flow — only to explain, in logs, exactly which field
     * caused an arm/exit gate rejection (issued-event lookup miss, a stale
     * snapshot on the event itself, or the dispatcher's live generation
     * counters having moved since the event was issued).
     */
    String describeIssuedEventMismatch(
        int eventId,
        long committedAtMs,
        int eventLifecycleGeneration,
        int eventExitResetGeneration
    ) {
        BackEvent event = issuedEvents.get(eventId);
        if (event == null) {
            return "no issued event found for id=" + eventId
                + " (evicted or never dispatched; " + issuedEvents.size() + " tracked)";
        }
        StringBuilder reasons = new StringBuilder();
        if (event.committedAtMs != committedAtMs) {
            reasons.append("committedAtMs mismatch (issued=").append(event.committedAtMs)
                .append(", provided=").append(committedAtMs).append("); ");
        }
        if (event.lifecycleGeneration != eventLifecycleGeneration) {
            reasons.append("provided lifecycleGeneration does not match issued snapshot (issued=")
                .append(event.lifecycleGeneration).append(", provided=")
                .append(eventLifecycleGeneration).append("); ");
        }
        if (event.exitResetGeneration != eventExitResetGeneration) {
            reasons.append("provided exitResetGeneration does not match issued snapshot (issued=")
                .append(event.exitResetGeneration).append(", provided=")
                .append(eventExitResetGeneration).append("); ");
        }
        if (eventLifecycleGeneration != lifecycleGeneration) {
            reasons.append("dispatcher lifecycleGeneration advanced since this event was issued (current=")
                .append(lifecycleGeneration).append(", event=").append(eventLifecycleGeneration).append("); ");
        }
        if (eventExitResetGeneration != exitResetGeneration) {
            reasons.append("dispatcher exitResetGeneration advanced since this event was issued (current=")
                .append(exitResetGeneration).append(", event=").append(eventExitResetGeneration).append("); ");
        }
        return reasons.length() == 0 ? "matches" : reasons.toString();
    }

    private boolean dispatch(BackEvent event) {
        if (!sink.dispatch(event, readyGeneration)) return false;
        inFlightEvent = event;
        inFlightGeneration = readyGeneration;
        return true;
    }
}