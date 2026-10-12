import type { Action } from "@/generated/prisma";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { createMockUser } from "./mock-user";

type RouteHandler = (request: NextRequest) => Promise<Response>;

export type RouteResult = { status: number; body: any };

/**
 * A disposable workspace for database tests that call REST route handlers as a tenant: an administrator with the
 * system role, a member whose custom role holds no system permissions, and the starter record types.
 * Callers mock `@/env` and `next-intl/server` the way the record database tests do.
 */
export async function createRestRouteWorkspace() {
  const { prisma } = await import("@/prisma/db");
  const { runWithTenant, runWithoutTenant } = await import(
    "@/core/decorators/tenant-context"
  );
  const { runInTransaction } = await import(
    "@/core/decorators/transaction-runner"
  );
  const { PermissionService } = await import("@/core/base/permission.service");
  const { PrismaRecordRepo } = await import(
    "@/features/records/prisma-record.repository"
  );
  const { PrismaUserRepo } = await import(
    "@/features/user/prisma-user.repository"
  );
  const { RecordAccessPolicy } = await import(
    "@/features/records/record-access"
  );
  const { RecordCalculationService } = await import(
    "@/features/records/record-calculation.service"
  );
  const { RecordWriteService } = await import(
    "@/features/records/record-write.service"
  );
  const { MutateRecordInteractor } = await import(
    "@/features/records/mutate-record.interactor"
  );
  const { RecordTrashService } = await import("@/features/records/record-trash.service");
  const { GetRecordInteractor } = await import(
    "@/features/records/get-record.interactor"
  );
  const { createCrmPreset, presetId } = await import(
    "@/features/records/crm-preset"
  );

  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    const adminRole = await prisma.userRole.create({
      data: {
        companyId: company.id,
        name: "Administrator",
        isSystemRole: true,
      },
    });
    const memberRole = await prisma.userRole.create({
      data: { companyId: company.id, name: "Member" },
    });
    const [admin, member] = await Promise.all(
      [adminRole, memberRole].map((role, index) =>
        prisma.user.create({
          data: {
            companyId: company.id,
            roleId: role.id,
            firstName: index ? "Member" : "Admin",
            lastName: "Test",
            email: `${randomUUID()}@example.test`,
            status: "active",
          },
        }),
      ),
    );
    return { company, adminRole, memberRole, admin, member };
  });
  const companyId = seed.company.id;
  const admin: TenantUser = createMockUser({
    ...seed.admin,
    role: { ...seed.adminRole, permissions: [] },
  });
  const member: TenantUser = createMockUser({
    ...seed.member,
    role: { ...seed.memberRole, permissions: [] },
  });
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(
    new PrismaUserRepo(new PermissionService()),
    repo,
  );
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    {
      dispatch: () => Promise.resolve(),
    },
    new RecordTrashService(repo),
  );
  const read = new GetRecordInteractor(repo, policy);
  const id = (key: string) => presetId(companyId, key);
  const as = <T>(user: TenantUser, fn: () => Promise<T>) =>
    runWithTenant(user, fn);

  await as(admin, () =>
    runInTransaction(
      () => repo.saveModel(createCrmPreset(companyId), admin.id),
      { timeout: 30000 },
    ),
  );

  const revision = () =>
    runWithoutTenant(() =>
      prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } }),
    ).then((state) => state.revision);
  const mutation = async (value: RecordMutation, user: TenantUser = admin) => {
    const expectedRevision = await revision();
    const result = await as(user, () =>
      mutate.invoke({
        mutation: value,
        expectedRevision,
        idempotencyKey: randomUUID(),
      }),
    );
    if (!result.ok || result.data.status !== "completed")
      throw new Error(JSON.stringify(result));
    return result.data;
  };

  return {
    companyId,
    admin,
    member,
    id,
    as,
    revision,
    grant: (typeKey: string, actions: Action[]) =>
      as(admin, () =>
        runInTransaction(
          () =>
            repo.setGrants(id(typeKey), [
              { roleId: seed.memberRole.id, actions },
            ]),
          {
            timeout: 30000,
          },
        ),
      ),
    create: async (
      typeKey: string,
      fieldKey: string,
      value: string,
      user: TenantUser = admin,
    ) => {
      const result = await mutation(
        {
          action: "create",
          typeId: id(typeKey),
          fields: [{ fieldId: id(fieldKey), value: { kind: "text", value } }],
          ...(user === admin ? {} : { assignedUserIds: [user.id] }),
        },
        user,
      );
      return result.refs.find((ref) => ref.typeId === id(typeKey)) as RecordRef;
    },
    remove: async (ref: RecordRef, user: TenantUser = admin) => {
      const current = await as(user, () => read.invoke(ref));
      if (!current.ok) throw new Error("Record could not be read");
      return mutation(
        { action: "delete", ref, expectedVersion: current.data.version },
        user,
      );
    },
    cleanup: () =>
      runWithoutTenant(() =>
        prisma.company.deleteMany({ where: { id: companyId } }),
      ),
  };
}

export type RestRouteWorkspace = Awaited<
  ReturnType<typeof createRestRouteWorkspace>
>;

/** Calls a REST route handler as the given tenant with a JSON body and returns its status and parsed body. */
export async function postAs(
  workspace: Pick<RestRouteWorkspace, "as">,
  user: TenantUser,
  handler: RouteHandler,
  body: unknown,
): Promise<RouteResult> {
  const response = await workspace.as(user, () =>
    handler(
      new NextRequest("http://127.0.0.1:4000/api/v1/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
  return { status: response.status, body: await response.json() };
}
