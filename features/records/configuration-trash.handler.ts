import { unwindFailure, unwindInteractorFailure } from "@/core/validation/failure-unwind";
import { createHash } from "node:crypto";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { ConfigurationChange, ConfigurationTarget } from "./configuration.schema";
import type { ApplyRecordConfigurationInteractor } from "./configure-records.interactor";
import type { PreviewRecordConfigurationInteractor } from "./preview-record-configuration.interactor";
import type { RecordModel } from "./record-model.schema";
import type { TrashItem, TrashRepo } from "@/features/trash/trash.repo";
import type { TrashKindHandler, TrashKindImpact, TrashKindRestore } from "@/features/trash/trash-kind-handler";
import type { TrashRestoreBlocker } from "@/features/trash/trash.schema";
import type { ConfigurationSystemPurge } from "./configuration-system-purge";

import { Prisma } from "@/generated/prisma";
import { runInSavepoint } from "@/core/decorators/transaction-runner";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DroppedViewReferencesSchema } from "@/features/trash/trash.schema";
import { recordInvariant } from "./record-invariant";
import { isCalculationBudgetExceeded } from "./record-calculation.service";
import { compareRecordKey } from "./record-json";

const CONFIGURATION_KINDS = ["list", "field", "relationship"] as const;
const ORDER: Record<string, number> = { list: 0, relationship: 1, field: 2 };

function droppedViewReferences(item: TrashItem) {
  if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) return [];
  const payload = item.payload as Record<string, unknown>;
  if (!Array.isArray(payload.droppedViewReferences)) return [];
  return payload.droppedViewReferences.flatMap((entry) => {
    const parsed = DroppedViewReferencesSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function targetExists(model: RecordModel, item: TrashItem) {
  if (item.kind === "list") return model.types.some((type) => type.id === item.targetId);
  if (item.kind === "field") return model.fields.some((field) => field.id === item.targetId);
  return model.relationships.some((relation) => relation.id === item.targetId);
}

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
    private trash: Pick<TrashRepo, "remove">,
    private system: ConfigurationSystemPurge,
  ) {}

  async visibility(alias: Prisma.Sql): Promise<Prisma.Sql> {
    const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
    if (!policy.actor || !policy.canManageSchema) return Prisma.sql`FALSE`;
    const archived = model.types.filter((type) => type.archived).map((type) => type.id);
    const outsideDeletedList = archived.length
      ? Prisma.sql`(${alias}."typeId" IS NULL OR ${alias}."typeId" NOT IN (${Prisma.join(archived)}))`
      : Prisma.sql`TRUE`;
    return Prisma.sql`(${alias}.kind IN ('list', 'field', 'relationship') AND (${alias}.kind = 'list' OR ${outsideDeletedList}))`;
  }

  private async change(items: TrashItem[], operation: "restore" | "deletePermanently"): Promise<ConfigurationChange> {
    const revision = (await this.records.getState())?.revision ?? 0;
    const key =
      items.length === 1
        ? recordInvariant(items[0]).id
        : createHash("sha256")
            .update(items.map((item) => item.id).join(":"))
            .digest("hex");
    return {
      expectedRevision: revision,
      idempotencyKey: `trash:${operation}:${key}:${revision}`,
      operations: items.map((item) => ({ operation, target: target(item) })),
    };
  }

  private async restorable(items: TrashItem[]): Promise<{ restorable: TrashItem[]; blocked: TrashRestoreBlocker[] }> {
    const all = await this.preview.run(await this.change(items, "restore"));
    if (all.ok && all.data.valid) return { restorable: items, blocked: [] };
    const restorable: TrashItem[] = [];
    const blockers = new Map<string, TrashRestoreBlocker>();
    let pending = items;
    for (let progressed = true; pending.length && progressed; ) {
      progressed = false;
      const waiting: TrashItem[] = [];
      for (const item of pending) {
        const preview = await this.preview.run(await this.change([...restorable, item], "restore"));
        if (preview.ok && preview.data.valid) {
          restorable.push(item);
          progressed = true;
          continue;
        }
        waiting.push(item);
        blockers.set(item.id, this.blocker(item, preview.ok ? preview.data : null));
      }
      pending = waiting;
    }
    return { restorable, blocked: pending.map((item) => recordInvariant(blockers.get(item.id))) };
  }

  async restore(items: TrashItem[]): Promise<TrashKindRestore> {
    if ((await this.records.getState())?.activeOperationId)
      throw unwindFailure(CustomErrorCode.recordWritePaused, "conflict");
    const newestFirst = [...items].sort(
      (left, right) =>
        right.deletedAt.getTime() - left.deletedAt.getTime() ||
        ORDER[left.kind] - ORDER[right.kind] ||
        compareRecordKey(left.id, right.id),
    );
    const { restorable, blocked } = await this.restorable(newestFirst);
    const result: TrashKindRestore = {
      restoredItemIds: [],
      blocked,
      restoredRecords: 0,
      droppedLinks: 0,
    };
    if (!restorable.length) return result;
    const change = await this.change(restorable, "restore");
    const applied = await runInSavepoint(() => this.applied(change));
    if (!applied.ok && !isCalculationBudgetExceeded(applied.error)) throw applied.error;
    const data = applied.ok ? applied.value : await this.applied(change, { background: true });
    const dropped = restorable.flatMap(droppedViewReferences);
    if (dropped.length) result.droppedViewReferences = dropped;
    if (data.status === "pending") result.operationId = data.operationId;
    else result.restoredItemIds = restorable.map((item) => item.id);
    return result;
  }

  private async applied(change: ConfigurationChange, options?: { background: boolean }) {
    const applied = await this.apply.run(change, options);
    if (!applied.ok) throw unwindInteractorFailure(applied);
    return applied.data;
  }

  private blocker(
    item: TrashItem,
    preview: {
      issues: Array<{ code: string }>;
      deletion?: { blockers: Array<{ reason: string }> };
    } | null,
  ): TrashRestoreBlocker {
    const reason = !preview
      ? "notFound"
      : preview.deletion?.blockers.some((blocker) => blocker.reason === "requiresRestore")
        ? "requiresRestore"
        : preview.issues.some((issue) => issue.code.startsWith("duplicate_"))
          ? "nameTaken"
          : "incompatible";
    return { itemId: item.id, reason, typeId: item.typeId };
  }

  async impact(items: TrashItem[]): Promise<TrashKindImpact> {
    const model = await this.records.getModel();
    const removedRecords: TrashKindImpact["removedRecords"] = [];
    let removedLinks: number | null = 0;
    for (const item of items) {
      const preview = await this.preview.run(await this.change([item], "deletePermanently"));
      if (!preview.ok) continue;
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

  async purge(items: TrashItem[], actorId: string | null, companyId: string): Promise<void> {
    for (const item of [...items].sort((left, right) => ORDER[right.kind] - ORDER[left.kind])) {
      if (!targetExists(await this.records.getModel(), item)) {
        await this.trash.remove([item.id]);
        continue;
      }
      if (actorId === null) {
        await this.system.deletePermanently(item, await this.change([item], "deletePermanently"), companyId);
        continue;
      }
      const applied = await this.apply.run(await this.change([item], "deletePermanently"));
      if (!applied.ok) throw unwindInteractorFailure(applied);
    }
  }
}
