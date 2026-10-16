import assert from "node:assert/strict";
import test from "node:test";
import {
  restore,
  persist,
  resetStorage,
  getStorageNotice,
} from "../storage.ts";
import { DEMO_KEY } from "../config.ts";
const memory = new Map<string, string>();
let failWrites = false;
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    removeItem: (k: string) => memory.delete(k),
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error("QuotaExceededError");
      memory.set(k, v);
    },
  },
});
test("reload restores edits without reseeding or duplicating records", () => {
  memory.clear();
  resetStorage();
  const s = restore();
  s.users.u1.bio = "Saved campus bio";
  persist(s);
  const restored = restore();
  assert.equal(restored.users.u1.bio, "Saved campus bio");
  assert.equal(restored.seededAt, s.seededAt);
  assert.equal(Object.keys(restored.messages).length, 252);
});
test("corrupt and outdated data is backed up and recovery is explained", () => {
  memory.clear();
  resetStorage();
  memory.set(DEMO_KEY, "{broken");
  const s = restore();
  assert.equal(s.version, 1);
  assert.equal(memory.get(`${DEMO_KEY}-recovery`), "{broken");
  assert.match(getStorageNotice()!, /recovery/);
  memory.set(DEMO_KEY, JSON.stringify({ ...s, version: 0 }));
  const old = memory.get(DEMO_KEY);
  restore();
  assert.equal(memory.get(`${DEMO_KEY}-recovery`), old);
});
test("failed writes reject without overwriting the last durable state", () => {
  memory.clear();
  resetStorage();
  const s = restore(),
    previous = memory.get(DEMO_KEY);
  s.users.u1.bio = "Cannot save";
  failWrites = true;
  assert.throws(() => persist(s), /not saved/);
  assert.equal(memory.get(DEMO_KEY), previous);
  failWrites = false;
});
