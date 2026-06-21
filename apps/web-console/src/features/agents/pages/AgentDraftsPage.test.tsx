import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultAgentProfileInput, type AgentProfile } from "../../../api";
import { formatDateTime } from "../../../lib/format";
import { AgentDraftsPage } from "./AgentDraftsPage";

const agent: AgentProfile = {
  id: "agent-1",
  ...defaultAgentProfileInput,
  name: "交付 Agent",
  description: "负责交付前检查和回归验证。",
  createdAt: Date.UTC(2026, 5, 20, 8, 30),
  updatedAt: Date.UTC(2026, 5, 21, 9, 45),
};

describe("AgentDraftsPage", () => {
  it("renders agent CRUD failures inside the drafts workspace", () => {
    const html = renderToStaticMarkup(
      <AgentDraftsPage
        agents={[]}
        error="BFF service is unavailable"
        loading={false}
        saving={false}
        onCreateAgent={vi.fn()}
        onOpenAgent={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(html).toContain("Agent 草稿操作失败");
    expect(html).toContain("BFF service is unavailable");
  });

  it("renders draft cards with name, description and updated time only", () => {
    const html = renderToStaticMarkup(
      <AgentDraftsPage
        agents={[agent]}
        error={null}
        loading={false}
        saving={false}
        onCreateAgent={vi.fn()}
        onOpenAgent={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(html).toContain("交付 Agent");
    expect(html).toContain("负责交付前检查和回归验证。");
    expect(html).toContain("最新修改");
    expect(html).toContain(formatDateTime(agent.updatedAt));
    expect(html).not.toContain("3 skills");
    expect(html).not.toContain("3 actions");
    expect(html).not.toContain("Agent 草稿概览");
  });
});
