import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

const AuditSnapshotChangeSchema = z
  .object({
    field: z.string(),
    label: z.string().optional(),
    snapshot: z.literal(true),
    current: z.unknown(),
  })
  .describe("A value captured when the item was created or removed; it has no previous value.");

const AuditValueChangeSchema = z
  .object({
    field: z.string(),
    label: z.string().optional(),
    previous: z.unknown(),
    current: z.unknown(),
  })
  .describe("A value that changed from previous to current; null stands for an empty value.");

export const AuditChangeSchema = z.union([AuditSnapshotChangeSchema, AuditValueChangeSchema]);

export type AuditChange = Data<typeof AuditChangeSchema>;

type Changes = Record<string, { previous: unknown; current: unknown }>;

const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "avatarUrl", "roleId", "ownerUserId", "recordGrants"]);

const REDACTED_FIELDS = new Set(["secret", "headers"]);

const IDENTITY_FIELDS = new Set(["name", "firstName", "lastName", "label", "displayName"]);

function fieldRank(change: AuditChange): number {
  if (change.field === "markdown") return 2;
  if (IDENTITY_FIELDS.has(change.field)) return 0;
  return 1;
}

export function extractAuditChanges(payload: unknown): AuditChange[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];

  let changes: Changes;
  let isSnapshot = false;
  if ("changes" in payload) changes = (payload as Record<string, unknown>).changes as Changes;
  else {
    isSnapshot = true;
    changes = {};
    for (const [key, value] of Object.entries(payload))
      if (!isEmpty(value)) changes[key] = { previous: undefined, current: value };
  }

  const result: AuditChange[] = [];

  for (const [field, value] of Object.entries(changes)) {
    if (IGNORED_FIELDS.has(field) || REDACTED_FIELDS.has(field)) continue;

    result.push(
      isSnapshot
        ? { field, snapshot: true, current: value.current }
        : { field, previous: value.previous ?? null, current: value.current ?? null },
    );
  }

  return result
    .map((change, index) => ({ change, index }))
    .sort((left, right) => fieldRank(left.change) - fieldRank(right.change) || left.index - right.index)
    .map(({ change }) => change);
}
