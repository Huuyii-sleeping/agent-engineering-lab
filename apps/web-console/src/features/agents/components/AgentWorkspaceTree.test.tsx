import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultAgentProfileInput, type AgentProfile } from "../../../api";
import { AgentWorkspaceTree } from "./AgentWorkspaceTree";

const agent: AgentProfile = {
  id: "agent-1",
  ...defaultAgentProfileInput,
  name: "交付 Agent",
  createdAt: 1,
  updatedAt: 2,
};

describe("AgentWorkspaceTree", () => {
  it("renders workspace tree entries and saved agent drafts", () => {
    const html = renderToStaticMarkup(
      <AgentWorkspaceTree
        activeAgentId="agent-1"
        activeView="agent-config"
        agents={[agent]}
        downloadedSkillCount={2}
        saving={false}
        onCreateAgent={vi.fn()}
        onOpenAgent={vi.fn()}
        onOpenBuilder={vi.fn()}
        onOpenChat={vi.fn()}
        onOpenDrafts={vi.fn()}
        onOpenSkillHub={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );

    expect(html).toContain("Agent graph");
    expect(html).toContain("Agent 草稿");
    expect(html).toContain("Skill Hub");
    expect(html).toContain("2 个已加载");
    expect(html).toContain("Agent Builder");
    expect(html).toContain("测试聊天");
    expect(html).toContain("交付 Agent");
    expect(html).toContain("aria-current=\"page\"");
  });
});
