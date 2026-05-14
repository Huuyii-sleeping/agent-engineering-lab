import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDeliveryReportPath,
  getDeliveryReportRoot,
  loadLatestDeliveryReportFromStore,
  saveDeliveryReport,
} from "../../src/delivery/report-store.js";
import type { DeliveryReport } from "../../src/delivery/types.js";

const tempDirs: string[] = [];

async function createWorkspace(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `${name}-`));
  tempDirs.push(dir);
  return dir;
}

function createReport(): DeliveryReport {
  return {
    schemaVersion: 1,
    generatedAt: 1,
    mode: "manual",
    changedPaths: ["apps/agent-cli/src/delivery/index.ts"],
    summary: {
      status: "passed",
      totalStages: 1,
      passedStages: 1,
      failedStages: 0,
      skippedStages: 0,
    },
    stages: [],
    latestFailure: null,
    risks: [],
    suggestions: ["Validation passed. Delivery report is ready for review or archive."],
  };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

describe("delivery report store", () => {
  it("returns null when no report has been persisted", async () => {
    const workspace = await createWorkspace("delivery-store-empty");
    const previousCwd = process.cwd();
    try {
      process.chdir(workspace);

      expect(getDeliveryReportRoot()).toBe(path.join(process.cwd(), ".delivery"));
      expect(getDeliveryReportPath()).toBe(path.join(process.cwd(), ".delivery", "delivery_report.json"));
      await expect(loadLatestDeliveryReportFromStore()).resolves.toBeNull();
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("saves and loads the latest report without changing JSON shape", async () => {
    const workspace = await createWorkspace("delivery-store-save");
    const previousCwd = process.cwd();
    try {
      process.chdir(workspace);
      const report = createReport();

      await saveDeliveryReport(report);

      await expect(loadLatestDeliveryReportFromStore()).resolves.toEqual(report);
      const raw = await readFile(path.join(workspace, ".delivery", "delivery_report.json"), "utf8");
      expect(JSON.parse(raw)).toEqual(report);
      expect(raw.endsWith("\n")).toBe(true);
    } finally {
      process.chdir(previousCwd);
    }
  });
});
