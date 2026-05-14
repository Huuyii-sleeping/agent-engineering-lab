import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getConfiguredSkills,
  getSkillCatalog,
  listSkills,
  loadSkill,
  parseConfiguredSkillNames,
  toPromptSkillBlocks,
} from "../../src/skills/loader.js";

describe("skills/loader", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function createSkillRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cli-skills-"));
    tempRoots.push(root);
    return root;
  }

  function writeSkill(root: string, name: string, body: string): void {
    const skillDir = path.join(root, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), body);
  }

  it("discovers skill files and parses frontmatter metadata", () => {
    const root = createSkillRoot();
    writeSkill(
      root,
      "apply-change",
      [
        "---",
        "name: openspec-apply-change",
        "description: Implement tasks from an OpenSpec change.",
        "---",
        "",
        "# Apply Change",
        "",
        "Use the apply workflow.",
      ].join("\n"),
    );

    const skills = listSkills({ roots: [root] });

    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("openspec-apply-change");
    expect(skills[0]?.description).toBe("Implement tasks from an OpenSpec change.");
    expect(skills[0]?.content).toContain("Use the apply workflow.");
  });

  it("tracks configured skills and missing names deterministically", () => {
    const root = createSkillRoot();
    writeSkill(root, "apply-change", "Use the apply workflow.");
    writeSkill(root, "review", "Review the current code.");

    const catalog = getSkillCatalog({
      roots: [root],
      env: { ...process.env, AGENT_SKILLS: "apply-change,missing-skill" },
    });
    const configured = getConfiguredSkills({
      roots: [root],
      env: { ...process.env, AGENT_SKILLS: "apply-change,missing-skill" },
    });

    expect(parseConfiguredSkillNames({ AGENT_SKILLS: "all" })).toEqual({ includeAll: true, names: [] });
    expect(catalog.loadedNames).toEqual(["apply-change"]);
    expect(catalog.missingNames).toEqual(["missing-skill"]);
    expect(configured.selected).toHaveLength(1);
    expect(loadSkill("review", { roots: [root] })?.content).toContain("Review the current code.");
    expect(toPromptSkillBlocks(configured.selected)[0]).toContain("### apply-change");
  });
});
