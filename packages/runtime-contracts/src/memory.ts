/** Memory resource/thread 的稳定所有权身份。 */
export type MemoryOwnership = {
  ownerId: string;
  resourceId: string;
};

/** Agent 对话和 Memory API 共享的 thread。 */
export type MemoryThread = MemoryOwnership & {
  id: string;
  title?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

/** Memory thread 中的规范化消息。 */
export type MemoryMessage = {
  id: string;
  threadId: string;
  resourceId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<Record<string, unknown>>;
  createdAt: number;
  metadata: Record<string, unknown>;
};

/** 创建一个归属于 resource 的 Memory thread。 */
export type CreateMemoryThreadCommand = MemoryOwnership & {
  id?: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

/** 查询单个 Memory thread。 */
export type GetMemoryThreadQuery = MemoryOwnership & {
  threadId: string;
};

/** 分页查询某 resource 的 Memory thread。 */
export type ListMemoryThreadsQuery = MemoryOwnership & {
  cursor?: string;
  limit?: number;
};

/** 删除一个 Memory thread。 */
export type DeleteMemoryThreadCommand = GetMemoryThreadQuery;

/** 分页查询 thread 消息。 */
export type ListMemoryMessagesQuery = GetMemoryThreadQuery & {
  cursor?: string;
  limit?: number;
};

/** 向 thread 追加消息。 */
export type AppendMemoryMessagesCommand = GetMemoryThreadQuery & {
  messages: Array<Omit<MemoryMessage, "id" | "threadId" | "resourceId" | "createdAt"> & {
    id?: string;
    createdAt?: number;
  }>;
};

/** Memory thread 分页结果。 */
export type MemoryThreadPage = {
  items: MemoryThread[];
  nextCursor: string | null;
};

/** Memory message 分页结果。 */
export type MemoryMessagePage = {
  items: MemoryMessage[];
  nextCursor: string | null;
};

/** Memory thread/message 的统一数据访问端口。 */
export interface MemoryRuntimePort {
  createThread(command: CreateMemoryThreadCommand): Promise<MemoryThread>;
  getThread(query: GetMemoryThreadQuery): Promise<MemoryThread | null>;
  listThreads(query: ListMemoryThreadsQuery): Promise<MemoryThreadPage>;
  deleteThread(command: DeleteMemoryThreadCommand): Promise<void>;
  listMessages(query: ListMemoryMessagesQuery): Promise<MemoryMessagePage>;
  appendMessages(command: AppendMemoryMessagesCommand): Promise<void>;
}
