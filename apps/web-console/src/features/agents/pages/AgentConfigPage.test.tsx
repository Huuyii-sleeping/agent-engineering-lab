import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultAgentProfileInput, type AgentProfile } from "../../../api";
import { AgentConfigPage } from "./AgentConfigPage";

const savedAgent: AgentProfile = {
  id: "agent-1",
  ...defaultAgentProfileInput,
  avatarId: "bot",
  createdAt: 1,
  updatedAt: 2,
};

describe("AgentConfigPage", () => {
  it("shows discard copy for unsaved drafts and exposes operation errors", () => {
    const html = renderToStaticMarkup(
      <AgentConfigPage
        activeAgent={null}
        draft={{ ...defaultAgentProfileInput, name: "新 Agent 1" }}
        error="Failed to fetch"
        isNewDraft={true}
        saving={false}
        onBack={vi.fn()}
        onDeleteAgent={vi.fn()}
        onDiscardDraft={vi.fn()}
        onDraftChange={vi.fn()}
        onSaveAgent={vi.fn()}
        onTestAgent={vi.fn()}
      />,
    );

    expect(html).toContain("丢弃并返回");
    expect(html).toContain("丢弃草稿");
    expect(html).toContain("Agent 草稿操作失败");
    expect(html).toContain("Failed to fetch");
  });

  it("keeps delete copy for persisted agents", () => {
    const html = renderToStaticMarkup(
      <AgentConfigPage
        activeAgent={savedAgent}
        draft={defaultAgentProfileInput}
        error={null}
        isNewDraft={false}
        saving={false}
        onBack={vi.fn()}
        onDeleteAgent={vi.fn()}
        onDiscardDraft={vi.fn()}
        onDraftChange={vi.fn()}
        onSaveAgent={vi.fn()}
        onTestAgent={vi.fn()}
      />,
    );

    expect(html).toContain("返回草稿库");
    expect(html).toContain("Agent 头像");
    expect(html).toContain("bot");
    expect(html).toContain("上传");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("删除");
    expect(html).not.toContain("丢弃草稿");
  });
});
