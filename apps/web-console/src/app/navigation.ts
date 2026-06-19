import {
  AppWindow,
  Code2,
  Download,
  Folder,
  Grid2X2,
  Image,
  MessageSquare,
  MoreHorizontal,
  PenTool,
  SearchCheck,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { NavItem, QuickAction, SidebarSetting, WorkspaceTab } from "./types";

export const shortcutHints = ["Ctrl K", "Ctrl Enter", "Shift Enter", "Ctrl C"];

export const navItems: NavItem[] = [
  { label: "AI 浏览器", icon: SearchCheck },
  { label: "应用生成", icon: AppWindow },
  { label: "AI 创作", icon: PenTool },
  { label: "云盘", icon: Folder },
  { label: "更多", icon: Grid2X2 },
];

export const workspaceTabs: Array<{ label: string; view: WorkspaceTab; icon: typeof MessageSquare; description: string }> = [
  { label: "Agent 测试", view: "chat", icon: MessageSquare, description: "运行本地 agent 对话链路" },
  { label: "Skill 加载", view: "skills", icon: Download, description: "选择和下载可用技能" },
];

export const quickActions: QuickAction[] = [
  { label: "快速", icon: Sparkles },
  { label: "帮我写作", icon: PenTool },
  { label: "图像生成", icon: Image },
  { label: "编程", icon: Code2 },
  { label: "更多", icon: MoreHorizontal },
];

export const sidebarSettings: SidebarSetting[] = [
  { label: "个人设置", icon: UserRound, section: "profile" },
  { label: "偏好设置", icon: SlidersHorizontal, section: "preferences" },
  { label: "系统设置", icon: Settings, section: "system" },
];
