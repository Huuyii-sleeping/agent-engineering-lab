import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { DeliveryReport } from "./delivery-types.js";

export function getDeliveryReportRoot(): string {
  return path.join(process.cwd(), ".delivery");
}

export function getDeliveryReportPath(): string {
  return path.join(getDeliveryReportRoot(), "delivery_report.json");
}

export async function loadLatestDeliveryReportFromStore(): Promise<DeliveryReport | null> {
  try {
    const raw = await readFile(getDeliveryReportPath(), "utf8");
    return JSON.parse(raw) as DeliveryReport;
  } catch {
    return null;
  }
}

export async function saveDeliveryReport(report: DeliveryReport): Promise<void> {
  await mkdir(getDeliveryReportRoot(), { recursive: true });
  await writeFile(getDeliveryReportPath(), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
