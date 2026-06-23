import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import type { SkillPackageFile } from "./types.js";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safePackagePath(root: string, file: SkillPackageFile): string {
  const target = resolve(root, file.path);
  const resolvedRoot = resolve(root);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}/`)) {
    throw new Error(`unsafe package path: ${file.path}`);
  }
  return target;
}

export function packageStoragePath(packageRoot: string, skillId: string, version: string): string {
  return join(packageRoot, skillId, version, "package.json");
}

export function packageDirectory(packageRoot: string, skillId: string, version: string): string {
  return dirname(packageStoragePath(packageRoot, skillId, version));
}
