import process from "node:process";

let raw = "";

for await (const chunk of process.stdin) {
  raw += chunk.toString();
}

try {
  const input = JSON.parse(raw || "{}");
  const roundsWithoutTodo = Number(input?.payload?.rounds_without_todo ?? 0);
  if (input?.event === "SessionStart" && Number.isFinite(roundsWithoutTodo) && roundsWithoutTodo >= 3) {
    process.stdout.write(
      JSON.stringify({
        action: "append_message",
        message: "<reminder>请调用 todo 工具更新任务列表并维护进度。</reminder>",
      }),
    );
    process.exit(0);
  }
} catch {
  // fall through
}

process.stdout.write(JSON.stringify({ action: "continue" }));
