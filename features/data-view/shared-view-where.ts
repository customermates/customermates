import type { Prisma } from "@/generated/prisma";

type Viewer = { id: string; role?: { id?: string | null } | null };

export function sharedWithViewerWhere(viewer: Viewer): Prisma.DataViewWhereInput {
  const shared: Prisma.DataViewWhereInput[] = [{ visibility: "workspace" }];
  if (viewer.role?.id) shared.push({ visibility: "roles", roleShares: { some: { roleId: viewer.role.id } } });

  return { userId: { not: viewer.id }, OR: shared };
}
