import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { resolveSopDataRoot } from "../config.js";
import { SopDatabase } from "./sop-database.js";

const command = process.argv[2] ?? "health";
const argument = process.argv[3] ?? "";
const dataRoot = resolveSopDataRoot();
const databasePath = join(dataRoot, "workflows.sqlite");
const backupRoot = join(dataRoot, "backups");

async function restoreWithoutOpening(fileName: string): Promise<void> {
  if (!fileName || basename(fileName) !== fileName) throw new Error("restore 需要备份目录中的文件名，例如 1710000000000-manual.sqlite");
  await mkdir(dataRoot, { recursive: true });
  const temporary = `${databasePath}.restore-tmp`;
  await copyFile(join(backupRoot, fileName), temporary);
  await rm(`${databasePath}-wal`, { force: true });
  await rm(`${databasePath}-shm`, { force: true });
  await rename(temporary, databasePath);
  const database = new SopDatabase({ sopDataRoot: dataRoot });
  try {
    process.stdout.write(`${JSON.stringify(database.health())}\n`);
  } finally {
    database.onModuleDestroy();
  }
}

if (command === "restore") {
  await restoreWithoutOpening(argument);
} else {
  const database = new SopDatabase({ sopDataRoot: dataRoot });
  try {
    if (command === "backup") {
      const fileName = await database.backup(argument || "manual");
      process.stdout.write(`${fileName}\n`);
    } else if (command === "health") {
      process.stdout.write(`${JSON.stringify(database.health())}\n`);
    } else {
      throw new Error(`未知命令：${command}`);
    }
  } finally {
    database.onModuleDestroy();
  }
}
