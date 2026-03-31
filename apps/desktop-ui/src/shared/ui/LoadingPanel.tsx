import { LoadingState } from "./LoadingState.js";

export function LoadingPanel(props: { title: string; description?: string; compact?: boolean }) {
  return <LoadingState {...props} className={`loading-panel${props.compact ? " loading-panel--compact" : ""}`} />;
}
