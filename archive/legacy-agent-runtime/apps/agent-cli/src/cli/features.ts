export type CliFeatureVisibility = "public" | "internal" | "hidden";
export type CliFeatureStability = "stable" | "experimental" | "reserved_gap";

export type CliFeatureDisclosureEntry = {
  id: string;
  title: string;
  summary: string;
  visibility: CliFeatureVisibility;
  stability: CliFeatureStability;
  enabledByDefault: boolean;
  commands: string[];
  notes: string[];
};

export type CliFeatureDisclosureReport = {
  entries: CliFeatureDisclosureEntry[];
  reservedGaps: string[];
  summary: {
    publicFeatures: number;
    internalFeatures: number;
    hiddenCommands: number;
    easterEggs: number;
    betaOnlySurfaces: number;
    reservedGaps: number;
  };
};

const CLI_FEATURE_DISCLOSURE_ENTRIES: CliFeatureDisclosureEntry[] = [
  {
    id: "feature-disclosure",
    title: "Feature disclosure",
    summary: "Lists local feature surfaces, visibility, and hidden/reserved states.",
    visibility: "public",
    stability: "stable",
    enabledByDefault: true,
    commands: ["/features"],
    notes: ["read-only local governance surface", "does not enable or disable features"],
  },
  {
    id: "command-help",
    title: "Command help",
    summary: "Documents supported slash commands and local workflows.",
    visibility: "public",
    stability: "stable",
    enabledByDefault: true,
    commands: ["/help", "/help runtime", "/help all"],
    notes: ["primary discovery surface for local commands"],
  },
  {
    id: "command-palette",
    title: "Command palette",
    summary: "Fuzzy-searches high-frequency local actions without entering the model path.",
    visibility: "public",
    stability: "stable",
    enabledByDefault: true,
    commands: ["/palette", "/palette <query>", "/palette open <index>", "Ctrl+K"],
    notes: ["groups visible local candidates", "does not include hidden candidates"],
  },
  {
    id: "workflow-switcher",
    title: "Workflow switcher",
    summary: "Switches the local surface between agent and draw-oriented workflows.",
    visibility: "public",
    stability: "stable",
    enabledByDefault: true,
    commands: ["/workflow", "/workflow agent", "/workflow draw"],
    notes: ["local UI mode only", "not a remote feature flag"],
  },
  {
    id: "runtime-inspection",
    title: "Runtime inspection",
    summary: "Inspects architecture, prompt, skills, MCP, data governance, config, and status.",
    visibility: "public",
    stability: "stable",
    enabledByDefault: true,
    commands: ["/status", "/config", "/architecture", "/data", "/skills", "/skill <name>", "/prompt", "/mcp"],
    notes: ["read-only unless a command explicitly documents a local reset or switch"],
  },
  {
    id: "hidden-command-surface",
    title: "Hidden command surface",
    summary: "No hidden slash commands are registered in the local CLI surface.",
    visibility: "internal",
    stability: "reserved_gap",
    enabledByDefault: false,
    commands: ["none registered"],
    notes: ["future hidden commands must be registered here before shipping"],
  },
  {
    id: "easter-egg-surface",
    title: "Hidden easter egg surface",
    summary: "No hidden easter eggs or buddy/persona triggers are registered.",
    visibility: "internal",
    stability: "reserved_gap",
    enabledByDefault: false,
    commands: ["none registered"],
    notes: ["do not add undisclosed persona or joke commands outside this registry"],
  },
  {
    id: "beta-only-api-surface",
    title: "Beta-only API/header surface",
    summary: "No beta-only local API header or remote experiment surface is implemented.",
    visibility: "internal",
    stability: "reserved_gap",
    enabledByDefault: false,
    commands: ["reserved_gap"],
    notes: ["remote feature flag service is out of scope"],
  },
];

export function listCliFeatureDisclosureEntries(): CliFeatureDisclosureEntry[] {
  return CLI_FEATURE_DISCLOSURE_ENTRIES.map((entry) => ({
    ...entry,
    commands: [...entry.commands],
    notes: [...entry.notes],
  }));
}

export function buildCliFeatureDisclosureReport(): CliFeatureDisclosureReport {
  const entries = listCliFeatureDisclosureEntries();
  return {
    entries,
    reservedGaps: ["hidden commands", "hidden easter eggs", "beta-only API/header surfaces"],
    summary: {
      publicFeatures: entries.filter((entry) => entry.visibility === "public").length,
      internalFeatures: entries.filter((entry) => entry.visibility === "internal").length,
      hiddenCommands: entries.filter((entry) => entry.visibility === "hidden" && entry.enabledByDefault).length,
      easterEggs: 0,
      betaOnlySurfaces: 0,
      reservedGaps: entries.filter((entry) => entry.stability === "reserved_gap").length,
    },
  };
}
