import test from "node:test";
import assert from "node:assert/strict";

import { MockAdapter } from "../engine/mock-adapter.js";

test("feature workflow delegates plugin-backed prerequisites for WeChat Work", async () => {
  const { FeatureWorkflowService } = await import("./feature-workflow-service.js");

  class RecordingAdapter extends MockAdapter {
    ensureCalls: string[] = [];
    ensureOptions: Array<{ deferGatewayRestart?: boolean } | undefined> = [];

    override async ensureFeatureRequirements(featureId: string, options?: { deferGatewayRestart?: boolean }) {
      this.ensureCalls.push(featureId);
      this.ensureOptions.push(options);
      return super.ensureFeatureRequirements(featureId, options);
    }
  }

  const adapter = new RecordingAdapter();
  const service = new FeatureWorkflowService(adapter);

  const result = await service.prepareFeature("channel:wechat-work");

  assert.deepEqual(adapter.ensureCalls, ["channel:wechat-work"]);
  assert.deepEqual(adapter.ensureOptions, [{ deferGatewayRestart: true }]);
  assert.equal(result.feature.id, "channel:wechat-work");
  assert.equal(result.feature.setupKind, "credential-form");
  assert.equal(result.prerequisites[0]?.type, "openclaw-plugin");
  assert.equal(result.prerequisites[0]?.status, "ready");
  assert.equal(result.pluginConfig?.entries[0]?.id, "wecom");
});

test("feature workflow queues external installers without pretending they are plugins", async () => {
  const { FeatureWorkflowService } = await import("./feature-workflow-service.js");

  class RecordingAdapter extends MockAdapter {
    ensureCalls: string[] = [];

    override async ensureFeatureRequirements(featureId: string) {
      this.ensureCalls.push(featureId);
      return super.ensureFeatureRequirements(featureId);
    }
  }

  const adapter = new RecordingAdapter();
  const service = new FeatureWorkflowService(adapter);

  const result = await service.prepareFeature("channel:wechat");

  assert.deepEqual(adapter.ensureCalls, []);
  assert.equal(result.feature.id, "channel:wechat");
  assert.equal(result.feature.setupKind, "session");
  assert.equal(result.pluginConfig, undefined);
  assert.deepEqual(result.prerequisites, [
    {
      type: "external-installer",
      status: "queued",
      installerId: "@tencent-weixin/openclaw-weixin-cli",
      displayName: "Personal WeChat installer",
      command: ["npx", "-y", "@tencent-weixin/openclaw-weixin-cli@latest", "install"]
    }
  ]);
});
