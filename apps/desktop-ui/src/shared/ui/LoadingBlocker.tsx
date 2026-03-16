import type { PropsWithChildren } from "react";
import { LoaderCircle } from "lucide-react";

export function LoadingBlocker(
  props: PropsWithChildren<{ active: boolean; label: string; description?: string }>
) {
  return (
    <div className={`loading-blocker${props.active ? " loading-blocker--active" : ""}`}>
      {props.children}
      {props.active ? (
        <div className="loading-blocker__overlay" role="status" aria-live="polite">
          <div className="loading-blocker__card">
            <LoaderCircle className="loading-blocker__spinner" size={18} />
            <div className="loading-blocker__meta">
              <strong>{props.label}</strong>
              {props.description ? <p>{props.description}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
