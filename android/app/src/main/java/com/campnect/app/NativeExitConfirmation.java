package com.campnect.app;

final class NativeExitConfirmation {
    // Match the web confirmation debounce. A 500 ms floor made a genuine
    // second gesture look like another first Back action on fast WebViews.
    static final long MIN_CONFIRM_DELAY_MS = 150L;
    static final long CONFIRM_WINDOW_MS = 2500L;

    private int armedEventId = -1;
    private long armedCommitAtMs = -1L;
    private int armedLifecycleGeneration = -1;
    private int armedExitResetGeneration = -1;

    void arm(
        int eventId,
        long committedAtMs,
        int lifecycleGeneration,
        int exitResetGeneration
    ) {
        armedEventId = eventId;
        armedCommitAtMs = committedAtMs;
        armedLifecycleGeneration = lifecycleGeneration;
        armedExitResetGeneration = exitResetGeneration;
    }

    void clear() {
        armedEventId = -1;
        armedCommitAtMs = -1L;
        armedLifecycleGeneration = -1;
        armedExitResetGeneration = -1;
    }

    boolean claim(
        int confirmingEventId,
        long confirmingCommitAtMs,
        int lifecycleGeneration,
        int exitResetGeneration
    ) {
        if (armedEventId < 0 || armedCommitAtMs < 0L) return false;
        long elapsedMs = confirmingCommitAtMs - armedCommitAtMs;
        boolean isDistinctLaterEvent = confirmingEventId > armedEventId;
        boolean isSameLifecycle = lifecycleGeneration == armedLifecycleGeneration;
        boolean wasNotInvalidated = exitResetGeneration == armedExitResetGeneration;
        clear();
        return isDistinctLaterEvent
            && isSameLifecycle
            && wasNotInvalidated
            && elapsedMs >= MIN_CONFIRM_DELAY_MS
            && elapsedMs <= CONFIRM_WINDOW_MS;
    }

    /**
     * Non-mutating diagnostic mirroring {@link #claim}'s conditions, for
     * logging only. Must be called before {@link #claim}, since claim()
     * clears the armed state as a side effect.
     */
    String describeClaimFailure(
        int confirmingEventId,
        long confirmingCommitAtMs,
        int lifecycleGeneration,
        int exitResetGeneration
    ) {
        if (armedEventId < 0 || armedCommitAtMs < 0L) return "nothing armed";
        long elapsedMs = confirmingCommitAtMs - armedCommitAtMs;
        StringBuilder reasons = new StringBuilder();
        if (confirmingEventId <= armedEventId) {
            reasons.append("confirming event is not later than the armed event (armed=")
                .append(armedEventId).append(", confirming=").append(confirmingEventId).append("); ");
        }
        if (lifecycleGeneration != armedLifecycleGeneration) {
            reasons.append("lifecycle generation changed since arm (armed=")
                .append(armedLifecycleGeneration).append(", now=").append(lifecycleGeneration).append("); ");
        }
        if (exitResetGeneration != armedExitResetGeneration) {
            reasons.append("exit was reset/invalidated since arm (armed=")
                .append(armedExitResetGeneration).append(", now=").append(exitResetGeneration).append("); ");
        }
        if (elapsedMs < MIN_CONFIRM_DELAY_MS) {
            reasons.append("elapsed ").append(elapsedMs).append("ms is below the ")
                .append(MIN_CONFIRM_DELAY_MS).append("ms floor; ");
        }
        if (elapsedMs > CONFIRM_WINDOW_MS) {
            reasons.append("elapsed ").append(elapsedMs).append("ms exceeds the ")
                .append(CONFIRM_WINDOW_MS).append("ms window; ");
        }
        return reasons.length() == 0 ? "matches" : reasons.toString();
    }
}