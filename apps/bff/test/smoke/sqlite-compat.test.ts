import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("better-sqlite3 compatibility", () => {
  it("在当前 Node 平台完成内存库事务读写", () => {
    const database = new Database(":memory:");
    try {
      database.exec("create table workflow_health (value text not null)");
      database.transaction((value: string) => {
        database.prepare("insert into workflow_health values (?)").run(value);
      })("ok");
      expect(database.prepare("select value from workflow_health").get()).toEqual({ value: "ok" });
    } finally {
      database.close();
    }
  });
});
