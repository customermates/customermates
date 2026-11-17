import { randomUUID } from "node:crypto";

import type { RecordRef } from "@/features/records/record-model.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { Action, Resource } from "@/generated/prisma";

export async function createAutomationWorkspace() {
  const { runInTransaction } = await import("@/core/decorators/transaction-runner");
  const { PermissionService } = await import("@/core/base/permission.service");
  const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
  const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
  const { createTestAutomationRuleRepo } = await import("@/tests/helpers/record-delivery");
  const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
  const { PrismaBillingUsageRepo } = await import("@/features/billing-usage/prisma-billing-usage.repository");
  const { PrismaRecordRecipientRepo } = await import("@/features/records/prisma-record-recipient.repository");
  const { RecordAccessPolicy } = await import("@/features/records/record-access");
  const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
  const { RecordWriteService } = await import("@/features/records/record-write.service");
  const { RecordTrashService } = await import("@/features/records/record-trash.service");
  const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
  const { GetRecordInteractor } = await import("@/features/records/get-record.interactor");
  const { GetRecordModelInteractor } = await import("@/features/records/get-record-model.interactor");
  const { RecordAutomationPort } = await import("../record-automation.port");
  const { ReadableDateCandidates } = await import("../automation-date-candidates");

  const w = await createRestRouteWorkspace();
  const typeId = w.id("deal");
  const nameFieldId = w.id("deal.name");
  const closesFieldId = w.id("deal.closes");
  const records = createTestRecordRepo();
  const users = new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo());
  const policy = new RecordAccessPolicy(users, records);
  const calculation = new RecordCalculationService(records);
  const mutate = new MutateRecordInteractor(
    records,
    policy,
    new RecordWriteService(records, policy, calculation),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(records, calculation),
  );
  const read = new GetRecordInteractor(records, policy);
  const port = new RecordAutomationPort(new GetRecordModelInteractor(records, policy), read, mutate);
  const rules = createTestAutomationRuleRepo();
  const candidates = new ReadableDateCandidates(
    (companyId) => createTestRecordRepo(companyId),
    new PrismaRecordRecipientRepo(users),
    rules,
  );

  await w.as(w.admin, async () => {
    const current = await records.getModel();
    const closes: (typeof current.fields)[number] = {
      id: closesFieldId,
      typeId,
      label: "Closes",
      valueType: "date",
      behavior: { kind: "input" },
      required: false,
      archived: false,
      publishedSummary: false,
      options: [],
      position: current.fields.filter((field) => field.typeId === typeId).length,
    };
    const model = { ...current, revision: current.revision + 1, fields: [...current.fields, closes] };
    await runInTransaction(() => records.saveModel(model, w.admin.id), { timeout: 30000 });
  });

  const automationUser = (user: TenantUser): TenantUser =>
    user.role?.isSystemRole
      ? user
      : ({
          ...user,
          role: {
            ...user.role,
            permissions: [Action.readOwn, Action.create, Action.update, Action.delete].map((action, index) => ({
              id: `automation-permission-${index}`,
              resource: Resource.routines,
              action,
            })),
          },
        } as TenantUser);

  const createDeal = async (name: string, closes: string, user: TenantUser = w.admin): Promise<RecordRef> => {
    const expectedRevision = await w.revision();
    const result = await w.as(user, () =>
      mutate.invoke({
        expectedRevision,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId,
          fields: [
            { fieldId: nameFieldId, value: { kind: "text", value: name } },
            { fieldId: closesFieldId, value: { kind: "date", value: closes } },
          ],
          ...(user === w.admin ? {} : { assignedUserIds: [user.id] }),
        },
      }),
    );
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    return result.data.refs.find((ref) => ref.typeId === typeId) as RecordRef;
  };

  const readDeal = async (ref: RecordRef, user: TenantUser = w.admin) => {
    const result = await w.as(user, () => read.invoke(ref));
    if (!result.ok) throw new Error("The deal is not readable");
    return result.data;
  };

  return {
    ...w,
    typeId,
    nameFieldId,
    closesFieldId,
    port,
    rules,
    candidates,
    automationUser,
    createDeal,
    readDeal,
  };
}

export type AutomationWorkspace = Awaited<ReturnType<typeof createAutomationWorkspace>>;
