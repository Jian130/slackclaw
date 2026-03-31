import { TriangleAlert } from "lucide-react";
import type { HTMLAttributes } from "react";

import { Button } from "./Button.js";

export function ErrorState(
  props: HTMLAttributes<HTMLDivElement> & {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    compact?: boolean;
  }
) {
  const {
    className = "",
    title,
    description,
    actionLabel,
    onAction,
    compact = false,
    ...rest
  } = props;

  return (
    <div
      className={`state-surface state-surface--error${compact ? " state-surface--compact" : ""} ${className}`.trim()}
      role="alert"
      {...rest}
    >
      <div className="state-surface__content">
        <div className="state-surface__icon">
          <TriangleAlert size={compact ? 18 : 22} />
        </div>
        <div className="state-surface__meta">
          <strong>{title}</strong>
          <p>{description}</p>
          {actionLabel && onAction ? (
            <div className="state-surface__actions">
              <Button onClick={onAction} variant="outline">
                {actionLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
