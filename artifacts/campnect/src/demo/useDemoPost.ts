import { useStore } from "zustand";
import { demoStore } from "./store";
import { DEMO_MODE } from "./config";
import { useAuthStore } from "../stores/authStore";
import type { Post } from "../stores/feedStore";
import { projectPost } from "./projections";
export function useDemoPost<T extends Post | null>(initial: T): T {
  const data = useStore(demoStore, (s) => (DEMO_MODE ? s.data : null));
  const me = useAuthStore((s) => s.user?.id || "");
  if (!data || !initial || !data.posts[initial.id]) return initial;
  return projectPost(data, me, data.posts[initial.id]) as T;
}
