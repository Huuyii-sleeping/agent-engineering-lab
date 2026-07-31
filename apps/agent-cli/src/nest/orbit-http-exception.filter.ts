import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { writeJson } from "./http.js";

@Catch()
export class OrbitHttpExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const req = context.getRequest<IncomingMessage>();
    const res = context.getResponse<ServerResponse>();
    if (res.headersSent) return;
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    const pathname = req.url ? new URL(req.url, "http://127.0.0.1").pathname : "/";
    if (statusCode === 404) {
      writeJson(res, 404, {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `${req.method ?? "GET"} ${pathname} is not implemented`,
        },
      });
      return;
    }
    writeJson(res, statusCode, {
      ok: false,
      error: {
        code: statusCode >= 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
