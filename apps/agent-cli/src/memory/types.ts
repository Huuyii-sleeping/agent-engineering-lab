export type MemoryType = "fact" | "preference" | "constraint" | "decision" | "summary";
export type MemoryLayer = "short_term" | "long_term" | "durable" | "both";
export type MemoryScope = "project" | "session" | "agent" | "team";
export type AgentMemoryScope = "user" | "project" | "local";

export type MemoryEntry = {
  id: string;
  source: string;
  type: MemoryType;
  tags: string[];
  content: string;
  confidence: number;
  updatedAt: number;
  expiresAt: number | null;
};

export type SearchHit = MemoryEntry & {
  score: number;
  scoreBreakdown?: MemoryScoreBreakdown;
  layer: "short_term" | "long_term" | "durable";
  scope?: MemoryScope;
  path?: string;
  checksum?: string;
  reason?: string;
};

export type MemoryScoreBreakdown = {
  keyword: number;
  bigram: number;
  vector: number;
  confidence: number;
  recency: number;
  total: number;
};

export type DurableMemoryTopic = MemoryEntry & {
  scope: "project";
  path: string;
  indexPath: string;
  checksum: string;
  reason?: string;
};

export type DurableMemoryIndex = {
  schemaVersion: 1;
  generatedAt: number;
  scope: "project";
  root: string;
  topics: DurableMemoryTopic[];
};
