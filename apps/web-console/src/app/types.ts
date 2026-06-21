import type { SettingsSection } from "../settings-route";
import type { SessionMetadataMap } from "../session-metadata";
import type { LucideIcon } from "lucide-react";

export type LoadState = "idle" | "loading" | "sending";
export type StreamState = "connecting" | "connected" | "disconnected";
export type AppView = "agents" | "agent-config" | "chat" | "skills" | "builder" | "settings";
export type WorkspaceTab = Exclude<AppView, "settings" | "agents" | "agent-config">;

export type NavItem = {
  label: string;
  icon: LucideIcon;
};

export type QuickAction = {
  label: string;
  icon: LucideIcon;
};

export type SidebarSetting = {
  label: string;
  icon: LucideIcon;
  section: SettingsSection;
};

export type SessionSummaryTitleMap = Record<string, string>;

export type SessionMetadataUpdater = (current: SessionMetadataMap) => SessionMetadataMap;
