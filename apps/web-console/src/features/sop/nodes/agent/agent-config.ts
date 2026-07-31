import type { AgentNodeConfig, AgentVersion } from "@orbit/workflow-core";

/** 将 catalog 版本原子写入 Agent 节点，output schema 不允许独立改写。 */
export function applyAgentVersion(config: AgentNodeConfig, version: AgentVersion): AgentNodeConfig {
  return {
    ...config,
    agentProfileId: version.agentProfileId,
    agentVersionId: version.id,
    outputSchema: structuredClone(version.outputSchema),
  };
}

/** 使用稳定、不冲突的名称新增一个任意类型输入绑定。 */
export function addAgentInputBinding(config: AgentNodeConfig): AgentNodeConfig {
  let index = 1;
  let name = "input";
  while (name in config.inputBindings) {
    index += 1;
    name = `input${index}`;
  }
  return {
    ...config,
    inputBindings: { ...config.inputBindings, [name]: { kind: "literal", value: "" } },
  };
}

/** 重命名输入绑定；空名称或重名不会覆盖已有绑定。 */
export function renameAgentInputBinding(config: AgentNodeConfig, currentName: string, nextName: string): AgentNodeConfig {
  const normalized = nextName.trim().slice(0, 80);
  if (!normalized || normalized === currentName || normalized in config.inputBindings) return config;
  return {
    ...config,
    inputBindings: Object.fromEntries(
      Object.entries(config.inputBindings).map(([name, value]) => [name === currentName ? normalized : name, value]),
    ),
  };
}

/** 删除一个 Agent 输入绑定。 */
export function removeAgentInputBinding(config: AgentNodeConfig, name: string): AgentNodeConfig {
  return {
    ...config,
    inputBindings: Object.fromEntries(Object.entries(config.inputBindings).filter(([candidate]) => candidate !== name)),
  };
}
