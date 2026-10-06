import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export function partitionRelationIds(previous: unknown, current: unknown) {
  const prevArr = Array.isArray(previous) ? previous : [];
  const currArr = Array.isArray(current) ? current : [];
  const prevIds = new Set(prevArr.map((x: { id: string }) => x.id));
  const currIds = new Set(currArr.map((x: { id: string }) => x.id));
  const added = currArr.filter((x: { id: string }) => !prevIds.has(x.id));
  const removed = prevArr.filter((x: { id: string }) => !currIds.has(x.id));
  return { added, removed };
}

export function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

export const AuditChangeSchema = z.object({
  field: z.string(),
  label: z.string().optional(),
  snapshot: z.boolean().optional(),
  previous: z.unknown(),
  current: z.unknown(),
});

export type AuditChange = Data<typeof AuditChangeSchema>;

type Changes = Record<string, { previous: unknown; current: unknown }>;

const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "avatarUrl", "roleId", "ownerUserId"]);

const REDACTED_FIELDS = new Set(["secret", "headers"]);

const IDENTITY_FIELDS = new Set(["name", "firstName", "lastName", "label", "displayName"]);

const RELATION_FIELDS = new Set(["users", "identifiers", "emails"]);

function fieldRank(change: AuditChange): number {
  if (change.field === "notes" || change.field === "markdown") return 3;
  if (RELATION_FIELDS.has(change.field)) return 2;
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

    result.push({ field, ...(isSnapshot && { snapshot: true }), previous: value.previous, current: value.current });
  }

  return result
    .map((change, index) => ({ change, index }))
    .sort((left, right) => fieldRank(left.change) - fieldRank(right.change) || left.index - right.index)
    .map(({ change }) => change);
}
