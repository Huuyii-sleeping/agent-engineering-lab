import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { nowTimestampMs, parseTimestampMs } from "../time.js";

type TodoStatus = "pending" | "in_progress" | "completed";

type TodoItem = {
  id: string;
  text: string;
  status: TodoStatus;
};

type TodoSnapshot = {
  schemaVersion: number;
  updatedAt: number;
  items: TodoItem[];
};

function toTodoError(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } });
}

class TodoManager {
  private items: TodoItem[] = [];
  private readonly filePath = path.join(process.cwd(), ".runtime", "todos.json");
  private initPromise: Promise<void> | null = null;

  private async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        const snapshot = await this.readSnapshot();
        this.items = snapshot.items;
      })();
    }
    await this.initPromise;
  }

  private async readSnapshot(): Promise<TodoSnapshot> {
    const raw = await readFile(this.filePath, "utf8").catch(() => "");
    if (!raw.trim()) {
      return { schemaVersion: 1, updatedAt: nowTimestampMs(), items: [] };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<TodoSnapshot>;
      const items = Array.isArray(parsed.items)
        ? parsed.items
            .map((item) => {
              const rec = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
              const id = String(rec.id ?? "").trim();
              const text = String(rec.text ?? "").trim();
              const status = String(rec.status ?? "").toLowerCase();
              if (!id || !text) {
                return null;
              }
              if (status !== "pending" && status !== "in_progress" && status !== "completed") {
                return null;
              }
              return { id, text, status: status as TodoStatus };
            })
            .filter((item): item is TodoItem => Boolean(item))
        : [];
      return {
        schemaVersion: 1,
        updatedAt: parseTimestampMs(parsed.updatedAt, nowTimestampMs()),
        items,
      };
    } catch {
      return { schemaVersion: 1, updatedAt: nowTimestampMs(), items: [] };
    }
  }

  private async saveSnapshot(): Promise<void> {
    const snapshot: TodoSnapshot = {
      schemaVersion: 1,
      updatedAt: nowTimestampMs(),
      items: this.items,
    };
    await writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }

  async update(itemsArg: unknown): Promise<string> {
    await this.ensureInit();
    if (!Array.isArray(itemsArg)) {
      return toTodoError("INVALID_ARGUMENT", "todo 需要 items 数组");
    }
    if (itemsArg.length > 20) {
      return toTodoError("MAX_ITEMS_EXCEEDED", "todo 最多允许 20 条任务");
    }

    const validated: TodoItem[] = [];
    let inProgressCount = 0;

    itemsArg.forEach((raw, index) => {
      const rec = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      const id = String(rec.id ?? String(index + 1));
      const text = String(rec.text ?? "").trim();
      const status = String(rec.status ?? "pending").toLowerCase();

      if (!text) {
        throw new Error(`Item ${id}: text required`);
      }
      if (status !== "pending" && status !== "in_progress" && status !== "completed") {
        throw new Error(`Item ${id}: invalid status '${status}'`);
      }
      if (status === "in_progress") {
        inProgressCount += 1;
      }
      validated.push({ id, text, status: status as TodoStatus });
    });

    if (inProgressCount > 1) {
      return toTodoError("MULTIPLE_IN_PROGRESS", "同一时间最多 1 条 in_progress 任务");
    }

    this.items = validated;
    await this.saveSnapshot();
    return this.render();
  }

  private render(): string {
    if (this.items.length === 0) {
      return "No todos.";
    }
    const lines: string[] = [];
    for (const item of this.items) {
      const marker = item.status === "pending" ? "[ ]" : item.status === "in_progress" ? "[>]" : "[x]";
      lines.push(`${marker} #${item.id}: ${item.text}`);
    }
    const done = this.items.filter((item) => item.status === "completed").length;
    lines.push(`\n(${done}/${this.items.length} completed)`);
    return lines.join("\n");
  }
}

const TODO = new TodoManager();

export const TODO_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "todo",
      description: "更新任务列表，追踪多步骤任务进度。",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                text: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "completed"] },
              },
              required: ["id", "text", "status"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
];

export async function runTodo(items: unknown): Promise<string> {
  try {
    return await TODO.update(items);
  } catch (error) {
    return toTodoError("INVALID_TODO_ITEM", error instanceof Error ? error.message : String(error));
  }
}
