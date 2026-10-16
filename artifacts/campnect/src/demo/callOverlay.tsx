import { useCallStore } from "../stores/callStore";
import { DemoCallPreview } from "./components";
export function DemoCallOverlay() {
  const call = useCallStore((s) => s.activeCall);
  return call ? <DemoCallPreview session={call} /> : null;
}
