import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentDraftsPage } from "./AgentDraftsPage";

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
});
