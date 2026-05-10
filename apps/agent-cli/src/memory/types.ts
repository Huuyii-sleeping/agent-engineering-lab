export type MemoryType = "fact" | "preference" | "constraint" | "decision" | "summary";
export type MemoryLayer = "short_term" | "long_term" | "both";

export type MemoryEntry = {
  id: string;
  source: string;
  type: MemoryType;
  tags: string[];
  content: string;
  confidence: number;
  updatedAt: number;
};

export type SearchHit = MemoryEntry & {
  score: number;
  layer: "short_term" | "long_term";
};
