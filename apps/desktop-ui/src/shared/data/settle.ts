export interface SettleAfterMutationOptions<TMutation, TState> {
  mutate: () => Promise<TMutation>;
  readFresh: () => Promise<TState>;
  isSettled: (state: TState, mutation: TMutation) => boolean;
  getProvisionalState?: (mutation: TMutation) => TState | undefined;
  applyState?: (state: TState) => void | Promise<void>;
  attempts?: number;
  delayMs?: number;
}

export interface SettleAfterMutationResult<TMutation, TState> {
  mutation: TMutation;
  state: TState;
  settled: boolean;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function settleAfterMutation<TMutation, TState>(
  options: SettleAfterMutationOptions<TMutation, TState>
): Promise<SettleAfterMutationResult<TMutation, TState>> {
  const mutation = await options.mutate();
  const provisional = options.getProvisionalState?.(mutation);

  if (provisional !== undefined) {
    await options.applyState?.(provisional);
  }

  const attempts = Math.max(options.attempts ?? 8, 1);
  const delayMs = Math.max(options.delayMs ?? 500, 0);
  let latestState = provisional;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latestState = await options.readFresh();
    await options.applyState?.(latestState);

    if (options.isSettled(latestState, mutation)) {
      return {
        mutation,
        state: latestState,
        settled: true
      };
    }

    if (attempt < attempts - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  if (latestState === undefined) {
    throw new Error("ChillClaw could not verify the latest state after this action.");
  }

  return {
    mutation,
    state: latestState,
    settled: false
  };
}
