import path from "node:path";
import { isLocalPersistenceEnabled } from "../../runtime-config.js";
import { JsonFileRepository } from "./json-file-repository.js";
import { resolveMastraRuntimePaths } from "./paths.js";

export type MastraRunDomain = "agent" | "workflow";

/** 产品 run 与 Mastra 原生 run 的不可变映射。 */
export type MastraRunMapping = {
  domain: MastraRunDomain;
  productRunId: string;
  mastraRunId: string;
  adapterVersion: string;
  createdAt: number;
};

type RunMappingEnvelope = {
  schemaVersion: 1;
  records: Record<string, MastraRunMapping>;
};

function key(domain: MastraRunDomain, productRunId: string): string {
  return `${domain}:${productRunId}`;
}

/** 持久化 product runId 到 Mastra runId 的一对一绑定。 */
export class MastraRunMappingRepository {
  private readonly repository: JsonFileRepository<RunMappingEnvelope>;

  constructor(options: { root?: string; persistenceEnabled?: boolean } = {}) {
    const paths = resolveMastraRuntimePaths(options.root);
    this.repository = new JsonFileRepository(
      path.join(paths.mappingsRoot, "run-mappings.json"),
      () => ({ schemaVersion: 1, records: {} }),
      options.persistenceEnabled ?? isLocalPersistenceEnabled(),
    );
  }

  async bind(input: Omit<MastraRunMapping, "createdAt">): Promise<MastraRunMapping> {
    let mapping: MastraRunMapping | null = null;
    await this.repository.update((envelope) => {
      const recordKey = key(input.domain, input.productRunId);
      const current = envelope.records[recordKey];
      if (current) {
        if (current.mastraRunId !== input.mastraRunId || current.adapterVersion !== input.adapterVersion) {
          throw new Error(`产品运行 ${input.productRunId} 的 Mastra 映射不可变。`);
        }
        mapping = current;
        return;
      }
      mapping = { ...input, createdAt: Date.now() };
      envelope.records[recordKey] = mapping;
    });
    return mapping!;
  }

  async get(domain: MastraRunDomain, productRunId: string): Promise<MastraRunMapping | null> {
    return (await this.repository.read()).records[key(domain, productRunId)] ?? null;
  }

  async list(domain?: MastraRunDomain): Promise<MastraRunMapping[]> {
    return Object.values((await this.repository.read()).records)
      .filter((mapping) => domain === undefined || mapping.domain === domain);
  }

  /** 按 run 删除已超过 retention 的产品/native 映射。 */
  async remove(domain: MastraRunDomain, productRunId: string): Promise<void> {
    await this.repository.update((envelope) => {
      delete envelope.records[key(domain, productRunId)];
    });
  }
}
