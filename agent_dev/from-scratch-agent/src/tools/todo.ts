import type { ChatCompletionTool } from "openai/resources/chat/completions";

type TodoStatus = "pending" | "in_progress" | "completed";

type TodoItem = {
  id: string;
  text: string;
  status: TodoStatus;
};

function toTodoError(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } });
}

class TodoManager {
  private items: TodoItem[] = [];

  update(itemsArg: unknown): string {
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
    return TODO.update(items);
  } catch (error) {
    return toTodoError("INVALID_TODO_ITEM", error instanceof Error ? error.message : String(error));
  }
}
