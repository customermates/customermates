import { createHash } from "node:crypto";

import type { TrashItem } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";
import type { TrashDeletionPreview } from "./trash.schema";

import { Prisma } from "@/generated/prisma";
import { TRASH_ITEM_ALIAS } from "./prisma-trash.repository";

export async function trashVisibility(handlers: TrashKindHandler[]): Promise<Prisma.Sql> {
  const predicates = await Promise.all(handlers.map((handler) => handler.visibility(TRASH_ITEM_ALIAS)));
  return predicates.length ? Prisma.sql`(${Prisma.join(predicates, " OR ")})` : Prisma.sql`FALSE`;
}

export function itemsByHandler(handlers: TrashKindHandler[], items: TrashItem[]) {
  return [...handlers]
    .sort((left, right) => left.restoreOrder - right.restoreOrder)
    .map((handler) => ({ handler, items: items.filter((item) => handler.kinds.includes(item.kind)) }))
    .filter((group) => group.items.length);
}

export async function trashDeletionPreview(
  handlers: TrashKindHandler[],
  items: TrashItem[],
): Promise<TrashDeletionPreview> {
  const removedRecords = new Map<string, { typeId: string; label: string; count: number }>();
  let removedLinks: number | null = 0;
  for (const group of itemsByHandler(handlers, items)) {
    const impact = await group.handler.impact(group.items);
    for (const entry of impact.removedRecords) {
      const existing = removedRecords.get(entry.typeId);
      removedRecords.set(entry.typeId, { ...entry, count: (existing?.count ?? 0) + entry.count });
    }
    removedLinks = removedLinks === null || impact.removedLinks === null ? null : removedLinks + impact.removedLinks;
  }
  const preview = {
    items: items.map((item) => ({ itemId: item.id, kind: item.kind, label: item.label })),
    removedRecords: [...removedRecords.values()].sort((left, right) => left.typeId.localeCompare(right.typeId)),
    removedLinks,
  };
  const impactHash = createHash("sha256")
    .update(
      JSON.stringify({
        items: items.map((item) => item.id).sort(),
        removedRecords: preview.removedRecords,
        removedLinks,
      }),
    )
    .digest("hex");
  return { ...preview, impactHash };
}
