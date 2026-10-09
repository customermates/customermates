import type { Prisma } from "@/generated/prisma";
import type { TrashItem, TrashRepo } from "./trash.repo";
import type { TrashKindHandler, TrashKindImpact, TrashKindRestore } from "./trash-kind-handler";
import type { TrashKind, TrashRestoreBlocker } from "./trash.schema";

import type { DomainEvent } from "@/features/event/domain-events";
import type { EventService } from "@/features/event/event.service";

export type TrashableEntityRepo = {
  restoreTrashed(ids: string[]): Promise<string[]>;
  purgeTrashed(ids: string[]): Promise<void>;
};

export type EntityTrashAudit =
  | {
      restored: DomainEvent.ROUTINE_RESTORED;
      deletedPermanently: DomainEvent.ROUTINE_DELETED_PERMANENTLY;
      label: "name";
    }
  | {
      restored: DomainEvent.WIKI_PAGE_RESTORED;
      deletedPermanently: DomainEvent.WIKI_PAGE_DELETED_PERMANENTLY;
      label: "title";
    };

export type EntityTrashKind = {
  kind: TrashKind;
  restoreOrder: number;
  visibility: (alias: Prisma.Sql) => Promise<Prisma.Sql>;
  blockers?: (items: TrashItem[]) => Promise<TrashRestoreBlocker[]>;
  audit?: EntityTrashAudit;
};

export class EntityTrashHandler implements TrashKindHandler {
  readonly kinds: readonly TrashKind[];
  readonly restoreOrder: number;

  constructor(
    private definition: EntityTrashKind,
    private repo: TrashableEntityRepo,
    private trash: TrashRepo,
    private events: EventService,
    private scopedCompanyId?: string,
  ) {
    this.kinds = [definition.kind];
    this.restoreOrder = definition.restoreOrder;
  }

  visibility(alias: Prisma.Sql): Promise<Prisma.Sql> {
    return this.definition.visibility(alias);
  }

  async restore(items: TrashItem[]): Promise<TrashKindRestore> {
    const blocked = (await this.definition.blockers?.(items)) ?? [];
    const blockedIds = new Set(blocked.map((blocker) => blocker.itemId));
    const candidates = items.filter((item) => !blockedIds.has(item.id));
    const restored = new Set(await this.repo.restoreTrashed(candidates.map((item) => item.targetId)));
    const missing = candidates.filter((item) => !restored.has(item.targetId));
    const restoredItemIds = candidates.filter((item) => restored.has(item.targetId)).map((item) => item.id);
    await this.trash.remove([...restoredItemIds, ...missing.map((item) => item.id)]);
    await this.publish(
      "restored",
      candidates.filter((item) => restored.has(item.targetId)),
      null,
    );
    return {
      restoredItemIds,
      blocked: [
        ...blocked,
        ...missing.map((item) => ({ itemId: item.id, reason: "notFound" as const, typeId: item.typeId })),
      ],
      restoredRecords: 0,
      droppedLinks: 0,
    };
  }

  impact(): Promise<TrashKindImpact> {
    return Promise.resolve({ removedRecords: [], removedLinks: 0 });
  }

  async purge(items: TrashItem[], actorId: string | null): Promise<void> {
    await this.repo.purgeTrashed(items.map((item) => item.targetId));
    await this.trash.remove(items.map((item) => item.id));
    await this.publish("deletedPermanently", items, actorId);
  }

  private async publish(change: "restored" | "deletedPermanently", items: TrashItem[], actorId: string | null) {
    const audit = this.definition.audit;
    if (!audit) return;
    const system = this.scopedCompanyId === undefined ? undefined : { systemCompanyId: this.scopedCompanyId };
    for (const item of items) {
      await this.events.publish(
        audit[change],
        { entityId: item.targetId, payload: { id: item.targetId, [audit.label]: item.label } } as never,
        change === "deletedPermanently" && actorId === null ? system : undefined,
      );
    }
  }
}
