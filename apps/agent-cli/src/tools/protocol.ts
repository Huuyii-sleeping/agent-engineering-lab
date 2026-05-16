import type { ChatCompletionTool } from "openai/resources/chat/completions";

export type ToolRegistrationTarget = "base" | "subagent" | "mcp";

export type ToolRegistration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  target: ToolRegistrationTarget;
  allowDuringReplay: boolean;
  serverName?: string;
  remoteName?: string;
  trust?: "trusted" | "untrusted";
  provenance?: string;
  credentialMode?: "none" | "configured";
};

type FunctionTool = Extract<ChatCompletionTool, { type: "function" }>;

export function isFunctionTool(tool: ChatCompletionTool): tool is FunctionTool {
  return tool.type === "function";
}

export function toChatCompletionTool(registration: ToolRegistration): ChatCompletionTool {
  const description =
    registration.target === "mcp"
      ? `[mcp:${registration.serverName ?? "unknown"}] ${registration.description || registration.remoteName || registration.name}`
      : registration.description;
  return {
    type: "function",
    function: {
      name: registration.name,
      description,
      parameters: registration.parameters,
    },
  };
}

export function toToolMetadata(registration: ToolRegistration): Record<string, string> {
  const metadata: Record<string, string> = {
    name: registration.name,
    description: registration.description,
    target: registration.target,
    replaySafe: registration.allowDuringReplay ? "true" : "false",
  };
  if (registration.serverName) {
    metadata.serverName = registration.serverName;
  }
  if (registration.remoteName) {
    metadata.remoteName = registration.remoteName;
  }
  if (registration.trust) {
    metadata.trust = registration.trust;
  }
  if (registration.provenance) {
    metadata.provenance = registration.provenance;
  }
  if (registration.credentialMode) {
    metadata.credentialMode = registration.credentialMode;
  }
  return metadata;
}
