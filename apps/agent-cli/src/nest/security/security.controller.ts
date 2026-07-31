import { Controller, Get } from "@nestjs/common";
import { readTrackedWorkspaceFindings } from "../../security/secret-scanning.js";

@Controller("security")
export class SecurityController {
  @Get("findings")
  async findings(): Promise<Record<string, unknown>> {
    return { ok: true, findings: await readTrackedWorkspaceFindings() };
  }
}
