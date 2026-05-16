import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import {
  replaceTrackedWorkspaceFindings,
  reportSecretScan,
  scanTextForSecrets,
} from "../security/secret-scanning.js";
import { isWorkspacePathAllowed, listWorkspaceRoots, resolveWorkspacePath } from "../workspace-roots.js";

type FileToolErrorCode =
  | "PATH_OUT_OF_BOUNDS"
  | "FILE_NOT_FOUND"
  | "INVALID_ARGUMENT"
  | "TEXT_NOT_FOUND"
  | "IO_ERROR";

function toFileToolError(code: FileToolErrorCode, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } });
}

function normalizeLimit(limit?: unknown): number {
  if (limit === undefined || limit === null) {
    return RUNTIME_CONFIG.fileReadDefaultLimit;
  }
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return RUNTIME_CONFIG.fileReadDefaultLimit;
  }
  return Math.floor(parsed);
}

function truncateContent(content: string, limit: number): string {
  if (content.length <= limit) {
    return content;
  }
  return `${content.slice(0, limit)}\n...[truncated to ${limit} chars]`;
}

const SENSITIVE_WRITE_SEGMENTS = new Set([
  ".git",
  ".sessions",
  ".transcripts",
  ".memory",
  ".observability",
  ".security",
  ".audit",
]);

function isSensitiveWriteTarget(candidate: string): boolean {
  return listWorkspaceRoots().some((root) => {
    const canonicalRoot = resolveWorkspacePath(root);
    const relative = path.relative(canonicalRoot, candidate);
    if (relative !== "" && (relative.startsWith("..") || path.isAbsolute(relative))) {
      return false;
    }
    return relative
      .split(path.sep)
      .filter((segment) => segment.length > 0)
      .some((segment) => SENSITIVE_WRITE_SEGMENTS.has(segment));
  });
}

export function safePath(inputPath: string, options: { forWrite?: boolean } = {}): string {
  const resolved = resolveWorkspacePath(inputPath);
  if (!isWorkspacePathAllowed(resolved)) {
    throw new Error("PATH_OUT_OF_BOUNDS");
  }
  if (options.forWrite && isSensitiveWriteTarget(resolved)) {
    throw new Error("PATH_OUT_OF_BOUNDS");
  }
  return resolved;
}

export async function runReadFile(pathArg: unknown, limitArg?: unknown): Promise<string> {
  if (typeof pathArg !== "string" || !pathArg.trim()) {
    return toFileToolError("INVALID_ARGUMENT", "read_file 需要有效的 path 字符串");
  }

  let target = "";
  try {
    target = safePath(pathArg);
  } catch {
    return toFileToolError("PATH_OUT_OF_BOUNDS", "路径越界，已拒绝访问");
  }

  try {
    const content = await readFile(target, "utf8");
    return truncateContent(content, normalizeLimit(limitArg));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return toFileToolError("FILE_NOT_FOUND", `文件不存在: ${pathArg}`);
    }
    return toFileToolError("IO_ERROR", `读取文件失败: ${pathArg}`);
  }
}

export async function runWriteFile(pathArg: unknown, contentArg: unknown): Promise<string> {
  if (typeof pathArg !== "string" || !pathArg.trim()) {
    return toFileToolError("INVALID_ARGUMENT", "write_file 需要有效的 path 字符串");
  }
  if (typeof contentArg !== "string") {
    return toFileToolError("INVALID_ARGUMENT", "write_file 需要 content 字符串");
  }

  let target = "";
  try {
    target = safePath(pathArg, { forWrite: true });
  } catch {
    return toFileToolError("PATH_OUT_OF_BOUNDS", "路径越界，已拒绝访问");
  }

  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contentArg, "utf8");
    const scan = scanTextForSecrets({
      content: contentArg,
      sourceKind: "workspace_write",
      targetPath: pathArg,
    });
    if (scan.action === "block") {
      await rm(target, { force: true }).catch(() => {});
      await replaceTrackedWorkspaceFindings(pathArg, []);
      await reportSecretScan({
        sourceKind: "workspace_write",
        action: scan.action,
        findings: scan.findings,
        targetPath: pathArg,
        rolledBack: true,
      });
      return JSON.stringify({
        ok: false,
        error: {
          code: "SECURITY_SECRET_DETECTED",
          message: "workspace write rolled back by secret scanning",
        },
      });
    }
    if (scan.action) {
      await replaceTrackedWorkspaceFindings(pathArg, scan.findings);
      await reportSecretScan({
        sourceKind: "workspace_write",
        action: scan.action,
        findings: scan.findings,
        targetPath: pathArg,
      });
      if (scan.action === "warn") {
        return `OK: 已写入 ${pathArg} [security warning: secret-like content retained under audit]`;
      }
      return `OK: 已写入 ${pathArg} [security audit recorded]`;
    }
    await replaceTrackedWorkspaceFindings(pathArg, []);
    return `OK: 已写入 ${pathArg}`;
  } catch {
    return toFileToolError("IO_ERROR", `写入文件失败: ${pathArg}`);
  }
}

export async function runEditFile(
  pathArg: unknown,
  oldTextArg: unknown,
  newTextArg: unknown,
): Promise<string> {
  if (typeof pathArg !== "string" || !pathArg.trim()) {
    return toFileToolError("INVALID_ARGUMENT", "edit_file 需要有效的 path 字符串");
  }
  if (typeof oldTextArg !== "string" || typeof newTextArg !== "string") {
    return toFileToolError("INVALID_ARGUMENT", "edit_file 需要 old_text 与 new_text 字符串");
  }
  if (!oldTextArg) {
    return toFileToolError("INVALID_ARGUMENT", "edit_file 的 old_text 不能为空");
  }

  let target = "";
  try {
    target = safePath(pathArg, { forWrite: true });
  } catch {
    return toFileToolError("PATH_OUT_OF_BOUNDS", "路径越界，已拒绝访问");
  }

  try {
    const original = await readFile(target, "utf8");
    const index = original.indexOf(oldTextArg);
    if (index < 0) {
      return toFileToolError("TEXT_NOT_FOUND", "未找到 old_text 的精确匹配，未执行修改");
    }
    const updated = `${original.slice(0, index)}${newTextArg}${original.slice(index + oldTextArg.length)}`;
    await writeFile(target, updated, "utf8");
    const scan = scanTextForSecrets({
      content: updated,
      sourceKind: "workspace_write",
      targetPath: pathArg,
    });
    if (scan.action === "block") {
      await writeFile(target, original, "utf8");
      await replaceTrackedWorkspaceFindings(pathArg, []);
      await reportSecretScan({
        sourceKind: "workspace_write",
        action: scan.action,
        findings: scan.findings,
        targetPath: pathArg,
        rolledBack: true,
      });
      return JSON.stringify({
        ok: false,
        error: {
          code: "SECURITY_SECRET_DETECTED",
          message: "workspace edit rolled back by secret scanning",
        },
      });
    }
    if (scan.action) {
      await replaceTrackedWorkspaceFindings(pathArg, scan.findings);
      await reportSecretScan({
        sourceKind: "workspace_write",
        action: scan.action,
        findings: scan.findings,
        targetPath: pathArg,
      });
      if (scan.action === "warn") {
        return `OK: 已编辑 ${pathArg} [security warning: secret-like content retained under audit]`;
      }
      return `OK: 已编辑 ${pathArg} [security audit recorded]`;
    }
    await replaceTrackedWorkspaceFindings(pathArg, []);
    return `OK: 已编辑 ${pathArg}`;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return toFileToolError("FILE_NOT_FOUND", `文件不存在: ${pathArg}`);
    }
    return toFileToolError("IO_ERROR", `编辑文件失败: ${pathArg}`);
  }
}

export const FILE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取工作区内文件内容，可选限制返回长度。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          limit: { type: "integer" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "覆盖写入工作区内文件内容。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "在工作区内文件中替换首个精确匹配片段。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_text: { type: "string" },
          new_text: { type: "string" },
        },
        required: ["path", "old_text", "new_text"],
      },
    },
  },
];
