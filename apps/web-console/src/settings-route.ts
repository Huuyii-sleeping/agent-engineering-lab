export type SettingsSection = "profile" | "preferences" | "system";

const settingsSections: SettingsSection[] = ["profile", "preferences", "system"];

/** Extract the settings section encoded in the URL hash. */
export function settingsSectionFromHash(hash: string): SettingsSection | null {
  const [, section] = hash.match(/^#settings\/([^/]+)$/) ?? [];
  return settingsSections.includes(section as SettingsSection) ? (section as SettingsSection) : null;
}
