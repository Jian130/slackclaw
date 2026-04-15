import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { DownloadManager, type DownloadManagerState } from "./download-manager.js";

type DownloadManagerOptions = ConstructorParameters<typeof DownloadManager>[0];
const THIS_FILE = fileURLToPath(import.meta.url);

async function createHarness(overrides: Partial<DownloadManagerOptions> = {}) {
  const root = await mkdtemp(join(tmpdir(), "chillclaw-download-manager-"));
  let state: DownloadManagerState | undefined;
  const published: string[] = [];
  const manager = new DownloadManager({
    readState: async () => state,
    writeState: async (nextState) => {
      state = nextState;
    },
    cacheDir: join(root, "cache"),
    tempDir: join(root, "tmp"),
    now: () => 1770000000000 + published.length,
    publishEvent: (event) => {
      published.push(event.type);
    },
    ...overrides
  });

  return {
    root,
    manager,
    published,
    getState: () => state,
    setState: (nextState: DownloadManagerState | undefined) => {
      state = nextState;
    },
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    }
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function servePayload(payload: string, options?: { forceFullBodyForRange?: boolean }) {
  const requests: Array<{ range?: string }> = [];
  const server = createServer((request, response) => {
    requests.push({ range: request.headers.range });
    const range = request.headers.range?.match(/^bytes=(\d+)-$/u);
    if (range && !options?.forceFullBodyForRange) {
      const start = Number(range[1]);
      response.writeHead(206, {
        "Content-Length": Buffer.byteLength(payload.slice(start)),
        "Content-Range": `bytes ${start}-${Buffer.byteLength(payload) - 1}/${Buffer.byteLength(payload)}`
      });
      response.end(payload.slice(start));
      return;
    }

    response.writeHead(200, {
      "Content-Length": Buffer.byteLength(payload)
    });
    response.end(payload);
  });

  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("Test server did not expose a bound address.");
  }
  return {
    url: `http://127.0.0.1:${address.port}/artifact.bin`,
    requests,
    close: async () => {
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => error ? reject(error) : resolvePromise());
      });
    }
  };
}

async function serveOllamaPull() {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      requests.push(body);
      response.writeHead(200, {
        "Content-Type": "application/x-ndjson"
      });
      response.write(JSON.stringify({ status: "pulling manifest" }) + "\n");
      response.write(JSON.stringify({ status: "downloading layer", completed: 64, total: 128 }) + "\n");
      response.end(JSON.stringify({ status: "success" }) + "\n");
    });
  });

  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("Test server did not expose a bound address.");
  }
  return {
    url: `http://127.0.0.1:${address.port}/api/pull`,
    requests,
    close: async () => {
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => error ? reject(error) : resolvePromise());
      });
    }
  };
}

test("enqueue dedupes active jobs by artifact identity", async () => {
  const harness = await createHarness();
  try {
    const first = await harness.manager.enqueue({
      type: "runtime",
      artifactId: "ollama-runtime",
      displayName: "Ollama runtime",
      version: "0.20.6",
      source: { kind: "file", path: THIS_FILE },
      destinationPolicy: { baseDir: "cache", fileName: "ollama-runtime.tgz" },
      requester: "runtime-manager",
      autoStart: false
    });
    const second = await harness.manager.enqueue({
      type: "runtime",
      artifactId: "ollama-runtime",
      displayName: "Ollama runtime",
      version: "0.20.6",
      source: { kind: "file", path: THIS_FILE },
      destinationPolicy: { baseDir: "cache", fileName: "ollama-runtime.tgz" },
      requester: "runtime-manager",
      autoStart: false
    });

    assert.equal(second.id, first.id);
    assert.equal((await harness.manager.listJobs()).length, 1);
  } finally {
    await harness.cleanup();
  }
});

test("file downloads copy to managed cache and verify sha256", async () => {
  const harness = await createHarness();
  const sourcePath = join(harness.root, "source.txt");
  await writeFile(sourcePath, "hello download manager");
  try {
    const job = await harness.manager.enqueue({
      type: "runtime",
      artifactId: "node-npm-runtime",
      displayName: "Node runtime",
      version: "22.22.2",
      source: { kind: "file", path: sourcePath },
      destinationPolicy: { baseDir: "cache", fileName: "node-runtime.txt" },
      checksum: sha256("hello download manager"),
      requester: "runtime-manager"
    });
    const completed = await harness.manager.waitForJob(job.id);

    assert.equal(completed.status, "completed");
    assert.equal(await readFile(completed.destinationPath, "utf8"), "hello download manager");
    assert.equal(harness.published.includes("download.completed"), true);
  } finally {
    await harness.cleanup();
  }
});

test("http downloads resume partial temp files with range requests", async () => {
  const server = await servePayload("abcdef");
  const harness = await createHarness();
  try {
    const job = await harness.manager.enqueue({
      type: "runtime",
      artifactId: "range-runtime",
      displayName: "Range runtime",
      source: { kind: "http", url: server.url },
      destinationPolicy: { baseDir: "cache", fileName: "range-runtime.bin" },
      expectedBytes: 6,
      requester: "runtime-manager",
      autoStart: false
    });
    await writeFile(job.tempPath, "abc");
    await harness.manager.resume(job.id);
    const completed = await harness.manager.waitForJob(job.id);

    assert.equal(completed.status, "completed");
    assert.equal(await readFile(completed.destinationPath, "utf8"), "abcdef");
    assert.equal(server.requests.at(-1)?.range, "bytes=3-");
  } finally {
    await server.close();
    await harness.cleanup();
  }
});

test("http downloads restart when a range request returns a full response", async () => {
  const server = await servePayload("abcdef", { forceFullBodyForRange: true });
  const harness = await createHarness();
  try {
    const job = await harness.manager.enqueue({
      type: "runtime",
      artifactId: "full-response-runtime",
      displayName: "Full response runtime",
      source: { kind: "http", url: server.url },
      destinationPolicy: { baseDir: "cache", fileName: "full-response-runtime.bin" },
      expectedBytes: 6,
      requester: "runtime-manager",
      autoStart: false
    });
    await writeFile(job.tempPath, "abc");
    await harness.manager.resume(job.id);
    const completed = await harness.manager.waitForJob(job.id);

    assert.equal(completed.status, "completed");
    assert.equal(await readFile(completed.destinationPath, "utf8"), "abcdef");
    assert.equal(server.requests.at(-1)?.range, "bytes=3-");
  } finally {
    await server.close();
    await harness.cleanup();
  }
});

test("ollama pull jobs stream model progress through the download manager", async () => {
  const server = await serveOllamaPull();
  const harness = await createHarness();
  try {
    const job = await harness.manager.enqueue({
      type: "model",
      artifactId: "ollama-model:gemma4:e2b",
      displayName: "Local model gemma4:e2b",
      source: { kind: "ollama-pull", modelTag: "gemma4:e2b", endpoint: server.url },
      destinationPolicy: { baseDir: "cache", fileName: "gemma4-e2b.json" },
      requester: "model-manager"
    });
    const completed = await harness.manager.waitForJob(job.id);

    assert.equal(completed.status, "completed");
    assert.equal(JSON.parse(await readFile(completed.destinationPath, "utf8")).modelTag, "gemma4:e2b");
    assert.deepEqual(JSON.parse(server.requests[0] ?? "{}"), { model: "gemma4:e2b" });
    assert.equal(harness.published.includes("download.progress"), true);
    assert.equal(harness.published.includes("download.completed"), true);
  } finally {
    await server.close();
    await harness.cleanup();
  }
});

test("checksum mismatch marks the job failed and removes the final artifact", async () => {
  const harness = await createHarness();
  const sourcePath = join(harness.root, "bad.txt");
  await writeFile(sourcePath, "bad");
  try {
    const job = await harness.manager.enqueue({
      type: "runtime",
      artifactId: "bad-runtime",
      displayName: "Bad runtime",
      source: { kind: "file", path: sourcePath },
      destinationPolicy: { baseDir: "cache", fileName: "bad-runtime.txt" },
      checksum: sha256("good"),
      requester: "runtime-manager"
    });
    const completed = await harness.manager.waitForJob(job.id);

    assert.equal(completed.status, "failed");
    assert.match(completed.error?.message ?? "", /checksum/i);
    await assert.rejects(() => stat(completed.destinationPath));
  } finally {
    await harness.cleanup();
  }
});

test("restart recovery requeues interrupted jobs", async () => {
  const harness = await createHarness();
  try {
    harness.setState({
      checkedAt: "2026-04-15T00:00:00.000Z",
      jobs: {
        interrupted: {
          id: "interrupted",
          type: "runtime",
          artifactId: "node",
          displayName: "Node",
          source: { kind: "file", path: THIS_FILE },
          destinationPath: join(harness.root, "cache", "node.txt"),
          tempPath: join(harness.root, "tmp", "node.txt.part"),
          downloadedBytes: 0,
          progress: 0,
          status: "downloading",
          priority: 0,
          silent: false,
          requester: "runtime-manager",
          createdAt: 1770000000000,
          updatedAt: 1770000000000
        }
      }
    });

    await harness.manager.resumePersistedJobs();

    assert.equal(harness.getState()?.jobs.interrupted?.status, "completed");
  } finally {
    await harness.cleanup();
  }
});
