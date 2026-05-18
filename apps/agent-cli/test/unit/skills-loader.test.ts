import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  expandSkillContent,
  getConfiguredSkills,
  getSkillCatalog,
  listSkills,
  loadSkill,
  parseConfiguredSkillNames,
  selectSkillsForContext,
  skillMatchesPaths,
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

  it("normalizes rich skill metadata and blocks shell for untrusted sources", () => {
    const root = createSkillRoot();
    writeSkill(
      root,
      "review",
      [
        "---",
        "name: review-skill",
        "description: Review code safely.",
        "allowed-tools: read_file, bash",
        "model: coding",
        "paths: apps/**, src/*.ts",
        "source: mcp",
        "---",
        "",
        "# Review",
        "",
        "```bash",
        "echo blocked",
        "```",
      ].join("\n"),
    );

    const skill = listSkills({ roots: [root] })[0];

    expect(skill?.allowedTools).toEqual(["read_file", "bash"]);
    expect(skill?.model).toBe("coding");
    expect(skill?.pathPatterns).toEqual(["apps/**", "src/*.ts"]);
    expect(skill?.sourceType).toBe("mcp");
    expect(skill?.containsShellCommands).toBe(true);
    expect(skill?.canRunShell).toBe(false);
  });

  it("parses yaml-list frontmatter values and allows explicit local shell skills", () => {
    const root = createSkillRoot();
    writeSkill(
      root,
      "builder",
      [
        "---",
        "name: builder",
        "description: Build project.",
        "allowed-tools:",
        "  - bash",
        "  - read_file",
        "paths:",
        "  - packages/*",
        "  - apps/**",
        "source: local",
        "---",
        "",
        "```sh",
        "npm test",
        "```",
      ].join("\n"),
    );

    const skill = listSkills({ roots: [root] })[0];

    expect(skill?.allowedTools).toEqual(["bash", "read_file"]);
    expect(skill?.pathPatterns).toEqual(["packages/*", "apps/**"]);
    expect(skill?.sourceType).toBe("local");
    expect(skill?.containsShellCommands).toBe(true);
    expect(skill?.canRunShell).toBe(true);
  });

  it("expands safe skill variables without mutating loaded content", () => {
    const root = createSkillRoot();
    writeSkill(root, "vars", "Use ${SKILL_DIR} during ${SESSION_ID}.");
    const skill = loadSkill("vars", { roots: [root] });

    expect(skill).not.toBeNull();
    expect(expandSkillContent(skill!, { sessionId: "s1" })).toContain(path.join(root, "vars"));
    expect(expandSkillContent(skill!, { sessionId: "s1" })).toContain("s1");
    expect(skill?.content).toContain("${SKILL_DIR}");
  });

  it("matches skills to path context with conservative glob support", () => {
    const root = createSkillRoot();
    writeSkill(root, "apps", ["---", "paths: apps/**, src/*.ts, README.md", "---", "Use me."].join("\n"));
    writeSkill(root, "global", "Always available.");

    const [appsSkill, globalSkill] = listSkills({ roots: [root] });

    expect(skillMatchesPaths(appsSkill!, ["apps/agent-cli/src/main.ts"])).toBe(true);
    expect(skillMatchesPaths(appsSkill!, ["src/index.ts"])).toBe(true);
    expect(skillMatchesPaths(appsSkill!, ["README.md"])).toBe(true);
    expect(skillMatchesPaths(appsSkill!, ["docs/index.md"])).toBe(false);
    expect(skillMatchesPaths(globalSkill!, ["docs/index.md"])).toBe(true);
    expect(selectSkillsForContext([appsSkill!, globalSkill!], ["docs/index.md"]).map((skill) => skill.name)).toEqual([
      "global",
    ]);
  });

  it("exports compact governance metadata in prompt skill blocks", () => {
    const root = createSkillRoot();
    writeSkill(
      root,
      "review",
      [
        "---",
        "allowed-tools: read_file",
        "model: coding",
        "paths: apps/**",
        "source: project",
        "---",
        "Review ${SESSION_ID}.",
      ].join("\n"),
    );

    const block = toPromptSkillBlocks(listSkills({ roots: [root] }), { sessionId: "session_1" })[0];

    expect(block).toContain("### review");
    expect(block).toContain("source=project");
    expect(block).toContain("allowed_tools=read_file");
    expect(block).toContain("paths=apps/**");
    expect(block).toContain("Review session_1.");
  });
});
