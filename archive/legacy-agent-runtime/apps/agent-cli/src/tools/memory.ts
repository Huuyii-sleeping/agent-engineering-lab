import type { ChatCompletionTool } from "openai/resources/chat/completions";
import {
  autoExtractMemory,
  buildMemoryInjectionForQuery,
  runAgentMemorySnapshot,
  runMemoryAdd,
  runMemoryDoctor,
  runMemoryExplain,
  runMemoryList,
  runMemoryMigrateJsonl,
  runMemoryRebuildIndex,
  runMemorySearch,
  runMemorySessionSummarize,
  runTeamMemorySync,
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
          layer: { type: "string", enum: ["short_term", "long_term", "durable", "both"] },
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
          layer: { type: "string", enum: ["short_term", "long_term", "durable", "both"] },
          limit: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_explain",
      description: "Explain why memory entries match and would be injected, including provenance and reserved gaps.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "integer" },
          layer: { type: "string", enum: ["short_term", "long_term", "durable", "both"] },
          type: { type: "string", enum: ["fact", "preference", "constraint", "decision", "summary"] },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_doctor",
      description: "Report memory scopes, local paths, topic counts, and explicitly reserved gaps.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_rebuild_index",
      description: "Rebuild durable memory metadata index from markdown topic files.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_memory_snapshot",
      description: "Inspect or initialize an agent memory directory from a local snapshot.",
      parameters: {
        type: "object",
        properties: {
          agent_type: { type: "string" },
          scope: { type: "string", enum: ["user", "project", "local"] },
          action: { type: "string", enum: ["status", "initialize", "mark_synced"] },
        },
        required: ["agent_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_migrate_jsonl",
      description: "Dry-run or apply migration from long_term.jsonl into durable markdown memory topics.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["dry-run", "apply"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "team_memory_sync",
      description: "Push, pull, or inspect local team memory at .agent/team-memory/MEMORY.md; remote sync remains reserved.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["status", "pull", "push"] },
          content: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_session_summarize",
      description: "Write an explicit session memory summary for later compaction reuse.",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string" },
          summary: { type: "string" },
        },
        required: ["session_id", "summary"],
      },
    },
  },
];

export {
  autoExtractMemory,
  buildMemoryInjectionForQuery,
  runAgentMemorySnapshot,
  runMemoryAdd,
  runMemoryDoctor,
  runMemoryExplain,
  runMemoryList,
  runMemoryMigrateJsonl,
  runMemoryRebuildIndex,
  runMemorySearch,
  runMemorySessionSummarize,
  runTeamMemorySync,
};
