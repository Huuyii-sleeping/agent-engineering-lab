import { All, Controller, Next, Req, Res } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { writeJson } from "../http.js";

type NextHandler = () => void;

@Controller()
export class OrbitFallbackController {
  /** Orbit 未知路由在 Mastra catch-all 前收口；内部前缀继续交给 Mastra。 */
  @All("*")
  handle(
    @Req() req: IncomingMessage,
    @Res() res: ServerResponse,
    @Next() next: NextHandler,
  ): void {
    const pathname = req.url ? new URL(req.url, "http://127.0.0.1").pathname : "/";
    if (pathname === "/internal/mastra" || pathname.startsWith("/internal/mastra/")) {
      next();
      return;
    }
    writeJson(res, 404, {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: `${req.method ?? "GET"} ${pathname} is not implemented`,
      },
    });
  }
}
