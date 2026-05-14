import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getSkillCatalog, loadSkill } from "../skills/loader.js";

export const SKILL_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_skills",
      description: "List local skills discovered from configured skill roots.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "load_skill",
      description: "Load one local skill by name and return its full markdown content.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
];

export async function runListSkills(): Promise<string> {
  const catalog = getSkillCatalog();
  return JSON.stringify(
    {
      ok: true,
      skills: catalog.available.map((skill) => ({
        name: skill.name,
        description: skill.description,
        path: skill.path,
        loaded: skill.loaded,
      })),
      loaded_names: catalog.loadedNames,
      missing_names: catalog.missingNames,
      include_all: catalog.includeAll,
    },
    null,
    2,
  );
}

export async function runLoadSkill(name: unknown): Promise<string> {
  const skillName = typeof name === "string" ? name.trim() : "";
  if (!skillName) {
    return JSON.stringify({
      ok: false,
      error: {
        code: "INVALID_SKILL_NAME",
        message: "skill name is required",
      },
    });
  }
  const catalog = getSkillCatalog();
  const skill = loadSkill(skillName);
  if (!skill) {
    return JSON.stringify({
      ok: false,
      error: {
        code: "SKILL_NOT_FOUND",
        message: `skill not found: ${skillName}`,
      },
      loaded_names: catalog.loadedNames,
      missing_names: catalog.missingNames,
    });
  }
  return JSON.stringify(
    {
      ok: true,
      skill: {
        name: skill.name,
        description: skill.description,
        path: skill.path,
        metadata: skill.metadata,
        content: skill.content,
        loaded: catalog.loadedNames.some(
          (loadedName) => loadedName.toLowerCase() === skill.name.toLowerCase(),
        ),
      },
      loaded_names: catalog.loadedNames,
      missing_names: catalog.missingNames,
      include_all: catalog.includeAll,
    },
    null,
    2,
  );
}
