import type { HTMLAttributes, PropsWithChildren } from "react";

export function StatusBadge(
  props: PropsWithChildren<HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "info" | "danger" }>
) {
  const { className = "", tone = "neutral", ...rest } = props;
  return <span className={`badge badge--status badge--${tone} ${className}`.trim()} {...rest} />;
}
