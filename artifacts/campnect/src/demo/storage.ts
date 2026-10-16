import { seed, type DemoState } from "./seed";
import { DEMO_KEY } from "./config";
let notice: string | null = null;
let blockedWrite: string | null = null;
export const getStorageNotice = () => notice;
export function restore(): DemoState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(DEMO_KEY);
  } catch {
    notice =
      "Browser storage is unavailable. Demo changes cannot be saved; enable site storage before presenting.";
    blockedWrite = notice;
    return seed();
  }
  if (!raw) {
    const initial = seed();
    try {
      persist(initial);
    } catch (e) {
      notice = (e as Error).message;
    }
    return initial;
  }
  try {
    const value = JSON.parse(raw);
    const required = Object.keys(seed(0)).filter(
      (k) => k !== "version" && k !== "seededAt",
    );
    if (
      value.version !== 1 ||
      !value.users?.u1 ||
      required.some((k) => !value[k] || typeof value[k] !== "object") ||
      Object.values(value.posts).some(
        (p: any) => !p.id || !value.users[p.user_id] || !Array.isArray(p.media),
      )
    )
      throw new Error("Invalid demo state");
    return value;
  } catch {
    const initial = seed();
    // Preserve corrupt or older schemas for recovery before replacing anything.
    try {
      localStorage.setItem(`${DEMO_KEY}-recovery`, raw);
      persist(initial);
      notice =
        "Saved demo data needed recovery. A fresh seed is loaded; the original JSON is preserved in campnect-demo-v1-recovery.";
    } catch {
      blockedWrite =
        "Saved demo data could not be recovered safely. Free browser storage or explicitly reset Demo Data.";
      notice = blockedWrite;
    }
    return initial;
  }
}
export function persist(state: DemoState) {
  if (blockedWrite) throw new Error(blockedWrite);
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(state));
  } catch {
    throw new Error(
      "Demo storage is full or unavailable. Free browser storage or reset the demo; this change was not saved.",
    );
  }
}
export function resetStorage() {
  blockedWrite = null;
  notice = null;
  localStorage.removeItem(`${DEMO_KEY}-recovery`);
}
