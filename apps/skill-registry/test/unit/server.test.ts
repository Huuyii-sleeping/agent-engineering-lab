import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createSkillRegistryHttpServer } from "../../src/server.js";

const tempDirs: string[] = [];

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function listen(server: ReturnType<typeof createSkillRegistryHttpServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("server did not bind to a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function createSeedRegistry(tempDir: string): Promise<{ registryPath: string; packageRaw: string }> {
  const registryPath = join(tempDir, "index.json");
  const packagePath = join(tempDir, "remote-doc.package.json");
  const packageRaw = JSON.stringify({
    files: [
      {
        path: "SKILL.md",
        content: "---\nname: remote-doc\ndescription: Use when testing the registry service.\n---\n\n# Remote Doc\n",
      },
      {
        path: "skill.json",
        content: JSON.stringify({
          id: "remote-doc",
          name: "远端文档 Skill",
          summary: "来自 registry service 的 skill。",
          category: "文档",
          provider: "Registry Service",
          version: "1.0.0",
          runtime: "Skill runtime",
          permissions: ["文档读取"],
          updatedAt: "2026-06-23",
          maturity: "stable",
          tags: ["remote", "docs"],
          entry: "SKILL.md",
        }),
      },
    ],
  });
  await writeFile(packagePath, packageRaw, "utf8");
  await writeFile(
    registryPath,
    JSON.stringify({
      skills: [
        {
          id: "remote-doc",
          version: "1.0.0",
          packageUrl: packagePath,
          packageSha256: sha256Hex(packageRaw),
          source: "official",
          publisher: { id: "agent-lab", name: "Agent Lab", verified: true },
          downloads: 42,
          rating: 4.5,
          metadata: { name: "远端文档 Skill", summary: "来自 registry service 的 skill。", category: "文档" },
        },
      ],
    }),
    "utf8",
  );
  return { registryPath, packageRaw };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("skill registry service", () => {
  it("seeds a registry, lists marketplace metadata, and serves package downloads", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-registry-test-"));
    tempDirs.push(tempDir);
    const { registryPath, packageRaw } = await createSeedRegistry(tempDir);
    const server = createSkillRegistryHttpServer({
      dbPath: join(tempDir, "registry.sqlite"),
      packageRoot: join(tempDir, "packages"),
      seedRegistryUrl: registryPath,
    });
    const baseUrl = await listen(server);

    const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
    expect(health).toMatchObject({ ok: true, skills: 1, versions: 1 });

    const index = await fetch(`${baseUrl}/skills`).then((response) => response.json());
    expect(index).toMatchObject({
      skills: [
        {
          id: "remote-doc",
          source: "official",
          publisher: { id: "agent-lab", name: "Agent Lab", verified: true },
          downloads: 42,
          rating: 4.5,
          packageSha256: sha256Hex(packageRaw),
        },
      ],
    });

    const packageResponse = await fetch(`${baseUrl}/skills/remote-doc/download?version=1.0.0`, { method: "POST" });
    await expect(packageResponse.text()).resolves.toBe(packageRaw);

    const nextIndex = await fetch(`${baseUrl}/skills`).then((response) => response.json());
    expect(nextIndex.skills[0].downloads).toBe(43);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
