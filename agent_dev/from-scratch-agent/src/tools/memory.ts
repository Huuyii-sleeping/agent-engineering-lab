import type { ChatCompletionTool } from "openai/resources/chat/completions";
import {
  autoExtractMemory,
  buildMemoryInjectionForQuery,
  runMemoryAdd,
  runMemoryList,
  runMemorySearch,
} from "../memory/service.js";

export const MEMORY_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "memory_add",
      description: "Add a memory entry into short-term and long-term memory.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string" },
          type: { type: "string", enum: ["fact", "preference", "constraint", "decision", "summary"] },
          tags: { type: "array", items: { type: "string" } },
          content: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_search",
      description: "Search memory entries with keyword and lightweight semantic score.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer" },
          layer: { type: "string", enum: ["short_term", "long_term", "both"] },
          type: { type: "string", enum: ["fact", "preference", "constraint", "decision", "summary"] },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_list",
      description: "List memory entries by layer.",
      parameters: {
        type: "object",
        properties: {
          layer: { type: "string", enum: ["short_term", "long_term", "both"] },
          limit: { type: "integer" },
        },
      },
    },
  },
];

export { autoExtractMemory, buildMemoryInjectionForQuery, runMemoryAdd, runMemoryList, runMemorySearch };
