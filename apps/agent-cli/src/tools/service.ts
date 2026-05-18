import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { DEFAULT_TOOL_CATALOG, type ToolCatalogLike } from "./catalog.js";
import { DEFAULT_TOOL_EXECUTOR, type ToolExecutorLike } from "./executor.js";
import type { ToolRegistration } from "./protocol.js";

export type ToolServiceLike = {
  listTools(): Promise<ChatCompletionTool[]>;
  listToolRegistrations(): Promise<ToolRegistration[]>;
  listToolMetadata(): Promise<Array<Record<string, string>>>;
  getToolRegistration?(name: string): Promise<ToolRegistration | null>;
  previewToolCall(name: string, argumentsJson: string): string;
  runToolByName(name: string, argumentsJson: string): Promise<string>;
};

export class ToolService implements ToolServiceLike {
  constructor(
    private readonly catalog: ToolCatalogLike = DEFAULT_TOOL_CATALOG,
    private readonly executor: ToolExecutorLike = DEFAULT_TOOL_EXECUTOR,
  ) {}

  async listTools(): Promise<ChatCompletionTool[]> {
    return this.catalog.listTools();
  }

  async listToolRegistrations(): Promise<ToolRegistration[]> {
    return this.catalog.listToolRegistrations();
  }

  async listToolMetadata(): Promise<Array<Record<string, string>>> {
    return this.catalog.listToolMetadata();
  }

  async getToolRegistration(name: string): Promise<ToolRegistration | null> {
    return this.catalog.getToolRegistration
      ? this.catalog.getToolRegistration(name)
      : (await this.catalog.listToolRegistrations()).find((tool) => tool.name === name) ?? null;
  }

  previewToolCall(name: string, argumentsJson: string): string {
    return this.executor.previewToolCall(name, argumentsJson);
  }

  async runToolByName(name: string, argumentsJson: string): Promise<string> {
    return this.executor.runToolByName(name, argumentsJson);
  }
}

export const DEFAULT_TOOL_SERVICE = new ToolService();
