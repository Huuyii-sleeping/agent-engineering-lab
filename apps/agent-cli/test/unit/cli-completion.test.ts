import { describe, expect, it } from "vitest";
import { completeCliLine } from "../../src/cli/completion.js";

describe("cli-completion", () => {
  const context = {
    sessions: [
      { id: "s01-home", messageCount: 2, busy: false, active: true },
      { id: "s02-review", messageCount: 1, busy: false, active: false },
    ],
    helpTopics: ["draft", "sessions", "runtime", "approvals", "transcript", "workflow", "all"],
    transcriptEntryCount: 14,
    paletteEntryCount: 3,
    model: "gpt-test",
  } as const;

  it("completes slash commands and help topics", () => {
    const [commandHits] = completeCliLine("/he", context);
    const [architectureHits] = completeCliLine("/ar", context);
    const [helpHits] = completeCliLine("/help t", context);

    expect(commandHits).toContain("/help");
    expect(architectureHits).toContain("/architecture");
    expect(helpHits).toContain("/help transcript");
  });

  it("completes local session selectors and transcript indexes", () => {
    const [useHits] = completeCliLine("/use ", context);
    const [peekHits] = completeCliLine("/peek ", context);

    expect(useHits).toContain("/use latest");
    expect(useHits).toContain("/use 1");
    expect(useHits).toContain("/use s01-home");
    expect(peekHits).toContain("/peek 14");
  });

  it("completes parameterized runtime commands", () => {
    const [permissionHits] = completeCliLine("/permissions ", context);
    const [historyHits] = completeCliLine("/history ", context);
    const [workflowHits] = completeCliLine("/workflow ", context);
    const [searchHits] = completeCliLine("/search ", context);
    const [paletteHits] = completeCliLine("/palette ", context);
    const [promptHits] = completeCliLine("/prompt ", context);

    expect(permissionHits).toContain("/permissions plan");
    expect(historyHits).toContain("/history first");
    expect(historyHits).toContain("/history prev");
    expect(historyHits).toContain("/history next");
    expect(historyHits).toContain("/history last");
    expect(workflowHits).toContain("/workflow draw");
    expect(searchHits).toContain("/search next");
    expect(promptHits).toContain("/prompt dump");
    expect(paletteHits).toContain("/palette review");
    expect(paletteHits).toContain("/palette open 1");
    expect(paletteHits).toContain("/palette workflow");
    expect(paletteHits).toContain("/palette architecture");
  });
});
