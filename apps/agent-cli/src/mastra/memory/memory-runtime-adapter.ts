import { randomUUID } from "node:crypto";
import {
  RuntimePortError,
  type AppendMemoryMessagesCommand,
  type CreateMemoryThreadCommand,
  type DeleteMemoryThreadCommand,
  type GetMemoryThreadQuery,
  type ListMemoryMessagesQuery,
  type ListMemoryThreadsQuery,
  type MemoryMessage,
  type MemoryMessagePage,
  type MemoryRuntimePort,
  type MemoryThread,
  type MemoryThreadPage,
} from "@orbit/runtime-contracts";
import type { MastraDBMessage } from "@mastra/core/agent";
import type { StorageThreadType } from "@mastra/core/memory";
import type { Memory } from "@mastra/memory";
import { MastraThreadMappingRepository, type MastraThreadMapping } from "../storage/thread-mapping-repository.js";

type AdapterOptions = {
  root?: string;
  persistenceEnabled?: boolean;
  mappings?: MastraThreadMappingRepository;
};

type OrbitMessageMetadata = {
  role?: MemoryMessage["role"];
  metadata?: Record<string, unknown>;
  content?: MemoryMessage["content"];
};

function cursorOffset(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("cursor 必须是非负整数。");
  return parsed;
}

function pageLimit(value: number | undefined): number {
  return value === undefined ? 20 : Math.max(1, Math.trunc(value));
}

function page<T>(items: T[], cursor: string | undefined, limit: number | undefined): { items: T[]; nextCursor: string | null } {
  const start = cursorOffset(cursor);
  const size = pageLimit(limit);
  return {
    items: items.slice(start, start + size),
    nextCursor: start + size < items.length ? String(start + size) : null,
  };
}

function toThread(thread: StorageThreadType, mapping: MastraThreadMapping): MemoryThread {
  return {
    id: mapping.threadId,
    ownerId: mapping.ownerId,
    resourceId: mapping.resourceId,
    title: thread.title,
    metadata: thread.metadata ?? {},
    createdAt: thread.createdAt.getTime(),
    updatedAt: thread.updatedAt.getTime(),
  };
}

function messageText(content: MemoryMessage["content"]): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function toMastraMessage(
  command: AppendMemoryMessagesCommand,
  mapping: MastraThreadMapping,
  message: AppendMemoryMessagesCommand["messages"][number],
): MastraDBMessage {
  const orbit: OrbitMessageMetadata = {
    role: message.role,
    metadata: message.metadata,
    content: message.content,
  };
  return {
    id: message.id ?? randomUUID(),
    // Mastra Memory recall 只返回对话角色；产品侧 tool/system role 由 orbit 元数据无损还原。
    role: message.role === "tool" || message.role === "system" ? "assistant" : message.role,
    createdAt: new Date(message.createdAt ?? Date.now()),
    threadId: mapping.mastraThreadId,
    resourceId: mapping.mastraResourceId,
    content: {
      format: 2,
      parts: [{ type: "text", text: messageText(message.content) }],
      metadata: { orbit },
    },
  };
}

function orbitMetadata(message: MastraDBMessage): OrbitMessageMetadata {
  const metadata = message.content.metadata;
  if (!metadata || typeof metadata.orbit !== "object" || metadata.orbit === null) return {};
  return metadata.orbit as OrbitMessageMetadata;
}

function textContent(message: MastraDBMessage): string {
  return message.content.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function toMessage(message: MastraDBMessage, mapping: MastraThreadMapping): MemoryMessage {
  const orbit = orbitMetadata(message);
  return {
    id: message.id,
    threadId: mapping.threadId,
    resourceId: mapping.resourceId,
    role: orbit.role ?? (message.role === "signal" ? "system" : message.role),
    content: orbit.content ?? textContent(message),
    createdAt: message.createdAt.getTime(),
    metadata: orbit.metadata ?? {},
  };
}

/** 将 MemoryRuntimePort 映射到共享 Mastra Memory/storage。 */
export class MastraMemoryRuntimeAdapter implements MemoryRuntimePort {
  private readonly mappings: MastraThreadMappingRepository;

  constructor(private readonly memory: Memory, options: AdapterOptions = {}) {
    this.mappings = options.mappings ?? new MastraThreadMappingRepository(options);
  }

  async createThread(command: CreateMemoryThreadCommand): Promise<MemoryThread> {
    const threadId = command.id ?? randomUUID();
    const mapping = await this.mappings.bind({
      ownerId: command.ownerId,
      resourceId: command.resourceId,
      threadId,
      mastraResourceId: command.resourceId,
      mastraThreadId: threadId,
    });
    const existing = await this.memory.getThreadById({
      threadId: mapping.mastraThreadId,
      resourceId: mapping.mastraResourceId,
    });
    const thread = existing ?? await this.memory.createThread({
      threadId: mapping.mastraThreadId,
      resourceId: mapping.mastraResourceId,
      title: command.title,
      metadata: command.metadata ?? {},
    });
    return toThread(thread, mapping);
  }

  async getThread(query: GetMemoryThreadQuery): Promise<MemoryThread | null> {
    const mapping = await this.mappings.get(query);
    if (!mapping) return null;
    const thread = await this.memory.getThreadById({
      threadId: mapping.mastraThreadId,
      resourceId: mapping.mastraResourceId,
    });
    return thread ? toThread(thread, mapping) : null;
  }

  async listThreads(query: ListMemoryThreadsQuery): Promise<MemoryThreadPage> {
    const mappings = await this.mappings.list(query);
    const threads = (await Promise.all(mappings.map(async (mapping) => {
      const thread = await this.memory.getThreadById({
        threadId: mapping.mastraThreadId,
        resourceId: mapping.mastraResourceId,
      });
      return thread ? toThread(thread, mapping) : null;
    }))).filter((thread): thread is MemoryThread => thread !== null)
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    return page(threads, query.cursor, query.limit);
  }

  async deleteThread(command: DeleteMemoryThreadCommand): Promise<void> {
    const mapping = await this.mappings.get(command);
    if (!mapping) return;
    await this.memory.deleteThread(mapping.mastraThreadId);
    await this.mappings.delete(command);
  }

  async listMessages(query: ListMemoryMessagesQuery): Promise<MemoryMessagePage> {
    const mapping = await this.mappings.get(query);
    if (!mapping) throw new RuntimePortError("RUNTIME_NOT_FOUND", `Memory thread ${query.threadId} 不存在。`);
    const recalled = await this.memory.recall({
      threadId: mapping.mastraThreadId,
      resourceId: mapping.mastraResourceId,
      perPage: false,
      orderBy: { field: "createdAt", direction: "ASC" },
    });
    return page(recalled.messages.map((message) => toMessage(message, mapping)), query.cursor, query.limit);
  }

  async appendMessages(command: AppendMemoryMessagesCommand): Promise<void> {
    const mapping = await this.mappings.get(command);
    if (!mapping) throw new RuntimePortError("RUNTIME_NOT_FOUND", `Memory thread ${command.threadId} 不存在。`);
    await this.memory.saveMessages({
      messages: command.messages.map((message) => toMastraMessage(command, mapping, message)),
    });
  }
}
