import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./Button.js";

describe("Button", () => {
  it("renders the shared busy indicator for loading actions", () => {
    const markup = renderToStaticMarkup(<Button loading>Removing model</Button>);

    expect(markup).toContain("button__busy-indicator");
  });
});
