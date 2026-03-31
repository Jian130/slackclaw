import type { MutationSyncMeta } from "@chillclaw/contracts";

export function fallbackMutationSyncMeta(settled = true): MutationSyncMeta {
  return {
    epoch: "daemon-local",
    revision: 0,
    settled
  };
}
