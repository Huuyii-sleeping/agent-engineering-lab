import { createHash } from "node:crypto";

/* eslint-disable no-control-regex */
const HIDDEN_CONTROL_REGEX = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]",
  "g",
);
/* eslint-enable no-control-regex */
const BIDI_CONTROL_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ZERO_WIDTH_FORMAT_REGEX = /[\u200B-\u200D\u2060\uFEFF]/g;

const SECRET_TEXT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },
  {
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED_TOKEN]",
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED_AWS_KEY]",
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}\b/gi,
    replacement: "Bearer [REDACTED_TOKEN]",
  },
];

const SECRET_ASSIGNMENT_REGEX =
  /(["']?[A-Za-z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTHORIZATION)[A-Za-z0-9_]*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|`[^`]*`|Bearer\s+[^\s,"'`}\]]+|[^\s,"'`}\]]+)/gi;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}

export function sanitizeVisibleText(value: string): string {
  return value
    .replace(HIDDEN_CONTROL_REGEX, "")
    .replace(BIDI_CONTROL_REGEX, "")
    .replace(ZERO_WIDTH_FORMAT_REGEX, "");
}

export function redactSecretText(value: string): string {
  let next = value.replace(SECRET_ASSIGNMENT_REGEX, (match, prefix: string) => {
    const trimmed = match.slice(prefix.length).trimStart();
    const wrapper = trimmed.startsWith('"')
      ? '"'
      : trimmed.startsWith("'")
        ? "'"
        : trimmed.startsWith("`")
          ? "`"
          : "";
    return `${prefix}${wrapper}[REDACTED_SECRET]${wrapper}`;
  });
  for (const { pattern, replacement } of SECRET_TEXT_PATTERNS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

export function sanitizeAndRedactText(value: string): string {
  return redactSecretText(sanitizeVisibleText(value));
}

export function sanitizeAndRedactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeAndRedactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAndRedactValue(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, sanitizeAndRedactValue(item)]),
    );
  }
  return value;
}

export function sanitizeMcpIdentifier(value: string): string {
  return value.startsWith("mcp__") ? "[mcp_tool]" : sanitizeAndRedactText(value);
}

export function stableScopeHash(toolName: string, args: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeys({ toolName, args }));
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function buildScopePreview(toolName: string, args: Record<string, unknown>): string {
  return JSON.stringify(
    sanitizeAndRedactValue({
      toolName,
      args,
    }),
  );
}
