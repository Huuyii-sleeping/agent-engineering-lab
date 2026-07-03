import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { DEFAULT_SKILL_REGISTRY_ADMIN_TOKEN } from "./config.js";
import { RegistryStore } from "./registry-store.js";
import type { CreatePublisherInput, PublishSkillInput } from "./types.js";

export type SkillRegistryServerOptions = {
  dbPath: string;
  packageRoot: string;
  seedRegistryUrl?: string;
  adminToken?: string;
};

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function baseUrl(req: IncomingMessage): string {
  const host = req.headers.host ?? "127.0.0.1:3190";
  return `http://${host}`;
}

function routePath(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://127.0.0.1");
}

function bearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

function tokenEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdmin(req: IncomingMessage, res: ServerResponse, adminToken: string): boolean {
  const token = bearerToken(req);
  if (!token) {
    res.setHeader("WWW-Authenticate", "Bearer");
    writeJson(res, 401, { ok: false, error: { code: "ADMIN_AUTH_REQUIRED", message: "admin bearer token is required" } });
    return false;
  }
  if (!tokenEquals(token, adminToken)) {
    writeJson(res, 403, { ok: false, error: { code: "ADMIN_AUTH_FORBIDDEN", message: "admin bearer token is invalid" } });
    return false;
  }
  return true;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? (JSON.parse(raw) as unknown) : {};
}

/** Create the standalone Skill Registry HTTP server. */
export function createSkillRegistryHttpServer(options: SkillRegistryServerOptions): Server {
  const store = new RegistryStore(options);
  const adminToken = options.adminToken || DEFAULT_SKILL_REGISTRY_ADMIN_TOKEN;
  const server = createServer(async (req, res) => {
    const url = routePath(req);
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/health") {
      writeJson(res, 200, store.health());
      return;
    }
    if (method === "GET" && url.pathname === "/skills") {
      writeJson(res, 200, store.listSkills(baseUrl(req)));
      return;
    }
    const versionsMatch = /^\/skills\/([^/]+)\/versions$/.exec(url.pathname);
    if (method === "GET" && versionsMatch) {
      writeJson(res, 200, { versions: store.listVersions(decodeURIComponent(versionsMatch[1] ?? ""), baseUrl(req)) });
      return;
    }
    const downloadMatch = /^\/skills\/([^/]+)\/download$/.exec(url.pathname);
    if (method === "POST" && downloadMatch) {
      const raw = store.downloadPackage(decodeURIComponent(downloadMatch[1] ?? ""), url.searchParams.get("version") ?? undefined);
      if (!raw) {
        writeJson(res, 404, { ok: false, error: { code: "SKILL_NOT_FOUND", message: "skill package was not found" } });
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(raw);
      return;
    }
    const skillMatch = /^\/skills\/([^/]+)$/.exec(url.pathname);
    if (method === "GET" && skillMatch) {
      const skill = store.getSkill(decodeURIComponent(skillMatch[1] ?? ""), baseUrl(req));
      if (!skill) {
        writeJson(res, 404, { ok: false, error: { code: "SKILL_NOT_FOUND", message: "skill was not found" } });
        return;
      }
      writeJson(res, 200, { skill });
      return;
    }
    if (url.pathname.startsWith("/admin/") && !requireAdmin(req, res, adminToken)) {
      return;
    }
    if (method === "GET" && url.pathname === "/admin/publishers") {
      writeJson(res, 200, { ok: true, publishers: store.listPublishers() });
      return;
    }
    if (method === "POST" && url.pathname === "/admin/publishers") {
      const result = store.createPublisher((await readJsonBody(req)) as CreatePublisherInput);
      if (!result.ok) {
        writeJson(res, 400, { ok: false, error: { code: "PUBLISHER_INVALID", message: "publisher is invalid", errors: result.errors } });
        return;
      }
      store.recordAuditEvent("publisher.upsert", "admin-token", result.publisher.id, {
        verified: result.publisher.verified,
      });
      writeJson(res, 201, { ok: true, publisher: result.publisher });
      return;
    }
    if (method === "POST" && url.pathname === "/admin/publish") {
      try {
        const result = store.publishPackage((await readJsonBody(req)) as PublishSkillInput, baseUrl(req));
        if (!result.ok) {
          writeJson(res, 400, { ok: false, error: { code: "SKILL_PACKAGE_INVALID", message: "skill package is invalid", errors: result.errors } });
          return;
        }
        if (!("skill" in result)) {
          writeJson(res, 500, { ok: false, error: { code: "PUBLISH_FAILED", message: "published skill was not returned" } });
          return;
        }
        store.recordAuditEvent("skill.publish", "admin-token", `${result.skill.id}@${result.skill.version}`, {
          source: result.skill.source,
          publisherId: result.skill.publisher.id,
        });
        writeJson(res, 201, { ok: true, skill: result.skill });
      } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: "PUBLISH_FAILED", message: error instanceof Error ? error.message : String(error) } });
      }
      return;
    }
    if (method === "GET" && url.pathname === "/admin/audit-events") {
      writeJson(res, 200, { ok: true, events: store.listAuditEvents(Number(url.searchParams.get("limit") ?? 100)) });
      return;
    }

    writeJson(res, 404, { ok: false, error: { code: "NOT_FOUND", message: url.pathname } });
  });
  server.on("close", () => store.close());
  return server;
}
