import { Inject, Injectable } from "@nestjs/common";
import { LocalStoreService } from "./local-store.service.js";

export type UserProfile = {
  displayName: string;
  description: string;
};

export const defaultUserProfile: UserProfile = {
  displayName: "本地用户",
  description: "AI Studio operator",
};

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const next = value.trim();
  return next ? next : fallback;
}

export function normalizeUserProfile(value: unknown): UserProfile {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    displayName: cleanText(record.displayName, defaultUserProfile.displayName).slice(0, 24),
    description: cleanText(record.description, defaultUserProfile.description).slice(0, 48),
  };
}

@Injectable()
export class ProfileService {
  constructor(@Inject(LocalStoreService) private readonly store: LocalStoreService) {}

  async getProfile(): Promise<UserProfile> {
    return normalizeUserProfile(await this.store.readSection("profile", defaultUserProfile));
  }

  async updateProfile(input: unknown): Promise<UserProfile> {
    return this.store.writeSection("profile", normalizeUserProfile(input));
  }
}
