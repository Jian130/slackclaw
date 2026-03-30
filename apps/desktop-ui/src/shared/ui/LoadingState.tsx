import { LoaderCircle } from "lucide-react";
import type { HTMLAttributes } from "react";

export function LoadingState(
  props: HTMLAttributes<HTMLDivElement> & {
    title: string;
    description?: string;
    compact?: boolean;
  }
) {
  const { className = "", title, description, compact = false, ...rest } = props;

  return (
    <div
      className={`state-surface state-surface--loading${compact ? " state-surface--compact" : ""} ${className}`.trim()}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <div className="state-surface__content">
        <LoaderCircle className="state-surface__spinner" size={compact ? 20 : 28} />
        <div className="state-surface__meta">
          <strong>{title}</strong>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
    </div>
  );
}
