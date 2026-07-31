import { describe, expect, it } from "vitest";
import { builtinNodeRegistry, type AgentVersion } from "@orbit/workflow-core";
import { addAgentInputBinding, applyAgentVersion, removeAgentInputBinding, renameAgentInputBinding } from "./agent-config";

const version: AgentVersion = {
  id: "version-7",
  agentProfileId: "profile-3",
  version: 7,
  contentHash: "a".repeat(64),
  name: "发布 Agent",
  description: "",
  instructions: ["执行任务。"],
  toolPolicy: { allowedToolIds: [] },
  skillPolicy: { bindings: [] },
  outputSchema: { type: "object", properties: { text: { type: "string" } } },
  createdBy: "tester",
  releaseNotes: "",
  createdAt: 1,
};

describe("agent-config", () => {
  it("选择版本时原子固定 identity 和 output schema", () => {
    const config = builtinNodeRegistry.get("agent")!.createDefaultConfig();
    expect(applyAgentVersion(config, version)).toMatchObject({
      agentProfileId: "profile-3",
      agentVersionId: "version-7",
      outputSchema: version.outputSchema,
      memory: { isolation: "node-run", shareThread: false },
    });
  });

  it("稳定增删改输入绑定且不覆盖重名键", () => {
    const config = builtinNodeRegistry.get("agent")!.createDefaultConfig();
    const first = addAgentInputBinding(config);
    const second = addAgentInputBinding(first);
    expect(Object.keys(second.inputBindings)).toEqual(["input", "input2"]);
    expect(renameAgentInputBinding(second, "input2", "prompt").inputBindings).toHaveProperty("prompt");
    expect(renameAgentInputBinding(second, "input2", "input")).toEqual(second);
    expect(removeAgentInputBinding(second, "input").inputBindings).not.toHaveProperty("input");
  });
});
