import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { writeSseEvent } from "./http.js";

@Injectable()
export class OrbitShutdownService implements OnApplicationShutdown {
  private readonly sseClients = new Set<ServerResponse>();

  /** 登记 Orbit 产品 SSE；连接自行关闭时立即解除登记。 */
  registerSseClient(res: ServerResponse): () => void {
    this.sseClients.add(res);
    const unregister = () => this.sseClients.delete(res);
    res.once("close", unregister);
    return unregister;
  }

  /** Nest 关闭时通知并结束全部 Orbit SSE，避免 daemon 被长连接阻塞。 */
  closeSseClients(): void {
    for (const res of this.sseClients) {
      if (res.writableEnded || res.destroyed) continue;
      writeSseEvent(res, { event: "shutdown", data: { message: "Server is shutting down" } });
      res.end();
    }
    this.sseClients.clear();
  }

  onApplicationShutdown(): void {
    this.closeSseClients();
  }
}
