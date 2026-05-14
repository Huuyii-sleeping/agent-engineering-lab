import { analyzeToolOutput } from "../runtime/query-tool-results.js";
import { renderCliError, renderCliEvent, renderCliSection } from "./ui.js";

export async function runCliShellShortcut(
  command: string,
  runToolByName: (name: string, argumentsJson: string) => Promise<string>,
): Promise<string> {
  const trimmed = command.trim();
  if (!trimmed) {
    return renderCliError("missing shell command", "use !<command>");
  }

  const started = renderCliEvent({
    kind: "tool",
    status: "running",
    title: "bash",
    detail: trimmed,
  });
  const output = await runToolByName("bash", JSON.stringify({ command: trimmed }));
  const analyzed = analyzeToolOutput(output);
  const finished = renderCliEvent({
    kind: analyzed.errorCode?.startsWith("SECURITY_") ? "approval" : "tool",
    status: analyzed.ok ? "done" : "failed",
    title: "bash",
    detail: analyzed.summary,
  });

  return [started, finished, renderCliSection("Shell", output)].join("\n");
}
