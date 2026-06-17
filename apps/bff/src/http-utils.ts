import type { ServerResponse } from "node:http";

export type JsonObject = Record<string, unknown>;

/** Apply common Web-facing response headers for BFF endpoints. */
export function applyCommonHeaders(res: ServerResponse): void {
  applyHeaderSetters(res);
}

export function applyHeaderSetters(res: { setHeader(name: string, value: string): void }): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Last-Event-ID");
  res.setHeader("Cache-Control", "no-store");
}

/** Write a JSON response with the BFF common headers. */
export function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  applyCommonHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export function errorPayload(code: string, message: string, metadata: JsonObject = {}): JsonObject {
  return {
    ok: false,
    error: {
      code,
      message,
      ...metadata,
    },
  };
}
