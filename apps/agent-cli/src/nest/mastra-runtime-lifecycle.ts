import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { MASTRA_RUNTIME_CLEANUP } from "./tokens.js";

@Injectable()
export class MastraRuntimeLifecycle implements OnApplicationShutdown {
  constructor(@Inject(MASTRA_RUNTIME_CLEANUP) private readonly cleanup: () => Promise<void>) {}

  /** Nest 关闭时统一 flush storage 并关闭共享 Mastra instance。 */
  async onApplicationShutdown(): Promise<void> {
    await this.cleanup();
  }
}
