import type { HTMLAttributes, PropsWithChildren } from "react";

export function Badge(
  props: PropsWithChildren<HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "info" | "accent" }>
) {
  const { className = "", tone = "neutral", ...rest } = props;
  return <span className={`badge badge--tag badge--${tone} ${className}`.trim()} {...rest} />;
}

export const TagBadge = Badge;
