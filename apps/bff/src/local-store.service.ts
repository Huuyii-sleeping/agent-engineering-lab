import { Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type LocalStoreOptions = {
  filePath?: string;
};

const defaultStorePath = join(process.cwd(), ".data", "bff-business-state.json");

type StoreDocument = Record<string, unknown>;

@Injectable()
export class LocalStoreService {
  private readonly filePath: string;

  constructor(options: LocalStoreOptions = {}) {
    this.filePath = options.filePath ?? defaultStorePath;
  }

  async readSection<T>(key: string, fallback: T): Promise<T> {
    const document = await this.readDocument();
    return document[key] === undefined ? fallback : (document[key] as T);
  }

  async writeSection<T>(key: string, value: T): Promise<T> {
    const document = await this.readDocument();
    document[key] = value;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(document, null, 2), "utf8");
    return value;
  }

  private async readDocument(): Promise<StoreDocument> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as StoreDocument) : {};
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }
}
