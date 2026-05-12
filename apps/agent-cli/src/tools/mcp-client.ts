import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as process from "node:process";
import { getExecutionContext, recordObservabilityEvent } from "../observability/runtime.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import type { McpServerConfig } from "./mcp-config.js";
import {
  parseCallResult,
  parseToolsList,
  writeFrame,
  type JsonRpcResponse,
  type McpCallResult,
  type McpToolDescriptor,
} from "./mcp-protocol.js";

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
};

export class McpServerClient {
  private processRef: ChildProcessWithoutNullStreams | null = null;
  private initialized = false;
  private buffer = Buffer.alloc(0);
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private startPromise: Promise<void> | null = null;
  private stderrTail = "";

  constructor(private readonly config: McpServerConfig) {}

  private async record(kind: string, payload: Record<string, unknown>): Promise<void> {
    const context = getExecutionContext();
    await recordObservabilityEvent(kind, payload, context ?? undefined);
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    const message =
      code === null
        ? `mcp server ${this.config.name} exited with signal ${signal ?? "unknown"}`
        : `mcp server ${this.config.name} exited with code ${code}`;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
    this.processRef = null;
    this.initialized = false;
    this.buffer = Buffer.alloc(0);
    void this.record("mcp_lifecycle", {
      serverName: this.config.name,
      action: "exit",
      code,
      signal,
      stderr: this.stderrTail.slice(-400),
    });
  }

  private handleResponse(message: JsonRpcResponse): void {
    if (typeof message.id !== "number") {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(
        new Error(
          `mcp ${this.config.name} ${pending.method} failed: ${message.error.message} (${message.error.code})`,
        ),
      );
      return;
    }
    pending.resolve(message.result);
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }
      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.close("invalid_header");
        return;
      }
      const bodyLength = Number(match[1]);
      const frameEnd = headerEnd + 4 + bodyLength;
      if (this.buffer.length < frameEnd) {
        return;
      }
      const body = this.buffer.slice(headerEnd + 4, frameEnd).toString("utf8");
      this.buffer = this.buffer.slice(frameEnd);
      try {
        this.handleResponse(JSON.parse(body) as JsonRpcResponse);
      } catch {
        this.close("invalid_json");
        return;
      }
    }
  }

  private async start(): Promise<void> {
    const child = spawn(this.config.command, this.config.args, {
      cwd: this.config.cwd,
      env: { ...process.env, ...this.config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.processRef = child;
    child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString("utf8")}`.slice(-2000);
    });
    child.on("exit", (code, signal) => this.handleExit(code, signal));
    child.on("error", (error) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      this.processRef = null;
      this.initialized = false;
      void this.record("mcp_lifecycle", {
        serverName: this.config.name,
        action: "spawn_error",
        message: this.describeError(error),
      });
    });

    const initializeResult = await this.request(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "agent-cli", version: "0.1.0" },
        capabilities: {},
      },
      RUNTIME_CONFIG.mcpStartupTimeoutMs,
    );
    if (!initializeResult || typeof initializeResult !== "object") {
      this.close("initialize_invalid");
      throw new Error(`mcp server ${this.config.name} returned invalid initialize payload`);
    }
    this.initialized = true;
    this.notify("notifications/initialized", {});
    await this.record("mcp_lifecycle", {
      serverName: this.config.name,
      action: "initialized",
      command: this.config.command,
    });
  }

  async ensureStarted(): Promise<void> {
    if (this.initialized && this.processRef && !this.processRef.killed) {
      return;
    }
    if (!this.startPromise) {
      this.startPromise = this.start().finally(() => {
        this.startPromise = null;
      });
    }
    await this.startPromise;
  }

  private notify(method: string, params: Record<string, unknown>): void {
    if (!this.processRef?.stdin.writable) {
      return;
    }
    writeFrame(this.processRef.stdin, { jsonrpc: "2.0", method, params });
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    if (!this.processRef?.stdin.writable) {
      return Promise.reject(new Error(`mcp server ${this.config.name} is not writable`));
    }
    const stdin = this.processRef.stdin;
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.close("timeout");
        reject(new Error(`mcp request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      try {
        writeFrame(stdin, { jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    await this.ensureStarted();
    const result = await this.request("tools/list", {}, this.config.requestTimeoutMs);
    return parseToolsList(result);
  }

  async callTool(remoteName: string, args: Record<string, unknown>): Promise<McpCallResult> {
    await this.ensureStarted();
    const result = await this.request(
      "tools/call",
      { name: remoteName, arguments: args },
      this.config.requestTimeoutMs,
    );
    return parseCallResult(result);
  }

  close(reason: string): void {
    if (!this.processRef) {
      return;
    }
    const current = this.processRef;
    this.processRef = null;
    this.initialized = false;
    this.buffer = Buffer.alloc(0);
    try {
      current.kill();
    } catch {
      // ignore cleanup failure
    }
    void this.record("mcp_lifecycle", {
      serverName: this.config.name,
      action: "close",
      reason,
    });
  }
}
