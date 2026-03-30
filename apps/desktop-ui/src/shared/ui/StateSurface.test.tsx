import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorState } from "./ErrorState.js";
import { LoadingState } from "./LoadingState.js";

describe("shared state surfaces", () => {
  it("renders loading state with the shared surface class", () => {
    const html = renderToStaticMarkup(
      <LoadingState title="Loading skills" description="Checking the shared skills library." compact />
    );

    expect(html).toContain("state-surface");
    expect(html).toContain("state-surface--loading");
    expect(html).toContain("Loading skills");
  });

  it("renders error state with the shared danger surface class", () => {
    const html = renderToStaticMarkup(
      <ErrorState title="Could not load skills" description="The daemon request failed." />
    );

    expect(html).toContain("state-surface");
    expect(html).toContain("state-surface--error");
    expect(html).toContain("Could not load skills");
  });
});
