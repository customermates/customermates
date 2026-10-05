import { TenantRepository } from "@/core/base/tenant-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Prisma } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError } from "./record-write.service";
import {
  RecordEventSubscriptionSchema,
  type RecordEventSubscriptionDefinition,
} from "./record-event-subscription.schema";
import { recordEventSubscriptionIsValid } from "./record-event-subscription-validation";
import type { RecordRepo } from "./record.repo";
import type { RecordEventSubscriptionRepo } from "./record-event-subscription.repo";
import { recordAccessForActor } from "./record-access";
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

export class PrismaRecordEventSubscriptionRepo extends TenantRepository implements RecordEventSubscriptionRepo {
  constructor(private readonly records: RecordRepo) {
    super();
  }
  @BypassTenantGuard
  async findCompanyWide(companyId: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.recordEventSubscription.findMany({ where: { companyId, id: { in: ids } } });
    return rows.map(({ companyId: _companyId, ...row }) => RecordEventSubscriptionSchema.parse(row));
  }

  @Transaction
  async save(definition: Omit<RecordEventSubscriptionDefinition, "revision">, expectedSchemaRevision?: number) {
    const input = RecordEventSubscriptionSchema.parse({ ...definition, revision: 1 });
    const records = this.records;
    const companyId = this.companyId;
    const actor = await this.prisma.user.findFirst({
      where: { companyId, id: this.userId, status: "active", role: { companyId } },
      select: {
        id: true,
        status: true,
        role: {
          select: {
            id: true,
            companyId: true,
            isSystemRole: true,
            permissions: { where: { companyId }, select: { resource: true, action: true } },
          },
        },
      },
    });
    const [model, grants, state] = await Promise.all([records.getModel(), records.getGrants(), records.getState()]);
    const policy = recordAccessForActor({ actor, model, grants, records, companyId, userId: this.userId });
    const permitted =
      input.kind === "routine"
        ? policy.allowedSystem("routines", "create") && policy.allowedSystem("routines", "update")
        : policy.allowedSystem("api", "update");
    if (!permitted || (!policy.isAdmin && input.ownerUserId !== this.userId))
      throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
    const [previous] = await this.findCompanyWide(companyId, [input.id]);
    const definitionChanged = !previous || deliveryDefinition(previous) !== deliveryDefinition(input);
    if (state?.activeOperationId && (definitionChanged || (input.enabled && !previous?.enabled)))
      throw new RecordWriteError(CustomErrorCode.recordWritePaused, "conflict");
    if (expectedSchemaRevision !== undefined && expectedSchemaRevision !== model.revision)
      throw new RecordWriteError(CustomErrorCode.recordSchemaChanged, "conflict");
    if (!recordEventSubscriptionIsValid(input, model))
      throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
    const owner = await this.prisma.user.findFirst({
      where: { companyId, id: input.ownerUserId, status: "active" },
      select: { id: true },
    });
    if (!owner) throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
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
}
