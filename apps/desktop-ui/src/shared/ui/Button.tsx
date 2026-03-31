import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export function Button(
  props: PropsWithChildren<
    ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: Variant;
      size?: Size;
      fullWidth?: boolean;
      loading?: boolean;
    }
  >
) {
  const {
    children,
    className = "",
    variant = "primary",
    size = "md",
    fullWidth = false,
    loading = false,
    disabled,
    ...rest
  } = props;

  return (
    <button
      aria-busy={loading}
      className={`button button--${variant} button--${size}${fullWidth ? " button--full" : ""}${loading ? " button--loading" : ""} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span aria-hidden="true" className="button__busy-indicator">
          <span className="button__busy-ring" />
          <span className="button__busy-core" />
          <span className="button__busy-spark" />
        </span>
      ) : null}
      <span className="button__label">{children}</span>
    </button>
  );
}
