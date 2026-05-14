export type CliWorkflowMode = "agent" | "draw";

export const CLI_WORKFLOW_MODES = ["agent", "draw"] as const satisfies readonly CliWorkflowMode[];

export function isCliWorkflowMode(value: string | null | undefined): value is CliWorkflowMode {
  return value === "agent" || value === "draw";
}

export function getCliWorkflowLabel(mode: CliWorkflowMode): string {
  return mode === "draw" ? "draw" : "agent";
}
