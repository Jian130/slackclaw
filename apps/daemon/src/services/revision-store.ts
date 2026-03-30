import { randomUUID } from "node:crypto";

import type { MutationSyncMeta, RevisionedSnapshot } from "@slackclaw/contracts";

export type RevisionedResource =
  | "overview"
  | "ai-team"
  | "model-config"
  | "channel-config"
  | "plugin-config"
  | "skill-catalog"
  | "preset-skill-sync";

export class RevisionStore {
  private readonly epoch = randomUUID();
  private readonly revisions = new Map<RevisionedResource, number>();

  nextSnapshot<T>(resource: RevisionedResource, data: T): RevisionedSnapshot<T> {
    const revision = (this.revisions.get(resource) ?? 0) + 1;
    this.revisions.set(resource, revision);

    return {
      epoch: this.epoch,
      revision,
      data
    };
  }

  toMutationMeta(snapshot: Pick<RevisionedSnapshot<unknown>, "epoch" | "revision">, settled: boolean): MutationSyncMeta {
    return {
      epoch: snapshot.epoch,
      revision: snapshot.revision,
      settled
    };
  }
}
