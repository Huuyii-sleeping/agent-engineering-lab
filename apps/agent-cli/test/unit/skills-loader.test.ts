import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  activateConditionalSkillsForPaths,
  expandSkillContent,
  getConfiguredSkills,
  getConfiguredSkillSummaries,
  getSkillCatalog,
  listSkillSummaries,
  listSkills,
  loadSkill,
  parseConfiguredSkillNames,
  selectSkillsForContext,
  skillMatchesPaths,
  toPromptSkillCatalogBlocks,
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

  it("discovers skill summaries without exposing full skill body", () => {
    const root = createSkillRoot();
    writeSkill(
      root,
      "summary",
      [
        "---",
        "name: summary",
        "description: Summary only.",
        "---",
        "",
        "Private body detail that should only appear after load_skill.",
      ].join("\n"),
    );

    const summaries = listSkillSummaries({ roots: [root] });
    const loaded = loadSkill("summary", { roots: [root] });

    expect(summaries).toHaveLength(1);
    expect("content" in summaries[0]!).toBe(false);
    expect(summaries[0]?.description).toBe("Summary only.");
    expect(loaded?.content).toContain("Private body detail");
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

  it("tracks configured skill summaries without loading full content", () => {
    const root = createSkillRoot();
    writeSkill(root, "apply-change", "Use the apply workflow.");

    const configured = getConfiguredSkillSummaries({
      roots: [root],
      env: { ...process.env, AGENT_SKILLS: "apply-change" },
    });

    expect(configured.selected).toHaveLength(1);
    expect(configured.selected[0]?.name).toBe("apply-change");
    expect("content" in configured.selected[0]!).toBe(false);
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

  it("adds base directory context only when loading full skill content", () => {
    const root = createSkillRoot();
    writeSkill(root, "vars", "Use ${SKILL_DIR} during ${SESSION_ID}.");
    const skill = loadSkill("vars", { roots: [root] });

    expect(skill).not.toBeNull();
    expect(skill?.baseDir).toBe(path.join(root, "vars"));
    expect(expandSkillContent(skill!, { sessionId: "s1" })).toContain(
      `Base directory for this skill: ${path.join(root, "vars")}`,
    );
    expect(expandSkillContent(skill!, { sessionId: "s1" })).toContain("Use ");
    expect(skill?.content).not.toContain("Base directory for this skill");
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

  it("activates path-scoped skills only after matching context paths", () => {
    const root = createSkillRoot();
    writeSkill(root, "apps", ["---", "paths: apps/**", "---", "Use apps workflow."].join("\n"));
    writeSkill(root, "global", "Always available.");

    const summaries = listSkillSummaries({ roots: [root] });

    expect(toPromptSkillCatalogBlocks(summaries).join("\n")).toContain("global");
    expect(toPromptSkillCatalogBlocks(summaries).join("\n")).not.toContain("apps");
    expect(activateConditionalSkillsForPaths(summaries, ["docs/index.md"]).map((skill) => skill.name)).toEqual([]);
    expect(activateConditionalSkillsForPaths(summaries, ["apps/agent-cli/src/main.ts"]).map((skill) => skill.name)).toEqual([
      "apps",
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

  it("exports compact skill catalog prompt blocks without full content", () => {
    const root = createSkillRoot();
    writeSkill(
      root,
      "review",
      [
        "---",
        "description: Review code safely.",
        "allowed-tools: read_file",
        "paths: apps/**",
        "source: project",
        "---",
        "Full body should be hidden until load_skill.",
      ].join("\n"),
    );
    writeSkill(root, "global", ["---", "description: Always available.", "---", "Global hidden body."].join("\n"));

    const block = toPromptSkillCatalogBlocks(listSkillSummaries({ roots: [root] })).join("\n");

    expect(block).toContain("### global");
    expect(block).toContain("Always available.");
    expect(block).toContain("load_skill");
    expect(block).not.toContain("Global hidden body.");
    expect(block).not.toContain("Full body should be hidden");
    expect(block).not.toContain("### review");
  });
});
