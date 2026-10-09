import type { Prisma } from "@/generated/prisma";
import type { TrashItem } from "./trash.repo";
import type { TrashKind, TrashRestoreBlocker } from "./trash.schema";

export type TrashKindRestore = {
  restoredItemIds: string[];
  blocked: TrashRestoreBlocker[];
  restoredRecords: number;
  droppedLinks: number;
};
export type TrashKindImpact = {
  removedRecords: Array<{ typeId: string; label: string; count: number }>;
  removedLinks: number | null;
};

export interface TrashKindHandler {
  readonly kinds: readonly TrashKind[];
  readonly restoreOrder: number;
  visibility(alias: Prisma.Sql): Promise<Prisma.Sql>;
  restore(items: TrashItem[]): Promise<TrashKindRestore>;
  restoreInBackground?(items: TrashItem[]): Promise<string>;
  impact(items: TrashItem[]): Promise<TrashKindImpact>;
  purge(items: TrashItem[], actorId: string | null): Promise<void>;
}
