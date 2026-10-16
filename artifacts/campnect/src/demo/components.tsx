import { getStorageNotice, resetStorage } from "./storage";
import { useBackDismiss } from "../navigation/overlayDismissRegistry";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Avatar } from "../components/shared/Avatar";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import { useAuthStore } from "../stores/authStore";
import { useCallStore, type ActiveCall } from "../stores/callStore";
import { accountIds, seed } from "./seed";
import { demoStore, commit } from "./store";
import { clearMedia } from "./media";
import { DEMO_AUTH_KEY } from "./config";
const panel = {
  padding: 20,
  border: "1px solid var(--color-border)",
  borderRadius: 20,
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
};
const button = {
  padding: "12px 16px",
  borderRadius: 14,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text-primary)",
  cursor: "pointer",
};
export function DemoAccountSelector({
  switching = false,
  embedded = false,
}: {
  switching?: boolean;
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const login = async (id: string) => {
    setBusy(true);
    try {
      if (switching) useAuthStore.getState().logout();
      await useAuthStore.getState().login(id, "");
      if (switching) window.location.assign("/app/feed");
      else navigate("/app/feed", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not select account");
      setBusy(false);
    }
  };
  return (
    <section
      style={
        switching || embedded
          ? panel
          : {
              ...panel,
              maxWidth: 430,
              margin: "8vh auto",
              width: "calc(100% - 32px)",
              boxSizing: "border-box",
            }
      }
    >
      <h1 style={{ margin: "0 0 8px" }}>
        {switching
          ? "Switch demo account"
          : embedded
            ? "Choose a demo account"
            : "Campnect"}
      </h1>
      <p style={{ color: "var(--color-text-muted)", lineHeight: 1.5 }}>
        Demo Mode · Explore a fictional campus community. Your changes stay in
        this browser.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {accountIds.map((id) => {
          const u = demoStore.getState().data.users[id];
          return (
            <button
              disabled={busy}
              key={id}
              onClick={() => void login(id)}
              style={{
                ...button,
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
              }}
            >
              <Avatar src={u.avatar_url} name={u.full_name} size={48} />
              <span>
                <strong>{u.full_name}</strong>
                <span style={{ display: "block", fontSize: 12, marginTop: 4 }}>
                  {u.college_name}
                </span>
                <small>
                  {u.is_private
                    ? "Private · Close mates"
                    : id === "u1"
                      ? "Public · Creator"
                      : "Public · Communities & events"}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        No password or OTP needed. All students and activity are fictional.
      </p>
    </section>
  );
}
export function DemoControls() {
  const [switching, setSwitching] = useState(false),
    [reset, setReset] = useState(false),
    [busy, setBusy] = useState(false);
  const user = useAuthStore((s) => s.user);
  async function confirmReset() {
    setBusy(true);
    try {
      resetStorage();
      commit(seed());
      await clearMedia();
      sessionStorage.removeItem("campnect-demo-recovered");
      localStorage.removeItem(DEMO_AUTH_KEY);
      localStorage.removeItem("campnect-demo-theme");
      localStorage.removeItem("campnect-demo-active-call");
      window.location.assign("/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
      setBusy(false);
    }
  }
  return (
    <div style={{ padding: 16 }}>
      <div style={panel}>
        <strong>Demo Mode · {user?.full_name}</strong>
        <p style={{ fontSize: 13 }}>Local data, shared across demo accounts.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={button} onClick={() => setSwitching(!switching)}>
            Switch demo account
          </button>
          <button style={button} onClick={() => setReset(true)}>
            Reset Demo Data
          </button>
        </div>
      </div>
      {switching && <DemoAccountSelector switching />}
      <ConfirmDialog
        open={reset}
        busy={busy}
        title="Reset Demo Data?"
        message="Remove demo interactions and uploaded media, restore the fictional campus dataset and return to account selection."
        confirmLabel="Reset demo"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setReset(false)}
        onConfirm={() => void confirmReset()}
      />
    </div>
  );
}
export function DemoCallPreview({ session }: { session?: ActiveCall }) {
  const stored = useCallStore((s) => s.activeCall),
    call = session || stored;
  const [connected, setConnected] = useState(false),
    [incoming, setIncoming] = useState(Boolean(call?.incoming)),
    [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [connected]);
  useBackDismiss(true, () => useCallStore.getState().clearActiveCall(), 400);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Simulated call preview"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        background: "var(--color-bg)",
      }}
    >
      <div style={{ ...panel, maxWidth: 360, textAlign: "center" }}>
        <Avatar
          src={call?.fromAvatar}
          name={call?.fromName || "Campus friend"}
          size={90}
        />
        <h2>{call?.fromName || "Campus friend"}</h2>
        <p>Simulated {call?.type || "voice"} call preview</p>
        <p>
          {connected
            ? `Preview connected · ${elapsed}s`
            : incoming
              ? "Incoming preview"
              : "Outgoing preview · Ringing"}
        </p>
        <p style={{ fontSize: 13 }}>
          No microphone, camera or peer connection is active.
        </p>
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {!connected && (
            <button style={button} onClick={() => setConnected(true)}>
              {incoming ? "Accept preview" : "Connect preview"}
            </button>
          )}
          {!connected && !incoming && (
            <button style={button} onClick={() => setIncoming(true)}>
              Incoming preview
            </button>
          )}
          {connected && (
            <button style={button} onClick={() => setMuted(!muted)}>
              {muted ? "Unmute preview" : "Mute preview"}
            </button>
          )}
          <button
            style={{ ...button, color: "#ef4444" }}
            onClick={() => useCallStore.getState().clearActiveCall()}
          >
            {incoming && !connected ? "Decline" : "End preview"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DemoStorageNotice() {
  useEffect(() => {
    const notice = getStorageNotice();
    if (notice) toast(notice, { duration: 15000, id: "demo-storage-notice" });
  }, []);
  return null;
}
