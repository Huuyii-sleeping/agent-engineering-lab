import { sanitizeAndRedactText, sanitizeAndRedactValue } from "../security/data-hygiene.js";
import type { ToolRegistration } from "./protocol.js";

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: JsonRpcError;
};

export type McpToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpCallResult = {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

export type McpToolRegistration = ToolRegistration & {
  target: "mcp";
  serverName: string;
  remoteName: string;
};

function fail(code: string, message: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ ok: false, error: { code, message }, ...(extra ?? {}) }, null, 2);
}

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "tool";
}

function normalizeInputSchema(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { type: "object", properties: {} };
}

function extractTextContent(result: McpCallResult): string {
  const lines = (result.content ?? [])
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => sanitizeAndRedactText(item.text?.trim() ?? ""))
    .filter(Boolean);
  return lines.join("\n");
}

export function writeFrame(target: NodeJS.WritableStream, payload: unknown): void {
  const body = JSON.stringify(payload);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
  target.write(`${header}${body}`, "utf8");
}

export function makeToolAlias(serverName: string, remoteName: string, used: Set<string>): string {
  const prefix = `mcp__${sanitizeSegment(serverName)}__${sanitizeSegment(remoteName)}`;
  let alias = prefix;
  let counter = 2;
  while (used.has(alias)) {
    alias = `${prefix}_${counter}`;
    counter += 1;
  }
  used.add(alias);
  return alias;
}

export function parseToolsList(result: unknown): McpToolDescriptor[] {
  const tools = (result as { tools?: unknown })?.tools;
  if (!Array.isArray(tools)) {
    return [];
  }
  return tools
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const tool = item as Record<string, unknown>;
      const name = String(tool.name ?? "").trim();
      if (!name) {
        return null;
      }
      return {
        name,
        description: sanitizeAndRedactText(String(tool.description ?? "")),
        inputSchema: normalizeInputSchema(tool.inputSchema),
      } satisfies McpToolDescriptor;
    })
    .filter((item): item is McpToolDescriptor => Boolean(item));
}

export function parseCallResult(result: unknown): McpCallResult {
  if (!result || typeof result !== "object") {
    return {};
  }
  return result as McpCallResult;
}

export function formatMcpFailure(code: string, message: string, extra?: Record<string, unknown>): string {
  return fail(code, message, extra);
}

export function normalizeMcpCallOutput(serverName: string, remoteName: string, result: McpCallResult): string {
  if (result.structuredContent !== undefined) {
    if (typeof result.structuredContent === "string") {
      return sanitizeAndRedactText(result.structuredContent);
    }
    return `${JSON.stringify(sanitizeAndRedactValue(result.structuredContent), null, 2)}\n`;
  }
  const text = extractTextContent(result);
  if (result.isError) {
    return fail("MCP_TOOL_CALL_FAILED", text || `mcp tool ${serverName}/${remoteName} failed`, {
      server: serverName,
      remoteTool: remoteName,
    });
  }
  return JSON.stringify(
    {
      ok: true,
      server: serverName,
      remoteTool: remoteName,
      content: text,
    },
    null,
    2,
  );
}
