export type RoutineRunCursor = { createdAt: Date; id: string };

export type RoutineRunCursorOutcome = { valid: true; cursor: RoutineRunCursor | null } | { valid: false };

export function encodeRoutineRunCursor(cursor: RoutineRunCursor) {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    "utf8",
  ).toString("base64url");
}

function parseCursorJson(cursor: string): unknown {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function decodeRoutineRunCursor(cursor: string | null | undefined): RoutineRunCursorOutcome {
  if (!cursor) return { valid: true, cursor: null };

  const value = parseCursorJson(cursor);
  if (typeof value !== "object" || value === null) return { valid: false };

  const { createdAt, id } = value as { createdAt?: unknown; id?: unknown };
  if (typeof createdAt !== "string" || typeof id !== "string" || !id) return { valid: false };

  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return { valid: false };

  return { valid: true, cursor: { createdAt: date, id } };
}
