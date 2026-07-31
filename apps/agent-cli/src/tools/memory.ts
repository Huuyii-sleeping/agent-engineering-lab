import type { ChatCompletionTool } from "openai/resources/chat/completions";

/** Mastra MemoryRuntimePort 暴露给 Agent 的稳定 Tool descriptors。 */
export const MEMORY_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "memory_add",
      description: "Append a durable message to the current Mastra Memory thread.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          type: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          thread_id: { type: "string" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_search",
      description: "Search messages in the current Mastra Memory thread.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer" },
          thread_id: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_list",
      description: "List messages in the current Mastra Memory thread.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer" },
          thread_id: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_explain",
      description: "Explain which current-thread Mastra Memory messages match a query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer" },
          thread_id: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_doctor",
      description: "Report the current Mastra Memory thread mapping and message count.",
      parameters: {
        type: "object",
        properties: { thread_id: { type: "string" } },
      },
    },
  },
];
