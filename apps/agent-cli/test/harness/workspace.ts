import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";

export type HarnessWorkspaceFiles = Record<string, string | Buffer>;

export type HarnessWorkspaceOptions = {
  name?: string;
  files?: HarnessWorkspaceFiles;
  env?: Record<string, string | null | undefined>;
};

export type HarnessWorkspace = {
  root: string;
  path(relativePath: string): string;
  exists(relativePath: string): Promise<boolean>;
  readText(relativePath: string): Promise<string>;
  writeText(relativePath: string, content: string): Promise<void>;
};

function resolveInside(root: string, relativePath: string): string {
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`workspace path escapes root: ${relativePath}`);
  }
  return target;
}

async function writeWorkspaceFile(root: string, relativePath: string, content: string | Buffer): Promise<void> {
  const target = resolveInside(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

function applyEnv(env: Record<string, string | null | undefined> | undefined): Map<string, string | undefined> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env ?? {})) {
    previous.set(key, process.env[key]);
    if (value === null || value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return previous;
}

function restoreEnv(previous: Map<string, string | undefined>): void {
  for (const [key, value] of previous) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export async function withHarnessWorkspace<T>(
  options: HarnessWorkspaceOptions,
  run: (workspace: HarnessWorkspace) => Promise<T> | T,
): Promise<T> {
  const previousCwd = process.cwd();
  const previousEnv = applyEnv(options.env);
  const createdRoot = await mkdtemp(path.join(tmpdir(), `${options.name ?? "agent-cli-harness"}-`));
  const root = await realpath(createdRoot);
  const workspace: HarnessWorkspace = {
    root,
    path: (relativePath) => resolveInside(root, relativePath),
    exists: (relativePath) =>
      access(resolveInside(root, relativePath)).then(
        () => true,
        () => false,
      ),
    readText: (relativePath) => readFile(resolveInside(root, relativePath), "utf8"),
    writeText: (relativePath, content) => writeWorkspaceFile(root, relativePath, content),
  };

  try {
    for (const [relativePath, content] of Object.entries(options.files ?? {})) {
      await writeWorkspaceFile(root, relativePath, content);
    }
    process.chdir(root);
    return await run(workspace);
  } finally {
    process.chdir(previousCwd);
    restoreEnv(previousEnv);
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}
