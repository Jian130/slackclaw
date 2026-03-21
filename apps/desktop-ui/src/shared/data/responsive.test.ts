import { describe, expect, it } from "vitest";

import {
  chatLayoutModeFromWidth,
  viewportModeFromWidth
} from "./responsive.js";

describe("responsive layout helpers", () => {
  it("classifies shell viewport widths into desktop, tablet, and phone modes", () => {
    expect(viewportModeFromWidth(1400)).toBe("desktop");
    expect(viewportModeFromWidth(960)).toBe("tablet");
    expect(viewportModeFromWidth(640)).toBe("phone");
  });

  it("uses a tighter chat layout mode for narrower widths", () => {
    expect(chatLayoutModeFromWidth(1400)).toBe("split");
    expect(chatLayoutModeFromWidth(1024)).toBe("stacked");
    expect(chatLayoutModeFromWidth(680)).toBe("compact");
  });
});
