import { BUILTIN_TOOLS } from "./registry.js";
import { DEFAULT_TOOL_SERVICE } from "./service.js";

export const TOOLS = BUILTIN_TOOLS;

export async function listTools() {
  return DEFAULT_TOOL_SERVICE.listTools();
}

export async function listToolRegistrations() {
  return DEFAULT_TOOL_SERVICE.listToolRegistrations();
}

export async function listToolMetadata() {
  return DEFAULT_TOOL_SERVICE.listToolMetadata();
}

export function previewToolCall(name: string, argumentsJson: string): string {
  return DEFAULT_TOOL_SERVICE.previewToolCall(name, argumentsJson);
}

export async function runToolByName(name: string, argumentsJson: string): Promise<string> {
  return DEFAULT_TOOL_SERVICE.runToolByName(name, argumentsJson);
}
