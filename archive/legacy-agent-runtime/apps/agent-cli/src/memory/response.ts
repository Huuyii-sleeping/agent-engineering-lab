export function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...data }, null, 2);
}

export function fail(code: string, message: string): string {
  return JSON.stringify({ ok: false, error: { code, message } }, null, 2);
}
