import { describe, expect, it, vi } from "vitest";

import { settleAfterMutation } from "./settle.js";

describe("settleAfterMutation", () => {
  it("applies provisional state, polls fresh state, and settles when the predicate matches", async () => {
    const applyState = vi.fn();
    const mutate = vi.fn(async () => ({ value: 1 }));
    const readFresh = vi
      .fn<() => Promise<{ value: number }>>()
      .mockResolvedValueOnce({ value: 2 })
      .mockResolvedValueOnce({ value: 3 });

    const result = await settleAfterMutation({
      mutate,
      readFresh,
      getProvisionalState: (mutation) => mutation,
      applyState,
      isSettled: (state) => state.value === 3,
      attempts: 2,
      delayMs: 0
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(readFresh).toHaveBeenCalledTimes(2);
    expect(applyState).toHaveBeenCalledTimes(3);
    expect(applyState).toHaveBeenNthCalledWith(1, { value: 1 });
    expect(applyState).toHaveBeenNthCalledWith(2, { value: 2 });
    expect(applyState).toHaveBeenNthCalledWith(3, { value: 3 });
    expect(result).toEqual({
      mutation: { value: 1 },
      state: { value: 3 },
      settled: true
    });
  });

  it("returns the latest state and marks the settle attempt as incomplete after timeout", async () => {
    const applyState = vi.fn();
    const readFresh = vi
      .fn<() => Promise<{ value: number }>>()
      .mockResolvedValueOnce({ value: 2 })
      .mockResolvedValueOnce({ value: 2 });

    const result = await settleAfterMutation({
      mutate: async () => ({ value: 1 }),
      readFresh,
      getProvisionalState: (mutation) => mutation,
      applyState,
      isSettled: (state) => state.value === 3,
      attempts: 2,
      delayMs: 0
    });

    expect(result).toEqual({
      mutation: { value: 1 },
      state: { value: 2 },
      settled: false
    });
  });
});
