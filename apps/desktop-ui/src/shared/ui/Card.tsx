import type { HTMLAttributes, PropsWithChildren } from "react";

type CardTone = "default" | "muted" | "accent" | "danger";

export function Card(
  props: PropsWithChildren<HTMLAttributes<HTMLElement> & { tone?: CardTone }>
) {
  const { className = "", tone = "default", ...rest } = props;
  return <section className={`card card--${tone} ${className}`.trim()} {...rest} />;
}

export function CardHeader(props: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  const { className = "", ...rest } = props;
  return <div className={`card__header ${className}`.trim()} {...rest} />;
}

export function CardTitle(props: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) {
  const { className = "", ...rest } = props;
  return <h2 className={`card__title ${className}`.trim()} {...rest} />;
}

export function CardDescription(props: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) {
  const { className = "", ...rest } = props;
  return <p className={`card__description ${className}`.trim()} {...rest} />;
}

export function CardContent(props: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  const { className = "", ...rest } = props;
  return <div className={`card__content ${className}`.trim()} {...rest} />;
}
