import type { Prisma } from "@/generated/prisma";
import type { TrashKind } from "./trash.schema";

export type TrashItem = {
  id: string;
  kind: TrashKind;
  targetId: string;
  typeId: string | null;
  surfaceKey: string | null;
  ownerUserId: string | null;
  label: string;
  deletedById: string | null;
  deletedAt: Date;
  expiresAt: Date;
  batchId: string;
  payload: Prisma.JsonValue;
};
export type TrashItemInput = Omit<TrashItem, "deletedAt" | "expiresAt" | "payload" | "surfaceKey" | "ownerUserId"> & {
  surfaceKey?: string | null;
  ownerUserId?: string | null;
  payload?: Prisma.InputJsonValue;
};
export type TrashListQuery = {
  visibility: Prisma.Sql;
  kinds?: TrashKind[];
  typeIds?: string[];
  search?: string;
  sortDescriptor?: { field: "deletedAt"; direction: "asc" | "desc" };
  page: number;
  pageSize: number;
};
export type TrashDeletedBy = { id: string; firstName: string; lastName: string; avatarUrl: string | null };

export interface TrashRepo {
  add(items: TrashItemInput[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  list(query: TrashListQuery): Promise<{ items: TrashItem[]; total: number }>;
  find(
    selection: { ids: string[] } | { batchId: string } | { all: true },
    visibility: Prisma.Sql,
  ): Promise<TrashItem[]>;
  deletedBy(userIds: string[]): Promise<Map<string, TrashDeletedBy>>;
}
