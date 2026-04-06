import { figmaAssets } from "../assets/figmaAssets.js";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "horizontal" | "vertical";
  theme?: "light" | "dark";
  className?: string;
}

export function Logo({ size = "md", variant = "horizontal", theme = "light", className = "" }: LogoProps) {
  const sizes = {
    horizontal: {
      sm: "h-8",
      md: "h-12",
      lg: "h-16",
      xl: "h-20"
    },
    vertical: {
      sm: "h-14",
      md: "h-20",
      lg: "h-28",
      xl: "h-36"
    }
  } as const;

  const source =
    variant === "horizontal"
      ? theme === "dark"
        ? figmaAssets.logoHorizontalLight
        : figmaAssets.logoHorizontalDark
      : theme === "dark"
        ? figmaAssets.logoVerticalLight
        : figmaAssets.logoVerticalDark;

  return <img alt="ChillClaw" className={`${sizes[variant][size]} w-auto ${className}`.trim()} src={source} />;
}
