import { createStore } from "zustand/vanilla";
import { restore, persist } from "./storage";
import { DEMO_MODE, DEMO_KEY } from "./config";
import { seed, type DemoState } from "./seed";
export const demoStore = createStore<{ data: DemoState }>(() => ({
  data: DEMO_MODE ? restore() : seed(0),
}));
export function commit(data: DemoState) {
  persist(data);
  demoStore.setState({ data });
  window.dispatchEvent(new Event("campnect:demo-change"));
}
if (DEMO_MODE)
  window.addEventListener("storage", (e) => {
    if (e.key === DEMO_KEY && e.newValue) {
      demoStore.setState({ data: DEMO_MODE ? restore() : seed(0) });
      window.dispatchEvent(new Event("campnect:demo-change"));
    }
  });
