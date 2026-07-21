import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { HttpNodeConfig } from "@orbit/workflow-core";
import type { WorkflowNodeExecutor } from "../executor-registry.js";

const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "169.254.169.254", "metadata.google.internal"]);

function blockedIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

function blockedAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  return blockedIpv4(normalized) || normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}

/** 在网络请求发出前拒绝本地、私网和云 metadata 目标。 */
export async function assertSafeWorkflowHttpUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`禁止的 HTTP 协议：${url.protocol}`);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || blockedIpv4(host) || (isIP(host) === 6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")))) {
    throw new Error(`禁止访问本地或私有网络地址：${host}`);
  }
  if (isIP(host) === 0) {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (addresses.some((item) => blockedAddress(item.address))) throw new Error(`域名 ${host} 解析到了禁止的本地或私有网络地址。`);
  }
  return url;
}

export type WorkflowHttpClient = {
  request(input: { url: URL; method: string; headers: Record<string, string>; body?: string; signal: AbortSignal; maxBytes: number }): Promise<{ status: number; headers: Record<string, string>; body: string }>;
};

/** 使用 fetch 且限制响应体积的默认 HTTP 客户端。 */
export class DefaultWorkflowHttpClient implements WorkflowHttpClient {
  async request(input: Parameters<WorkflowHttpClient["request"]>[0]) {
    const response = await fetch(input.url, { method: input.method, headers: input.headers, body: input.body, signal: input.signal, redirect: "error" });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > input.maxBytes) {
          await reader.cancel();
          throw new Error(`HTTP 响应超过 ${input.maxBytes} 字节上限。`);
        }
        chunks.push(result.value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: new TextDecoder().decode(bytes) };
  }
}

function parseBody(raw: string, contentType: string | undefined): unknown {
  if (!raw) return null;
  if (contentType?.includes("json")) {
    try { return JSON.parse(raw) as unknown; } catch { return raw; }
  }
  return raw;
}

/** HTTP 节点执行器。 */
export class HttpWorkflowExecutor implements WorkflowNodeExecutor {
  readonly identity = { id: "workflow.http", version: 1 } as const;
  constructor(private readonly client: WorkflowHttpClient = new DefaultWorkflowHttpClient()) {}

  async execute(context: Parameters<WorkflowNodeExecutor["execute"]>[0]) {
    const config = context.node.config as HttpNodeConfig;
    const url = await assertSafeWorkflowHttpUrl(String(await context.variables.resolveValue(config.url) ?? ""));
    const headers = await context.variables.resolveValue(config.headers) as Record<string, unknown>;
    if (config.credential) {
      const credential = await context.variables.resolve({ scope: "secret", credentialId: config.credential.credentialId, key: config.credential.key });
      if (credential && typeof credential === "object" && !Array.isArray(credential)) Object.assign(headers, credential);
      else if (credential !== undefined) headers.authorization = `Bearer ${String(credential)}`;
    }
    const bodyValue = config.body ? await context.variables.resolveValue(config.body) : undefined;
    const result = await this.client.request({
      url,
      method: config.method,
      headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)])),
      body: bodyValue === undefined ? undefined : typeof bodyValue === "string" ? bodyValue : JSON.stringify(bodyValue),
      signal: context.signal,
      maxBytes: 1_048_576,
    });
    return { outputs: { body: parseBody(result.body, result.headers["content-type"]), status: result.status, headers: result.headers } };
  }
}
