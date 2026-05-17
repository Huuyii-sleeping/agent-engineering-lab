import { describe, expect, it } from "vitest";
import {
  buildCliPaletteCandidates,
  CliPaletteStore,
  searchCliPaletteCandidates,
} from "../../src/cli/palette.js";

describe("cli-palette", () => {
  const context = {
    sessions: [
      { id: "s01-home", messageCount: 3, busy: false, active: true },
      { id: "s02-review", messageCount: 7, busy: true, active: false },
    ],
    helpTopics: ["draft", "sessions", "runtime", "approvals", "transcript", "workflow", "palette", "all"],
    composerActive: false,
    pendingApprovals: 2,
    workflow: "agent",
  } as const;

  it("builds static and dynamic palette candidates", () => {
    const candidates = buildCliPaletteCandidates(context);

    expect(candidates.some((candidate) => candidate.command === "/help draft")).toBe(true);
    expect(candidates.some((candidate) => candidate.command === "/use 2")).toBe(true);
    expect(candidates.some((candidate) => candidate.command === "/approvals")).toBe(true);
    expect(candidates.some((candidate) => candidate.command === "/workflow draw")).toBe(true);
    expect(candidates.some((candidate) => candidate.command === "/architecture")).toBe(true);
    expect(candidates.some((candidate) => candidate.command === "/data")).toBe(true);
  });

  it("fuzzy-searches local palette candidates", () => {
    const view = searchCliPaletteCandidates(context, "review");

    expect(view.query).toBe("review");
    expect(view.total).toBeGreaterThan(0);
    expect(view.candidates[0]?.command).toBe("/use 2");
  });

  it("stores recent palette results per session", () => {
    const store = new CliPaletteStore();
    const homeView = store.search("s01-home", context, "review");
    const reviewView = store.search("s02-review", context, "help");

    expect(store.lastCount("s01-home")).toBe(homeView.candidates.length);
    expect(store.lastCount("s02-review")).toBe(reviewView.candidates.length);
    expect(store.open("s01-home", 1)?.command).toBe(homeView.candidates[0]?.command);
    expect(store.open("s02-review", 1)?.command).toBe(reviewView.candidates[0]?.command);
    expect(store.open("s01-home", 99)).toBeNull();
  });
});
