import type { AppPrismaClient } from "@/prisma/db";

import { Prisma } from "@/generated/prisma";

export type ClearGroupingArgs = {
  columnId: string;
  companyId: string;
};

export async function clearGroupingForDeletedColumn(
  client: AppPrismaClient,
  { columnId, companyId }: ClearGroupingArgs,
): Promise<void> {
  const cleared = { groupingColumnId: null, grouping: Prisma.DbNull };

  await Promise.all([
    client.p13n.updateMany({ where: { companyId, groupingColumnId: columnId }, data: cleared }),
    client.dataView.updateMany({ where: { companyId, groupingColumnId: columnId }, data: cleared }),
    client.dataViewOverride.updateMany({ where: { companyId, groupingColumnId: columnId }, data: cleared }),
  ]);
}
