import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PermissionService } = await import("@/core/base/permission.service");
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { PrismaBillingUsageRepo } = await import("@/features/billing-usage/prisma-billing-usage.repository");
const { PrismaRecordRecipientRepo } = await import("@/features/records/prisma-record-recipient.repository");
const { RecordRecipientAccess } = await import("../automation-recipient-access");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describeDatabase("record access of the recipients of a notify step", () => {
  const reader = new RecordRecipientAccess(
    (companyId) => createTestRecordRepo(companyId),
    new PrismaRecordRecipientRepo(new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo())),
  );

  it("reads the record as each recipient, not as the rule owner", async () => {
    const w = await createRestRouteWorkspace();
    cleanups.push(w.cleanup);
    const deal = await w.create("deal", "deal.name", "Acme renewal");
    const access = (ref = deal, userIds = [w.admin.id, w.member.id]) =>
      runWithoutTenant(() => reader.recordAccess({ companyId: w.companyId, ref, userIds }));

    expect(await access()).toEqual(
      new Map([
        [w.admin.id, "name"],
        [w.member.id, "none"],
      ]),
    );

    await w.grant("deal", ["create", "readOwn"]);
    expect((await access()).get(w.member.id)).toBe("none");
    const own = await w.create("deal", "deal.name", "Member deal", w.member);
    expect((await access(own)).get(w.member.id)).toBe("name");

    await w.grant("deal", ["readAll"]);
    expect((await access()).get(w.member.id)).toBe("name");

    const stranger = randomUUID();
    expect(await access(deal, [stranger, stranger])).toEqual(new Map([[stranger, "none"]]));
    await runWithoutTenant(() => prisma.user.update({ where: { id: w.member.id }, data: { status: "inactive" } }));
    expect((await access()).get(w.member.id)).toBe("none");
  });

  it("answers none for a record of another workspace or one that does not exist", async () => {
    const [first, second] = [await createRestRouteWorkspace(), await createRestRouteWorkspace()];
    cleanups.push(first.cleanup, second.cleanup);
    const foreign = await second.create("deal", "deal.name", "Foreign deal");
    const read = (recordId: string) =>
      runWithoutTenant(() =>
        reader.recordAccess({
          companyId: first.companyId,
          ref: { typeId: first.id("deal"), recordId },
          userIds: [first.admin.id],
        }),
      );
    expect((await read(foreign.recordId)).get(first.admin.id)).toBe("none");
    expect((await read(randomUUID())).get(first.admin.id)).toBe("none");
  });
});
