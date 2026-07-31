import type { MastraCompositeStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";

export const ORBIT_MASTRA_MEMORY_KEY = "orbit-message-history";

/** 首轮 Memory 只启用会话消息历史；高级检索能力必须独立验收后开启。 */
export const ORBIT_MASTRA_MEMORY_OPTIONS = {
  lastMessages: 20,
  semanticRecall: false,
  workingMemory: { enabled: false },
  observationalMemory: false,
} as const;

/** 使用共享 Mastra storage 创建唯一的 Orbit message-history Memory。 */
export function createOrbitMastraMemory(storage: MastraCompositeStore): Memory {
  return new Memory({
    storage,
    vector: false,
    options: ORBIT_MASTRA_MEMORY_OPTIONS,
  });
}
