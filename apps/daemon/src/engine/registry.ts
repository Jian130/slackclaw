import type { EngineAdapter } from "./adapter.js";
import { MockAdapter } from "./mock-adapter.js";
import { OpenClawAdapter } from "./openclaw-adapter.js";

export function createEngineAdapter(): EngineAdapter {
  const selected = process.env.SLACKCLAW_ENGINE ?? "openclaw";

  if (selected === "mock") {
    return new MockAdapter();
  }

  return new OpenClawAdapter();
}
