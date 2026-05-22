import path from "node:path";

import { toPersistenceError } from "@core/error-catalog";

const SAFE_FRAGMENT_REGEX = /[^a-zA-Z0-9._-]/g;

export function sanitizePathFragment(value: string): string {
  const normalized = value.trim().replace(/\s+/g, "-");
  const sanitized = normalized.replace(SAFE_FRAGMENT_REGEX, "_");
  return sanitized.replace(/^\.+/, "").slice(0, 120);
}

export function ensureSafeScopedPath(root: string, ...parts: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(resolvedRoot, ...parts);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw toPersistenceError(
      "SCHEMA_FIELD_INVALID",
      "Path escapes selected project root.",
      { root: resolvedRoot, target: resolvedTarget },
    );
  }

  return resolvedTarget;
}
