import { access, constants, stat } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";

let extraWorkspaceRoots = new Set<string>();

function normalizeRoot(root: string): string {
  return path.resolve(process.cwd(), root);
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function listWorkspaceRoots(): string[] {
  return [process.cwd(), ...[...extraWorkspaceRoots].sort((a, b) => a.localeCompare(b))];
}

export function isWorkspacePathAllowed(candidate: string): boolean {
  const resolved = path.resolve(process.cwd(), candidate);
  return listWorkspaceRoots().some((root) => isWithinRoot(resolved, root));
}

export async function addWorkspaceRoot(rootArg: string): Promise<{ ok: true; root: string } | { ok: false; error: string }> {
  const raw = String(rootArg ?? "").trim();
  if (!raw) {
    return { ok: false, error: "workspace root is required" };
  }

  const resolved = normalizeRoot(raw);
  try {
    const info = await stat(resolved);
    if (!info.isDirectory()) {
      return { ok: false, error: `not a directory: ${raw}` };
    }
    await access(resolved, constants.R_OK);
  } catch {
    return { ok: false, error: `workspace root is not readable: ${raw}` };
  }

  extraWorkspaceRoots.add(resolved);
  return { ok: true, root: resolved };
}

export function resetWorkspaceRootsForTest(): void {
  extraWorkspaceRoots = new Set<string>();
}
