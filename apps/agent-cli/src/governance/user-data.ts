import { LOCAL_ARTIFACT_CONTRACTS, type LocalArtifactKind } from "../security/local-retention.js";
import { createAgentBridgeManifest } from "../service-api/bridge.js";

export type UserDataSurfaceStatus = "implemented" | "partial" | "pending" | "reserved_gap";

export type UserDataSurfaceBoundary =
  | "local_only"
  | "conditional_remote"
  | "outbound_consent"
  | "mixed"
  | "reserved_gap";

export type UserDataSurfaceDefaultState = "default_on" | "on_demand" | "not_supported";

export type UserDataSurface = {
  id:
    | "model_input"
    | "local_persistence"
    | "memory"
    | "telemetry"
    | "account_identity"
    | "shared_team_memory"
    | "explicit_sharing_and_training"
    | "remote_ingress";
  title: string;
  status: UserDataSurfaceStatus;
  boundary: UserDataSurfaceBoundary;
  defaultState: UserDataSurfaceDefaultState;
  summary: string;
  sources: string[];
  uses: string[];
  retention: string;
  exportDelete: string;
  notes: string[];
};

export type UserDataGovernanceReport = {
  reference: string;
  statusLabels: Record<UserDataSurfaceStatus, string>;
  surfaces: UserDataSurface[];
};

function formatContract(kind: LocalArtifactKind, label: string): string {
  const contract = LOCAL_ARTIFACT_CONTRACTS[kind];
  return `${label} ${contract.retentionDays}d ${contract.exportMode} ${contract.deleteMode}`;
}

export function buildUserDataGovernanceReport(): UserDataGovernanceReport {
  const bridgeManifest = createAgentBridgeManifest();

  return {
    reference:
      "github.com/liuup/claude-code-analysis/blob/main/analysis/02-user-data-and-usage.md",
    statusLabels: {
      implemented: "已实现",
      partial: "部分等价",
      pending: "待实现",
      reserved_gap: "保留缺口",
    },
    surfaces: [
      {
        id: "model_input",
        title: "model input",
        status: "partial",
        boundary: "local_only",
        defaultState: "default_on",
        summary:
          "当前请求会组合用户输入、会话历史、工具结果、memory 注入、compact 摘要与动态提醒，但此前缺少统一的用户视角披露面。",
        sources: [
          "latest user prompt",
          "session history",
          "tool results",
          "memory_context",
          "dynamic system messages",
          "compact transcript summaries",
        ],
        uses: [
          "组装模型请求",
          "保持多轮上下文连续性",
          "按相关性补充记忆与运行时提醒",
        ],
        retention: "主要驻留于当前会话内存；如触发 compact 或 session 持久化，则受本地 retention contract 约束。",
        exportDelete:
          "默认通过 /prompt 仅看摘要；完整 prompt 通过 protected export 导出，相关会话数据走显式删除与过期清理。",
        notes: [
          "该面现在由 /data 统一披露。",
          "默认 inspection 不直接暴露完整高敏感动态正文。",
        ],
      },
      {
        id: "local_persistence",
        title: "local persistence",
        status: "partial",
        boundary: "local_only",
        defaultState: "default_on",
        summary:
          "本地会保存 session、transcript snapshot、prompt dump 等高敏感运行工件，但此前缺少统一说明它们分别为何存在。",
        sources: [
          ".sessions/session_<id>.json",
          ".transcripts/transcript_<phase>_<ts>.jsonl",
          ".security/prompt-dumps/prompt_dump_<ts>.json",
        ],
        uses: [
          "session resume",
          "compact 前后快照",
          "protected prompt export",
        ],
        retention: [
          formatContract("session", "session"),
          formatContract("transcript_snapshot", "transcript"),
          formatContract("prompt_dump", "prompt_dump"),
        ].join(" | "),
        exportDelete:
          "高敏感工件统一走 protected_export，并且都声明 explicit_delete。",
        notes: [
          "session / transcript / prompt dump 现在统一纳入一个披露面。",
        ],
      },
      {
        id: "memory",
        title: "memory",
        status: "partial",
        boundary: "local_only",
        defaultState: "default_on",
        summary:
          "仓库已实现 short-term 与 long-term 本地 memory，以及按查询相关性注入模型请求；但 shared/team memory 仍未实现。",
        sources: [
          ".memory/short_term.jsonl",
          ".memory/long_term.jsonl",
          "memory_search / memory_list / memory_add",
        ],
        uses: [
          "跨会话恢复偏好与历史决策",
          "在请求前注入相关 memory_context",
        ],
        retention: [
          formatContract("memory_short_term", "short_term"),
          formatContract("memory_long_term", "long_term"),
        ].join(" | "),
        exportDelete:
          "memory 默认 query_only，不做远端同步；删除语义为 explicit_delete。",
        notes: [
          "shared team memory / team memory sync 仍是保留缺口。",
        ],
      },
      {
        id: "telemetry",
        title: "telemetry",
        status: "partial",
        boundary: "mixed",
        defaultState: "default_on",
        summary:
          "当前已有本地 observability 与 replay 数据面，但没有 remote analytics / telemetry sink、essential-only 分层或组织级关闭开关。",
        sources: [
          ".observability/events.jsonl",
          ".observability/metrics.json",
          "observability runtime events",
        ],
        uses: [
          "本地问题回放与调试",
          "统计工具与模型调用概况",
        ],
        retention: formatContract("observability_event", "observability"),
        exportDelete:
          "当前仅为本地 query_only；远端 telemetry 尚未接入，因此不存在默认出站上传。",
        notes: [
          "`.observability` 已实现，本地可观测性不等于 remote analytics。",
          "remote telemetry / analytics privacy tiers 仍是 reserved_gap。",
        ],
      },
      {
        id: "account_identity",
        title: "account identity",
        status: "reserved_gap",
        boundary: "reserved_gap",
        defaultState: "not_supported",
        summary:
          "当前仓库没有完整 OAuth / account / organization / subscription 数据面，不能用本地配置或 daemon 状态弱等价代替。",
        sources: [
          "not implemented in current repository",
        ],
        uses: [
          "reserved for future product identity plane",
        ],
        retention: "not supported",
        exportDelete: "not supported",
        notes: [
          "需要单独定义 principal、tenant、email、org、subscription 等身份字段合同。",
        ],
      },
      {
        id: "shared_team_memory",
        title: "shared team memory",
        status: "reserved_gap",
        boundary: "reserved_gap",
        defaultState: "not_supported",
        summary:
          "当前只有本地 team communication protocol，没有组织级 shared team memory 或 memory sync 产品面。",
        sources: [
          "not implemented in current repository",
        ],
        uses: [
          "reserved for future shared memory sync",
        ],
        retention: "not supported",
        exportDelete: "not supported",
        notes: [
          "后续必须先定义身份、隔离、加密与删除传播，再考虑同步实现。",
        ],
      },
      {
        id: "explicit_sharing_and_training",
        title: "explicit sharing and training",
        status: "reserved_gap",
        boundary: "outbound_consent",
        defaultState: "not_supported",
        summary:
          "当前仓库没有 transcript 分享、feedback survey、训练改进上传等需要用户主动同意的出站数据面。",
        sources: [
          "not implemented in current repository",
        ],
        uses: [
          "reserved for future consent-bound egress flows",
        ],
        retention: "not supported",
        exportDelete: "not supported",
        notes: [
          "后续必须显式建模 consent、脱敏、关闭开关与训练改进边界。",
          "训练改进类上传当前并不存在，不应被隐含为默认行为。",
        ],
      },
      {
        id: "remote_ingress",
        title: "remote ingress",
        status: "partial",
        boundary: "conditional_remote",
        defaultState: "on_demand",
        summary:
          "daemon / bridge / event replay 已实现，但只有在显式启用 bridge 或 attach 模式时才会扩大数据边界。",
        sources: [
          "GET /bridge",
          "GET /bridge/state",
          "GET /events",
          `bridge endpoints: ${Object.values(bridgeManifest.endpoints).join(", ")}`,
        ],
        uses: [
          "共享 session",
          "bridge state 查询",
          "event replay / attach",
        ],
        retention:
          "remote ingress 自身不新增独立持久化 contract；相关会话与 observability 数据分别沿用 session / telemetry contract。",
        exportDelete:
          "该面默认为按需启用；启用后仍依赖各本地工件的显式删除和过期清理。",
        notes: [
          "remote / bridge ingress 不是默认本地最小边界。",
          "当前仓库也没有独立 remote dashboard 或 org-level remote control plane。",
        ],
      },
    ],
  };
}
