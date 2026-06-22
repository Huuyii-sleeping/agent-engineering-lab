import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SkillHubPage } from "./SkillHubPage";

describe("SkillHubPage", () => {
  it("renders a registry-style skill hub with metadata and load state", () => {
    const html = renderToStaticMarkup(
      <SkillHubPage downloadedSkillIds={["code-workspace"]} onToggleSkill={vi.fn()} />,
    );

    expect(html).toContain("Skill registry");
    expect(html).toContain("Skill Hub 状态");
    expect(html).toContain("Registry filters");
    expect(html).toContain("搜索 skill、来源或标签");
    expect(html).toContain("Local workspace");
    expect(html).toContain("文件读写 / 命令执行");
    expect(html).toContain("只看已加载");
    expect(html).toContain("已加载");
    expect(html).toContain("加载 Skill");
  });
});
