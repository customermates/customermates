import { unwindFailure } from "@/core/validation/failure-unwind";
import { CONFIGURATION_CONSUMER_PAGE } from "@/features/records/record.repo";
import { TenantRepository } from "@/core/base/tenant-repository";
import type { RecordSubscriptionConfigurationRepo } from "./record-subscription-configuration.repo";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Prisma } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  RecordEventSubscriptionSchema,
  type RecordEventSubscriptionDefinition,
} from "./record-event-subscription.schema";
import { recordEventSubscriptionIsValid } from "./record-event-subscription-validation";
import type { RecordActorRepo, RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordEventSubscriptionRepo } from "./record-event-subscription.repo";
import { canonicalRecordJson } from "./record-json";

function deliveryDefinition(subscription: RecordEventSubscriptionDefinition) {
  return canonicalRecordJson({
    kind: subscription.kind,
    ownerUserId: subscription.ownerUserId,
    typeId: subscription.typeId,
    events: [...subscription.events].sort(),
    changedFieldIds: [...subscription.changedFieldIds].sort(),
    query: subscription.query,
    sources: subscription.sources ?? null,
  });
}

function readableSubscription(
  subscription: RecordEventSubscriptionDefinition,
  canReadType: (typeId: string) => boolean,
): RecordEventSubscriptionDefinition {
  const sources = subscription.sources?.filter((source) => canReadType(source.query.typeId));
  const triggerHidden = subscription.typeId !== null && !canReadType(subscription.typeId);
  return {
    ...subscription,
    ...(subscription.sources ? { sources: sources?.length ? sources : null } : {}),
    ...(triggerHidden ? { typeId: null, query: null, changedFieldIds: [] } : {}),
  };
}

function unreadableListPath(
  subscription: RecordEventSubscriptionDefinition,
  canReadType: (typeId: string) => boolean,
): Array<string | number> | null {
  const sourceIndex = (subscription.sources ?? []).findIndex((source) => !canReadType(source.query.typeId));
  if (sourceIndex >= 0) return ["recordSources", sourceIndex, "query", "typeId"];
  return subscription.typeId !== null && !canReadType(subscription.typeId)
    ? ["recordTrigger", "query", "typeId"]
    : null;
}

export class PrismaRecordEventSubscriptionRepo
  extends TenantRepository
  implements RecordEventSubscriptionRepo, RecordSubscriptionConfigurationRepo
{
  constructor(
    private readonly records: RecordRepo,
    private readonly policy: RecordAccessPolicy,
    private readonly actors: RecordActorRepo,
    private readonly scopedCompanyId?: string,
  ) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  @BypassTenantGuard
  async findUnscoped(companyId: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.recordEventSubscription.findMany({ where: { companyId, id: { in: ids } } });
    return rows.map(({ companyId: _companyId, ...row }) => RecordEventSubscriptionSchema.parse(row));
  }

  async findReadable(ids: string[]) {
    if (!ids.length) return [];
    const [rows, policy] = await Promise.all([this.findUnscoped(this.companyId, ids), this.policy.load()]);
    return rows.map((row) => readableSubscription(row, policy.canReadType));
  }

  private async actorAccess() {
    const [model, state, policy] = await Promise.all([
      this.records.getModel(),
      this.records.getState(),
      this.policy.load(),
    ]);
    return { model, state, policy };
  }

  @Transaction
  async save(
    definition: Omit<RecordEventSubscriptionDefinition, "revision">,
    action: "create" | "update",
    expectedSchemaRevision?: number,
  ) {
    const input = RecordEventSubscriptionSchema.parse({ ...definition, revision: 1 });
    const companyId = this.companyId;
    const { model, state, policy } = await this.actorAccess();
    if (
      !policy.allowedSystem(input.kind === "routine" ? "routines" : "api", action) ||
      (!policy.isAdmin && input.ownerUserId !== this.userId)
    )
      throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    const [previous] = await this.findUnscoped(companyId, [input.id]);
    const definitionChanged = !previous || deliveryDefinition(previous) !== deliveryDefinition(input);
    if (state?.activeOperationId && (definitionChanged || (input.enabled && !previous?.enabled)))
      throw unwindFailure(CustomErrorCode.recordWritePaused, "conflict");
    if (expectedSchemaRevision !== undefined && expectedSchemaRevision !== model.revision)
      throw unwindFailure(CustomErrorCode.recordSchemaChanged, "conflict");
    if (!recordEventSubscriptionIsValid(input, model)) throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
    const unreadablePath = definitionChanged ? unreadableListPath(input, policy.canReadType) : null;
    if (unreadablePath) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization", unreadablePath);
    const [owner] = await this.actors.findRecordAssigneesCompanyWide([input.ownerUserId]);
    if (!owner) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    const { id, revision, ...data } = input;
    const stored = {
      ...data,
      query: data.query ?? Prisma.DbNull,
      sources: data.sources ? (data.sources as Prisma.InputJsonValue) : Prisma.DbNull,
    };
    await this.prisma.recordEventSubscription.upsert({
      where: { companyId, companyId_id: { companyId, id } },
      create: { companyId, id, revision, ...stored },
      update: { companyId, ...stored, ...(definitionChanged ? { revision: { increment: 1 } } : {}) },
    });
  }

  async remove(id: string) {
    await this.prisma.recordEventSubscription.deleteMany({ where: { companyId: this.companyId, id } });
  }

  async pause(id: string) {
    await this.prisma.recordEventSubscription.updateMany({
      where: { companyId: this.companyId, id },
      data: { enabled: false, revision: { increment: 1 } },
    });
  }

  async resume(id: string) {
    await this.prisma.recordEventSubscription.updateMany({
      where: { companyId: this.companyId, id },
      data: { enabled: true, revision: { increment: 1 } },
    });
  }

  async getPageCompanyWide(companyId: string, afterId?: string) {
    return this.prisma.recordEventSubscription.findMany({
      where: { companyId, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: "asc" },
      take: CONFIGURATION_CONSUMER_PAGE,
    });
  }

  async rewriteCompanyWide(companyId: string, subscription: RecordEventSubscriptionDefinition): Promise<void> {
    const { id, typeId, events, changedFieldIds, query, sources, enabled } = subscription;
    await this.prisma.recordEventSubscription.updateMany({
      where: { companyId, id },
      data: {
        typeId,
        events,
        changedFieldIds,
        query: query === null ? Prisma.DbNull : (query as Prisma.InputJsonValue),
        sources: sources?.length ? (sources as Prisma.InputJsonValue) : Prisma.DbNull,
        enabled,
        revision: { increment: 1 },
      },
    });
  }
}
