import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkspaceScaffold } from "./Scaffold.js";
import { StatusBadge } from "./StatusBadge.js";

describe("StatusBadge", () => {
  it("renders danger status without collapsing it to warning", () => {
    const html = renderToStaticMarkup(<StatusBadge tone="danger">Gateway unreachable</StatusBadge>);

    expect(html).toContain("badge--status");
    expect(html).toContain("badge--danger");
    expect(html).toContain("Gateway unreachable");
  });

  it("renders workspace scaffold header and actions", () => {
    const html = renderToStaticMarkup(
      <WorkspaceScaffold
        title="Configuration"
        subtitle="Manage models and channels"
        actions={<button type="button">Refresh</button>}
      >
        <div>Body</div>
      </WorkspaceScaffold>
    );

    expect(html).toContain("workspace-scaffold");
    expect(html).toContain("Configuration");
    expect(html).toContain("Manage models and channels");
    expect(html).toContain("Refresh");
    expect(html).toContain("Body");
  });
});
