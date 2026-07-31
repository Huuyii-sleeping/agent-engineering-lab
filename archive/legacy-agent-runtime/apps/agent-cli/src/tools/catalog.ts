import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { listMcpToolRegistrations } from "./mcp.js";
import {
  toChatCompletionTool,
  toToolMetadata,
  type ToolRegistration,
} from "./protocol.js";
import { BUILTIN_TOOL_REGISTRATIONS } from "./registry.js";

export type ToolCatalogLike = {
  listTools(): Promise<ChatCompletionTool[]>;
  listToolRegistrations(): Promise<ToolRegistration[]>;
  listToolMetadata(): Promise<Array<Record<string, string>>>;
  getToolRegistration?(name: string): Promise<ToolRegistration | null>;
};

export class ToolCatalog implements ToolCatalogLike {
  async listTools(): Promise<ChatCompletionTool[]> {
    return (await this.listToolRegistrations()).map(toChatCompletionTool);
  }

  async listToolRegistrations(): Promise<ToolRegistration[]> {
    return [...BUILTIN_TOOL_REGISTRATIONS, ...(await listMcpToolRegistrations())];
  }

  async listToolMetadata(): Promise<Array<Record<string, string>>> {
    return (await this.listToolRegistrations()).map(toToolMetadata);
  }

  async getToolRegistration(name: string): Promise<ToolRegistration | null> {
    return (await this.listToolRegistrations()).find((tool) => tool.name === name) ?? null;
  }
}

export const DEFAULT_TOOL_CATALOG = new ToolCatalog();
