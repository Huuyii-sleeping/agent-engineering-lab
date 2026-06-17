import { Inject, Injectable } from "@nestjs/common";
import { LocalStoreService } from "./local-store.service.js";

export type WebSettings = {
  theme: "dark" | "light";
  language: string;
  shortcutHints: boolean;
  markdownRendering: boolean;
};

export const defaultWebSettings: WebSettings = {
  theme: "dark",
  language: "zh-CN",
  shortcutHints: true,
  markdownRendering: true,
};

function normalizeTheme(value: unknown): WebSettings["theme"] {
  return value === "light" ? "light" : "dark";
}

export function normalizeWebSettings(value: unknown): WebSettings {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    theme: normalizeTheme(record.theme),
    language: typeof record.language === "string" && record.language.trim() ? record.language.trim() : defaultWebSettings.language,
    shortcutHints: typeof record.shortcutHints === "boolean" ? record.shortcutHints : defaultWebSettings.shortcutHints,
    markdownRendering: typeof record.markdownRendering === "boolean" ? record.markdownRendering : defaultWebSettings.markdownRendering,
  };
}

@Injectable()
export class SettingsService {
  constructor(@Inject(LocalStoreService) private readonly store: LocalStoreService) {}

  async getSettings(): Promise<WebSettings> {
    return normalizeWebSettings(await this.store.readSection("settings", defaultWebSettings));
  }

  async patchSettings(input: unknown): Promise<WebSettings> {
    const current = await this.getSettings();
    const patch = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    return this.store.writeSection("settings", normalizeWebSettings({ ...current, ...patch }));
  }
}
