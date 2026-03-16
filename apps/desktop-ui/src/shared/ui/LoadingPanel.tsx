import { LoaderCircle } from "lucide-react";

export function LoadingPanel(props: { title: string; description?: string; compact?: boolean }) {
  return (
    <div className={`loading-panel${props.compact ? " loading-panel--compact" : ""}`} role="status" aria-live="polite">
      <div className="loading-panel__content">
        <LoaderCircle className="loading-panel__spinner" size={28} />
        <div className="loading-panel__meta">
          <strong>{props.title}</strong>
          {props.description ? <p>{props.description}</p> : null}
        </div>
      </div>
    </div>
  );
}
