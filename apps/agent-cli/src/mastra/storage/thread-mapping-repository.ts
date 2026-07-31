import path from "node:path";
import { RuntimePortError } from "@orbit/runtime-contracts";
import { isLocalPersistenceEnabled } from "../../runtime-config.js";
import { JsonFileRepository } from "./json-file-repository.js";
import { resolveMastraRuntimePaths } from "./paths.js";

/** Orbit resource/thread 与 Mastra Memory identity 的不可变映射。 */
export type MastraThreadMapping = {
  ownerId: string;
  resourceId: string;
  threadId: string;
  mastraResourceId: string;
  mastraThreadId: string;
  createdAt: number;
};

type ThreadMappingEnvelope = {
  schemaVersion: 1;
  records: Record<string, MastraThreadMapping>;
};

/** 持久化并校验 Orbit Memory ownership 与 Mastra ID。 */
export class MastraThreadMappingRepository {
  private readonly repository: JsonFileRepository<ThreadMappingEnvelope>;

  constructor(options: { root?: string; persistenceEnabled?: boolean } = {}) {
    const paths = resolveMastraRuntimePaths(options.root);
    this.repository = new JsonFileRepository(
      path.join(paths.mappingsRoot, "thread-mappings.json"),
      () => ({ schemaVersion: 1, records: {} }),
      options.persistenceEnabled ?? isLocalPersistenceEnabled(),
    );
  }

  async bind(input: Omit<MastraThreadMapping, "createdAt">): Promise<MastraThreadMapping> {
    let mapping: MastraThreadMapping | null = null;
    await this.repository.update((envelope) => {
      const current = envelope.records[input.threadId];
      if (current) {
        this.assertOwnership(current, input);
        if (
          current.mastraResourceId !== input.mastraResourceId ||
          current.mastraThreadId !== input.mastraThreadId
        ) {
          throw new Error(`Memory thread ${input.threadId} 的 Mastra 映射不可变。`);
        }
        mapping = current;
        return;
      }
      mapping = { ...input, createdAt: Date.now() };
      envelope.records[input.threadId] = mapping;
    });
    return mapping!;
  }

  async get(input: { ownerId: string; resourceId: string; threadId: string }): Promise<MastraThreadMapping | null> {
    const mapping = (await this.repository.read()).records[input.threadId];
    if (!mapping) return null;
    this.assertOwnership(mapping, input);
    return mapping;
  }

  async list(input: { ownerId: string; resourceId: string }): Promise<MastraThreadMapping[]> {
    return Object.values((await this.repository.read()).records).filter(
      (mapping) => mapping.ownerId === input.ownerId && mapping.resourceId === input.resourceId,
    );
  }

  async delete(input: { ownerId: string; resourceId: string; threadId: string }): Promise<void> {
    await this.repository.update((envelope) => {
      const current = envelope.records[input.threadId];
      if (!current) return;
      this.assertOwnership(current, input);
      delete envelope.records[input.threadId];
    });
  }

  private assertOwnership(
    current: MastraThreadMapping,
    input: { ownerId: string; resourceId: string; threadId: string },
  ): void {
    if (current.ownerId !== input.ownerId || current.resourceId !== input.resourceId) {
      throw new RuntimePortError(
        "RUNTIME_OWNERSHIP_CONFLICT",
        `Memory thread ${input.threadId} 已绑定其他 owner/resource。`,
        { threadId: input.threadId },
      );
    }
  }
}
