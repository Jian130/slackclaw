#!/usr/bin/env node

import { OpenClawAdapter } from "../apps/daemon/dist/engine/openclaw-adapter.js";

const adapter = new OpenClawAdapter();
const result = await adapter.install(false, { forceLocal: true });

console.log(result.message);
