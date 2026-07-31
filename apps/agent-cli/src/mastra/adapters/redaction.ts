const SENSITIVE_KEY = /(authorization|api[-_]?key|token|secret|password|credential|system[-_]?prompt|instructions?|tool[-_]?definition|private[-_]?key)/i;

function redactString(value: string, secrets: string[]): string {
  return secrets.reduce(
    (current, secret) => secret.length >= 4 ? current.split(secret).join("[REDACTED]") : current,
    value,
  );
}

/** 在 Mastra 数据离开 Adapter 前递归移除凭据和内部定义。 */
export function redactMastraBoundaryValue(
  value: unknown,
  secrets: string[] = [],
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactString(value, secrets);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => redactMastraBoundaryValue(entry, secrets, seen));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactMastraBoundaryValue(entry, secrets, seen),
  ]));
}

/** 从 request context 中收集仅用于字符串替换的敏感值，不对外返回。 */
export function collectMastraBoundarySecrets(value: unknown, seen = new WeakSet<object>()): string[] {
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const secrets: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key) && typeof entry === "string" && entry) secrets.push(entry);
    if (entry && typeof entry === "object") secrets.push(...collectMastraBoundarySecrets(entry, seen));
  }
  return secrets;
}
