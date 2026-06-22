import { Controller, Get, Inject, Param, Post, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { errorPayload, writeJson } from "../http-utils.js";
import { SkillRegistryService } from "./skill-registry.service.js";

@Controller("/api/skills")
export class SkillsController {
  constructor(
    @Inject(SkillRegistryService)
    private readonly skillRegistryService: SkillRegistryService,
  ) {}

  /** Lists local skill manifests with their installed state. */
  @Get()
  async skills(@Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, skills: await this.skillRegistryService.listSkills() });
  }

  /** Installs one local skill by id. */
  @Post(":skillId/install")
  async installSkill(@Param("skillId") skillId: string, @Res() res: ServerResponse): Promise<void> {
    const skill = await this.skillRegistryService.installSkill(skillId);
    if (!skill) {
      writeJson(res, 404, errorPayload("SKILL_NOT_FOUND", `skill ${skillId} was not found`));
      return;
    }
    writeJson(res, 200, { ok: true, skill });
  }

  /** Uninstalls one local skill by id. */
  @Post(":skillId/uninstall")
  async uninstallSkill(@Param("skillId") skillId: string, @Res() res: ServerResponse): Promise<void> {
    const skill = await this.skillRegistryService.uninstallSkill(skillId);
    if (!skill) {
      writeJson(res, 404, errorPayload("SKILL_NOT_FOUND", `skill ${skillId} was not found`));
      return;
    }
    writeJson(res, 200, { ok: true, skill });
  }
}
