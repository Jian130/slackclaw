import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { LoaderCircle } from "lucide-react";

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
      {loading ? <LoaderCircle className="button__spinner" size={16} /> : null}
      <span className="button__label">{children}</span>
    </button>
  );
}
