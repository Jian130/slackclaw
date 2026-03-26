import type { PropsWithChildren } from "react";

export function InfoBanner(props: PropsWithChildren<{ icon?: React.ReactNode; title: string; description: string; accent?: "blue" | "green" | "purple" | "orange" | "red" }>) {
  return (
    <div className={`info-banner info-banner--${props.accent ?? "blue"}`}>
      {props.icon ? <div className="info-banner__icon">{props.icon}</div> : null}
      <div>
        <h3>{props.title}</h3>
        <p>{props.description}</p>
        {props.children}
      </div>
    </div>
  );
}
