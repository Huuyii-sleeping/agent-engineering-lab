export function parseJsonl<T>(raw: string): T[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const out: T[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // ignore malformed line
    }
  }
  return out;
}

export function toJsonl(items: unknown[]): string {
  return `${items.map((item) => JSON.stringify(item)).join("\n")}\n`;
}
