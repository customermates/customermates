import type { AppPrismaClient } from "@/prisma/db";
import type { TrashItemInput } from "./trash.repo";

import { TRASH_RETENTION_DAYS } from "./trash-retention";

type TrashItemClient = Pick<AppPrismaClient, "trashItem">;

export async function insertTrashItems(client: TrashItemClient, companyId: string, items: TrashItemInput[]) {
  if (!items.length) return;
  const deletedAt = new Date();
  const expiresAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await client.trashItem.createMany({ data: items.map((item) => ({ ...item, companyId, deletedAt, expiresAt })) });
}

export async function deleteTrashItems(client: TrashItemClient, companyId: string, ids: string[]) {
  if (!ids.length) return;
  await client.trashItem.deleteMany({ where: { companyId, id: { in: ids } } });
}
