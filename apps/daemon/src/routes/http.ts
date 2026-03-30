import type { IncomingMessage } from "node:http";

import type { JsonBody, RouteResponse } from "./types.js";

export async function readJson<T extends JsonBody>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export function jsonResponse(body: unknown, statusCode = 200): RouteResponse {
  return {
    statusCode,
    body
  };
}
