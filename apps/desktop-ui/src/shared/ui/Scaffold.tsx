import type { PropsWithChildren } from "react";

import { PageHeader } from "./PageHeader.js";

type ContentWidth = "centered" | "full";

type HeaderProps = {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
};

function scaffoldContentWidthClass(baseClass: string, contentWidth: ContentWidth | undefined, fallback: ContentWidth) {
  const resolved = contentWidth ?? fallback;
  return `${baseClass}--${resolved}`;
}

export function WorkspaceScaffold(
  props: PropsWithChildren<HeaderProps & { className?: string; contentWidth?: ContentWidth }>
) {
  return (
    <section
      className={`workspace-scaffold panel-stack ${scaffoldContentWidthClass("workspace-scaffold", props.contentWidth, "centered")} ${props.className ?? ""}`.trim()}
    >
      <PageHeader title={props.title} subtitle={props.subtitle} actions={props.actions} />
      {props.children}
    </section>
  );
}

export function OperationsScaffold(
  props: PropsWithChildren<
    HeaderProps & {
      activity?: React.ReactNode;
      hero?: React.ReactNode;
      className?: string;
      contentWidth?: ContentWidth;
    }
  >
) {
  return (
    <section
      className={`operations-scaffold panel-stack ${scaffoldContentWidthClass("operations-scaffold", props.contentWidth, "centered")} ${props.className ?? ""}`.trim()}
    >
      <PageHeader title={props.title} subtitle={props.subtitle} actions={props.actions} />
      {props.activity ? <div className="operations-scaffold__activity">{props.activity}</div> : null}
      {props.hero ? <div className="operations-scaffold__hero">{props.hero}</div> : null}
      {props.children}
    </section>
  );
}

export function SplitContentScaffold(
  props: PropsWithChildren<
    HeaderProps & {
      sidebar: React.ReactNode;
      detail: React.ReactNode;
      className?: string;
      contentWidth?: ContentWidth;
    }
  >
) {
  return (
    <section
      className={`split-content-scaffold panel-stack ${scaffoldContentWidthClass("split-content-scaffold", props.contentWidth, "full")} ${props.className ?? ""}`.trim()}
    >
      <PageHeader title={props.title} subtitle={props.subtitle} actions={props.actions} />
      <div className="split-content-scaffold__body">
        <aside className="split-content-scaffold__sidebar">{props.sidebar}</aside>
        <div className="split-content-scaffold__detail">{props.detail}</div>
      </div>
      {props.children}
    </section>
  );
}

export function GuidedFlowScaffold(
  props: PropsWithChildren<{
    header: React.ReactNode;
    footer?: React.ReactNode;
    aside?: React.ReactNode;
    className?: string;
    contentWidth?: ContentWidth;
  }>
) {
  return (
    <section
      className={`guided-flow-scaffold ${scaffoldContentWidthClass("guided-flow-scaffold", props.contentWidth, "centered")} ${props.className ?? ""}`.trim()}
    >
      <div className="guided-flow-scaffold__header">{props.header}</div>
      <div className="guided-flow-scaffold__body">
        <div className="guided-flow-scaffold__content">{props.children}</div>
        {props.aside ? <aside className="guided-flow-scaffold__aside">{props.aside}</aside> : null}
      </div>
      {props.footer ? <div className="guided-flow-scaffold__footer">{props.footer}</div> : null}
    </section>
  );
}
