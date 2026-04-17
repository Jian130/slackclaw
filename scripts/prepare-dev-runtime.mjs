#!/usr/bin/env node

import { OpenClawAdapter } from "../apps/daemon/dist/engine/openclaw-adapter.js";
import { createRuntimeManager } from "../apps/daemon/dist/runtime-manager/default-runtime-manager.js";

const runtimeManager = createRuntimeManager();
const adapter = new OpenClawAdapter(undefined, runtimeManager);
const result = await adapter.install(false, { forceLocal: true });

console.log(result.message);
