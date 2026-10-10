import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { ConfigurationChange, ConfigurationTarget } from "./configuration.schema";
import type { ApplyRecordConfigurationInteractor } from "./configure-records.interactor";
import type { PreviewRecordConfigurationInteractor } from "./preview-record-configuration.interactor";
import type { TrashItem } from "@/features/trash/trash.repo";
import type { TrashKindHandler, TrashKindImpact, TrashKindRestore } from "@/features/trash/trash-kind-handler";
import type { TrashRestoreBlocker } from "@/features/trash/trash.schema";

import { Prisma } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError } from "./record-write-error";

const CONFIGURATION_KINDS = ["list", "field", "relationship", "channels"] as const;
const ORDER: Record<string, number> = { list: 0, relationship: 1, field: 2, channels: 3 };

function target(item: TrashItem): ConfigurationTarget {
  return {
    kind: item.kind === "list" ? "type" : item.kind,
    id: item.targetId,
  } as ConfigurationTarget;
}

export class ConfigurationTrashHandler implements TrashKindHandler {
  readonly kinds = CONFIGURATION_KINDS;
  readonly restoreOrder = 0;

  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private preview: PreviewRecordConfigurationInteractor,
    private apply: ApplyRecordConfigurationInteractor,
  ) {}

  async visibility(alias: Prisma.Sql): Promise<Prisma.Sql> {
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!policy.actor || !policy.canManageSchema) return Prisma.sql`FALSE`;
    const archived = model.types.filter((type) => type.archived).map((type) => type.id);
    const outsideDeletedList = archived.length
      ? Prisma.sql`(${alias}."typeId" IS NULL OR ${alias}."typeId" NOT IN (${Prisma.join(archived)}))`
      : Prisma.sql`TRUE`;
    return Prisma.sql`(${alias}.kind IN ('list', 'field', 'relationship', 'channels') AND (${alias}.kind = 'list' OR ${outsideDeletedList}))`;
  }

  private async change(item: TrashItem, operation: "restore" | "deletePermanently"): Promise<ConfigurationChange> {
    const revision = (await this.records.getState())?.revision ?? 0;
    return {
      expectedRevision: revision,
      idempotencyKey: `trash:${operation}:${item.id}:${revision}`,
      operations: [{ operation, target: target(item) }],
    };
  }

  async restore(items: TrashItem[]): Promise<TrashKindRestore> {
    const result: TrashKindRestore = { restoredItemIds: [], blocked: [], restoredRecords: 0, droppedLinks: 0 };
    for (const item of [...items].sort((left, right) => ORDER[left.kind] - ORDER[right.kind])) {
      const change = await this.change(item, "restore");
      const preview = await this.preview.run(change);
      if (!preview.ok || !preview.data.valid) {
        result.blocked.push(this.blocker(item, preview.ok ? preview.data : null));
        continue;
      }
      const applied = await this.apply.run(change);
      if (!applied.ok) {
        result.blocked.push({ itemId: item.id, reason: "notFound", typeId: item.typeId });
        continue;
      }
      result.restoredItemIds.push(item.id);
    }
    return result;
  }

  private blocker(
    item: TrashItem,
    preview: { issues: Array<{ code: string }>; deletion?: { blockers: Array<{ reason: string }> } } | null,
  ): TrashRestoreBlocker {
    const reason = preview?.deletion?.blockers.some((blocker) => blocker.reason === "requiresRestore")
      ? "requiresRestore"
      : preview?.issues.some((issue) => issue.code.startsWith("duplicate_"))
        ? "nameTaken"
        : "notFound";
    return { itemId: item.id, reason, typeId: item.typeId };
  }

  async impact(items: TrashItem[]): Promise<TrashKindImpact> {
    const model = await this.records.getModel();
    const removedRecords: TrashKindImpact["removedRecords"] = [];
    let removedLinks: number | null = 0;
    for (const item of items) {
      const preview = await this.preview.run(await this.change(item, "deletePermanently"));
      if (!preview.ok) throw new RecordWriteError(CustomErrorCode.trashChanged, "conflict");
      const removed = preview.data.deletion?.removed;
      if (!removed) continue;
      if (item.kind === "list" && removed.records) {
        removedRecords.push({
          typeId: item.targetId,
          label: model.types.find((type) => type.id === item.targetId)?.pluralLabel ?? item.label,
          count: removed.records,
        });
      }
      removedLinks = removedLinks === null || removed.links === null ? null : removedLinks + removed.links;
    }
    return { removedRecords, removedLinks };
  }

  async purge(items: TrashItem[]): Promise<void> {
    for (const item of [...items].sort((left, right) => ORDER[right.kind] - ORDER[left.kind])) {
      const applied = await this.apply.run(await this.change(item, "deletePermanently"));
      if (!applied.ok) throw new RecordWriteError(CustomErrorCode.trashChanged, "conflict");
    }
  }
}
