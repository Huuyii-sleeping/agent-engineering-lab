import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MastraThreadMappingRepository } from "../../../../src/mastra/storage/thread-mapping-repository.js";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("mastra/storage/thread-mapping-repository", () => {
  it("persists resource/thread ownership and rejects rebinding", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-thread-map-"));
    const first = new MastraThreadMappingRepository({ root });
    const mapping = await first.bind({
      ownerId: "owner-1",
      resourceId: "resource-1",
      threadId: "thread-1",
      mastraResourceId: "mastra-resource-1",
      mastraThreadId: "mastra-thread-1",
    });

    await expect(first.bind({
      ownerId: "owner-2",
      resourceId: "resource-2",
      threadId: "thread-1",
      mastraResourceId: "mastra-resource-2",
      mastraThreadId: "mastra-thread-2",
    })).rejects.toMatchObject({ code: "RUNTIME_OWNERSHIP_CONFLICT" });

    await expect(new MastraThreadMappingRepository({ root }).get({
      ownerId: "owner-1",
      resourceId: "resource-1",
      threadId: "thread-1",
    })).resolves.toEqual(mapping);
  });
});
