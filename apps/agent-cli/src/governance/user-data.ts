import { getPrivacyConfig } from "../runtime-config.js";
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

export type PrivacyControlState =
  | "default"
  | "disabled"
  | "manual_only"
  | "minimal"
  | "local_only"
  | "allowlist";

export type UserPrivacyControl = {
  id: "persistence" | "memory" | "observability" | "remote_attach" | "external_capabilities";
  state: PrivacyControlState;
  summary: string;
};

export type UserDataGovernanceReport = {
  reference: string;
  statusLabels: Record<UserDataSurfaceStatus, string>;
  privacyControls: UserPrivacyControl[];
  privacyReservedGaps: string[];
  surfaces: UserDataSurface[];
};

function formatContract(kind: LocalArtifactKind, label: string): string {
  const contract = LOCAL_ARTIFACT_CONTRACTS[kind];
  return `${label} ${contract.retentionDays}d ${contract.exportMode} ${contract.deleteMode}`;
}

export function buildUserDataGovernanceReport(): UserDataGovernanceReport {
  const privacy = getPrivacyConfig();
  const bridgeManifest = createAgentBridgeManifest();

  return {
    reference:
      "github.com/liuup/claude-code-analysis/blob/main/analysis/02-user-data-and-usage.md | github.com/liuup/claude-code-analysis/blob/main/analysis/03-privacy-avoidance.md",
    statusLabels: {
      implemented: "implemented",
      partial: "partial parity",
      pending: "pending",
      reserved_gap: "reserved gap",
    },
    privacyControls: [
      {
        id: "persistence",
        state: privacy.persistenceMode,
        summary: "Controls local writes for sessions, transcript snapshots, and protected prompt dumps.",
      },
      {
        id: "memory",
        state: privacy.memoryMode,
        summary: "Controls automatic memory extraction and memory injection into model requests.",
      },
      {
        id: "observability",
        state: privacy.observabilityMode,
        summary: "Controls local observability persistence, including minimal and disabled modes.",
      },
      {
        id: "remote_attach",
        state: privacy.remoteAttachMode,
        summary: "Controls whether the CLI auto-attaches to an already-running daemon session.",
      },
      {
        id: "external_capabilities",
        state: privacy.externalCapabilitiesMode,
        summary: "Controls MCP and other external capability loading, including explicit allowlist mode.",
      },
    ],
    privacyReservedGaps: [
      "remote telemetry privacy tiers and sink selection",
      "organization policy controls and admin enforcement",
      "team memory sync identity, isolation, and deletion contracts",
      "training uploads or feedback egress with explicit consent modeling",
    ],
    surfaces: [
      {
        id: "model_input",
        title: "model input",
        status: "partial",
        boundary: "local_only",
        defaultState: "default_on",
        summary:
          "Requests combine user input, session history, tool results, memory context, dynamic system messages, and compact summaries through one local runtime pipeline.",
        sources: [
          "latest user prompt",
          "session history",
          "tool results",
          "memory_context",
          "dynamic system messages",
          "compact transcript summaries",
        ],
        uses: [
          "assemble model requests",
          "keep multi-round context coherent",
          "inject relevant runtime reminders and memory context",
        ],
        retention:
          "Primarily in-memory during the active session; if session persistence or compact snapshots are used, the local retention contracts apply.",
        exportDelete:
          "The /prompt surface shows a protected summary by default; full protected prompt export is local-only and tied to explicit deletion plus TTL cleanup.",
        notes: [
          "This surface is disclosed through /data.",
          "Default prompt inspection avoids echoing full dynamic message bodies inline.",
        ],
      },
      {
        id: "local_persistence",
        title: "local persistence",
        status: "partial",
        boundary: "local_only",
        defaultState: "default_on",
        summary:
          "The local runtime persists sessions, transcript snapshots, and protected prompt dumps unless privacy persistence is disabled.",
        sources: [
          ".sessions/session_<id>.json",
          ".transcripts/transcript_<phase>_<ts>.jsonl",
          ".security/prompt-dumps/prompt_dump_<ts>.json",
        ],
        uses: [
          "session resume",
          "before and after compact snapshots",
          "protected prompt export",
        ],
        retention: [
          formatContract("session", "session"),
          formatContract("transcript_snapshot", "transcript"),
          formatContract("prompt_dump", "prompt_dump"),
        ].join(" | "),
        exportDelete: "All three artifacts are local protected exports with explicit delete semantics.",
        notes: [
          "No-persistence mode now blocks these writes through one runtime control surface.",
        ],
      },
      {
        id: "memory",
        title: "memory",
        status: "partial",
        boundary: "local_only",
        defaultState: "default_on",
        summary:
          "Short-term and long-term local memory exist, and the runtime can auto-extract and auto-inject memory unless the privacy posture suppresses that automation.",
        sources: [
          ".memory/short_term.jsonl",
          ".memory/long_term.jsonl",
          "memory_search / memory_list / memory_add",
        ],
        uses: [
          "recover preferences and prior decisions across sessions",
          "inject relevant memory_context before model requests",
        ],
        retention: [
          formatContract("memory_short_term", "short_term"),
          formatContract("memory_long_term", "long_term"),
        ].join(" | "),
        exportDelete: "Memory is local query-only storage with explicit delete semantics and no team sync.",
        notes: [
          "Shared team memory and team memory sync remain reserved gaps.",
        ],
      },
      {
        id: "telemetry",
        title: "telemetry",
        status: "partial",
        boundary: "mixed",
        defaultState: "default_on",
        summary:
          "The repository implements local observability and replay, but not remote analytics sinks or policy-managed privacy tiers.",
        sources: [
          ".observability/events.jsonl",
          ".observability/metrics.json",
          "observability runtime events",
        ],
        uses: [
          "local debugging and replay",
          "aggregate tool and model usage",
        ],
        retention: formatContract("observability_event", "observability"),
        exportDelete:
          "Current observability is local query-only storage; no default remote telemetry upload path exists.",
        notes: [
          "Minimal mode keeps only essential security, replay, and error signals.",
          "remote telemetry and analytics privacy tiers remain a reserved gap.",
        ],
      },
      {
        id: "account_identity",
        title: "account identity",
        status: "reserved_gap",
        boundary: "reserved_gap",
        defaultState: "not_supported",
        summary: "The repository does not implement an account, organization, or subscription identity plane.",
        sources: [
          "not implemented in current repository",
        ],
        uses: [
          "reserved for future product identity plane",
        ],
        retention: "not supported",
        exportDelete: "not supported",
        notes: [
          "Future work must model principal, tenant, email, org, and subscription contracts explicitly.",
        ],
      },
      {
        id: "shared_team_memory",
        title: "shared team memory",
        status: "reserved_gap",
        boundary: "reserved_gap",
        defaultState: "not_supported",
        summary: "Only local team coordination primitives exist today; shared team memory and sync are not implemented.",
        sources: [
          "not implemented in current repository",
        ],
        uses: [
          "reserved for future shared memory sync",
        ],
        retention: "not supported",
        exportDelete: "not supported",
        notes: [
          "Identity, isolation, encryption, and delete propagation must exist before sync is implemented.",
        ],
      },
      {
        id: "explicit_sharing_and_training",
        title: "explicit sharing and training",
        status: "reserved_gap",
        boundary: "outbound_consent",
        defaultState: "not_supported",
        summary:
          "There is no implemented transcript sharing, feedback survey, or training-improvement upload surface in the repository.",
        sources: [
          "not implemented in current repository",
        ],
        uses: [
          "reserved for future consent-bound egress flows",
        ],
        retention: "not supported",
        exportDelete: "not supported",
        notes: [
          "Future training and feedback egress must explicitly model consent, redaction, and disable switches.",
          "training uploads do not exist today and must not be implied as a default behavior.",
        ],
      },
      {
        id: "remote_ingress",
        title: "remote ingress",
        status: "partial",
        boundary: "conditional_remote",
        defaultState: "on_demand",
        summary:
          "Daemon, bridge, and event replay are implemented, but they expand the data boundary only when explicitly enabled or attached.",
        sources: [
          "GET /bridge",
          "GET /bridge/state",
          "GET /events",
          `bridge endpoints: ${Object.values(bridgeManifest.endpoints).join(", ")}`,
        ],
        uses: [
          "shared session access",
          "bridge state inspection",
          "event replay / attach",
        ],
        retention:
          "Remote ingress does not introduce its own persistence contract; related session and observability artifacts reuse the existing local contracts.",
        exportDelete:
          "This boundary is on-demand. After activation it still depends on local artifact deletion and TTL cleanup.",
        notes: [
          "local_only remote attach mode blocks automatic daemon attach without hiding status probes.",
          "There is still no separate remote dashboard or org-level remote control plane.",
        ],
      },
    ],
  };
}
