import type { MemoryType } from "./types.js";

export type ExtractedMemoryCandidate = {
  type: MemoryType;
  content: string;
  confidence: number;
  tags: string[];
};

export function extractCandidates(text: string): ExtractedMemoryCandidate[] {
  const sentences = text
    .split(/[。！？!?；;\n]/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const out: ExtractedMemoryCandidate[] = [];
  for (const sentence of sentences) {
    const short = sentence.slice(0, 220);
    if (/(默认|习惯|偏好|喜欢|倾向|prefer|preference|usually|always answer)/i.test(sentence)) {
      out.push({ type: "preference", content: short, confidence: 0.72, tags: ["preference"] });
    }
    if (/(必须|不要|禁止|每次|务必|不得|只能|must|never|do not|required)/i.test(sentence)) {
      out.push({ type: "constraint", content: short, confidence: 0.82, tags: ["constraint"] });
    }
    if (/(决定|后续|统一|改为|采用|选用|decision|decided|adopt)/i.test(sentence)) {
      out.push({ type: "decision", content: short, confidence: 0.7, tags: ["decision"] });
    }
  }
  return out;
}
