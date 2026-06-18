import { describe, expect, it, vi } from "vitest";
import {
  defaultAgentBuilderConfig,
  normalizeAgentBuilderConfig,
  readAgentBuilderConfig,
  toggleAgentBuilderId,
  writeAgentBuilderConfig,
} from "./agent-builder";

describe("agent builder helpers", () => {
  it("falls back to defaults when storage is missing or invalid", () => {
    expect(readAgentBuilderConfig(null)).toEqual(defaultAgentBuilderConfig);
    expect(readAgentBuilderConfig({ getItem: () => "not json", setItem: vi.fn() })).toEqual(defaultAgentBuilderConfig);
  });

  it("normalizes text and removes unknown catalog ids", () => {
    expect(
      normalizeAgentBuilderConfig({
        name: "  研发助手  ",
        scenario: "  review and ship  ",
        selectedSkillIds: ["code-workspace", "unknown", "code-workspace"],
        selectedSopStepIds: ["verify-result", "missing"],
      }),
    ).toEqual({
      name: "研发助手",
      scenario: "review and ship",
      selectedSkillIds: ["code-workspace"],
      selectedSopStepIds: ["verify-result"],
    });
  });

  it("toggles ids while preserving catalog order", () => {
    const orderedIds = ["a", "b", "c"];

    expect(toggleAgentBuilderId(["c"], "a", orderedIds)).toEqual(["a", "c"]);
    expect(toggleAgentBuilderId(["a", "c"], "a", orderedIds)).toEqual(["c"]);
    expect(toggleAgentBuilderId(["a"], "x", orderedIds)).toEqual(["a"]);
  });

  it("persists normalized config as JSON", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };

    writeAgentBuilderConfig(storage, {
      ...defaultAgentBuilderConfig,
      selectedSkillIds: ["code-workspace", "missing"],
    });

    expect(storage.setItem).toHaveBeenCalledWith(
      "agent-web-console-builder-config-v1",
      JSON.stringify({
        ...defaultAgentBuilderConfig,
        selectedSkillIds: ["code-workspace"],
      }),
    );
  });
});
