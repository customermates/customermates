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
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { PrismaIncomingWebhookRepo } = await import("../prisma-incoming-webhook.repository");
const { PrismaPublicFormRepo } = await import("@/features/public-form/prisma-public-form.repository");
const { createMapping } = await import("./incoming-webhook-fixtures");
const { createConfig } = await import("@/features/public-form/__tests__/public-form-fixtures");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describeDatabase("handing a creator's forms and incoming webhooks to another member", { timeout: 60_000 }, () => {
  async function seed() {
    const w = await createRestRouteWorkspace();
    cleanups.push(w.cleanup);
    const otherWorkspace = await createRestRouteWorkspace();
    cleanups.push(otherWorkspace.cleanup);
    const createWebhook = (workspace: typeof w, createdById: string, name: string) =>
      runWithoutTenant(() =>
        prisma.incomingWebhook.create({
          data: {
            companyId: workspace.companyId,
            typeId: workspace.id("organization"),
            name,
            createdById,
            mapping: createMapping(),
          },
        }),
      );
    const createForm = (workspace: typeof w, createdById: string, name: string, typeKey: string) =>
      runWithoutTenant(() =>
        prisma.publicForm.create({
          data: {
            companyId: workspace.companyId,
            typeId: workspace.id(typeKey),
            name,
            createdById,
            config: createConfig() as never,
          },
        }),
      );
    return { w, otherWorkspace, createWebhook, createForm };
  }

  it("moves only the leavers' webhooks and forms of that workspace to the successor", async () => {
    const { w, otherWorkspace, createWebhook, createForm } = await seed();
    const leaving = await createWebhook(w, w.member.id, "Leaving");
    const staying = await createWebhook(w, w.admin.id, "Staying");
    const elsewhere = await createWebhook(otherWorkspace, otherWorkspace.member.id, "Elsewhere");
    const leavingForm = await createForm(w, w.member.id, "Leaving form", "organization");
    const stayingForm = await createForm(w, w.admin.id, "Staying form", "contact");

    const handOver = { companyId: w.companyId, fromUserIds: [w.member.id], toUserId: w.admin.id };
    const webhooks = await runWithoutTenant(() => new PrismaIncomingWebhookRepo().reassignCreatorUnscoped(handOver));
    const forms = await runWithoutTenant(() => new PrismaPublicFormRepo().reassignCreatorUnscoped(handOver));

    expect({ webhooks, forms }).toEqual({ webhooks: 1, forms: 1 });
    const select = { id: true, createdById: true } as const;
    const ownersOf = (rows: { id: string; createdById: string }[]) =>
      Object.fromEntries(rows.map((row) => [row.id, row.createdById]));
    const webhookRows = await runWithoutTenant(() =>
      prisma.incomingWebhook.findMany({ where: { id: { in: [leaving.id, staying.id, elsewhere.id] } }, select }),
    );
    const formRows = await runWithoutTenant(() =>
      prisma.publicForm.findMany({ where: { id: { in: [leavingForm.id, stayingForm.id] } }, select }),
    );
    expect(ownersOf(webhookRows)).toEqual({
      [leaving.id]: w.admin.id,
      [staying.id]: w.admin.id,
      [elsewhere.id]: otherWorkspace.member.id,
    });
    expect(ownersOf(formRows)).toEqual({
      [leavingForm.id]: w.admin.id,
      [stayingForm.id]: w.admin.id,
    });
  });

  it("changes nothing for an empty list of leavers", async () => {
    const { w } = await seed();

    const handOver = { companyId: w.companyId, fromUserIds: [], toUserId: w.admin.id };

    expect(await runWithoutTenant(() => new PrismaIncomingWebhookRepo().reassignCreatorUnscoped(handOver))).toBe(0);
    expect(await runWithoutTenant(() => new PrismaPublicFormRepo().reassignCreatorUnscoped(handOver))).toBe(0);
  });

  it("rebinds a webhook to the member who re-enables it and keeps the creator when it is disabled", async () => {
    const { w, createWebhook } = await seed();
    const webhook = await createWebhook(w, w.member.id, "Paused creator");
    const repo = new PrismaIncomingWebhookRepo();

    const disabled = await runWithTenant(w.admin, () => repo.updateWebhook(webhook.id, { enabled: false }));
    expect(disabled).toMatchObject({ enabled: false, createdById: w.member.id });

    const enabled = await runWithTenant(w.admin, () => repo.updateWebhook(webhook.id, { enabled: true }));
    expect(enabled).toMatchObject({ enabled: true, createdById: w.admin.id });

    const renamed = await runWithTenant(w.member, () => repo.updateWebhook(webhook.id, { name: "Renamed" }));
    expect(renamed).toMatchObject({ name: "Renamed", createdById: w.admin.id });
  });
});
