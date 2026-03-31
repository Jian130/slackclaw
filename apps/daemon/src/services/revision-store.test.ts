import test from "node:test";
import assert from "node:assert/strict";

import { RevisionStore } from "./revision-store.js";

test("revision store keeps a stable epoch and increments revisions per resource", () => {
  const store = new RevisionStore();

  const firstOverview = store.nextSnapshot("overview", { ok: true });
  const secondOverview = store.nextSnapshot("overview", { ok: true, count: 2 });
  const firstModels = store.nextSnapshot("model-config", { configuredModelKeys: [] });

  assert.equal(firstOverview.epoch, secondOverview.epoch);
  assert.equal(firstOverview.epoch, firstModels.epoch);
  assert.equal(firstOverview.revision, 1);
  assert.equal(secondOverview.revision, 2);
  assert.equal(firstModels.revision, 1);
});

test("revision store derives mutation metadata from a published snapshot revision", () => {
  const store = new RevisionStore();

  const snapshot = store.nextSnapshot("skill-catalog", { installedSkills: [] });
  const meta = store.toMutationMeta(snapshot, false);

  assert.equal(meta.epoch, snapshot.epoch);
  assert.equal(meta.revision, snapshot.revision);
  assert.equal(meta.settled, false);
});
