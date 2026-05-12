import {
  autoExtractMemory,
  buildMemoryInjectionForQuery,
  runMemoryAdd,
  runMemoryList,
  runMemorySearch,
} from "./tools/memory.js";

export type MemoryInjectionResult = {
  content: string | null;
  usedEntries: number;
  estimatedTokens: number;
};

export type MemoryServiceLike = {
  autoExtract(source: string, text: string): Promise<void>;
  buildInjectionForQuery(query: string): Promise<MemoryInjectionResult>;
  runAdd(source: unknown, type: unknown, tags: unknown, content: unknown, confidence: unknown): Promise<string>;
  runSearch(query: unknown, limit?: unknown, layer?: unknown, type?: unknown): Promise<string>;
  runList(layer?: unknown, limit?: unknown): Promise<string>;
};

export class MemoryService implements MemoryServiceLike {
  async autoExtract(source: string, text: string): Promise<void> {
    return autoExtractMemory(source, text);
  }

  async buildInjectionForQuery(query: string): Promise<MemoryInjectionResult> {
    return buildMemoryInjectionForQuery(query);
  }

  async runAdd(
    source: unknown,
    type: unknown,
    tags: unknown,
    content: unknown,
    confidence: unknown,
  ): Promise<string> {
    return runMemoryAdd(source, type, tags, content, confidence);
  }

  async runSearch(query: unknown, limit?: unknown, layer?: unknown, type?: unknown): Promise<string> {
    return runMemorySearch(query, limit, layer, type);
  }

  async runList(layer?: unknown, limit?: unknown): Promise<string> {
    return runMemoryList(layer, limit);
  }
}

export const DEFAULT_MEMORY_SERVICE = new MemoryService();
