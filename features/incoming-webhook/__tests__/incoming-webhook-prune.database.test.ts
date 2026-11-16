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
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { PrismaIncomingWebhookRepo } = await import("../prisma-incoming-webhook.repository");
const { PruneIncomingWebhookDeliveriesInteractor } = await import("../prune-incoming-webhook-deliveries.interactor");
const { createMapping } = await import("./incoming-webhook-fixtures");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

const DAY_MS = 86_400_000;

describeDatabase("pruning incoming webhook deliveries", { timeout: 60_000 }, () => {
  it("deletes the deliveries older than the retention window of every workspace and keeps the rest", async () => {
    const first = await createRestRouteWorkspace();
    const second = await createRestRouteWorkspace();
    cleanups.push(first.cleanup, second.cleanup);
    const now = new Date("2026-11-16T09:00:00.000Z");
    const at = (days: number) => new Date(now.getTime() - days * DAY_MS);

    const seed = async (w: typeof first, ages: number[]) => {
      const webhook = await runWithoutTenant(() =>
        prisma.incomingWebhook.create({
          data: {
            companyId: w.companyId,
            typeId: w.id("organization"),
            name: "Signups",
            createdById: w.admin.id,
            mapping: createMapping(),
          },
        }),
      );
      return Promise.all(
        ages.map((age) =>
          runWithoutTenant(() =>
            prisma.incomingWebhookDelivery.create({
              data: {
                companyId: w.companyId,
                webhookId: webhook.id,
                outcome: "created",
                statusCode: 201,
                payloadBytes: 2,
                createdAt: at(age),
              },
            }),
          ),
        ),
      );
    };
    const [old1, recent1, old2] = [...(await seed(first, [31, 5])), ...(await seed(second, [45]))];

    const repo = new PrismaIncomingWebhookRepo();
    const interactor = new PruneIncomingWebhookDeliveriesInteractor(repo);

    expect(await runWithoutTenant(() => repo.deleteDeliveriesBeforeUnscoped(at(30), 1))).toBe(1);
    expect(await runWithoutTenant(() => interactor.invoke({ now }))).toEqual({ pruned: 1 });
    expect(await runWithoutTenant(() => interactor.invoke({ now }))).toEqual({ pruned: 0 });

    const left = await runWithoutTenant(() =>
      prisma.incomingWebhookDelivery.findMany({
        where: { id: { in: [old1.id, recent1.id, old2.id] } },
        select: { id: true },
      }),
    );
    expect(left.map((delivery) => delivery.id)).toEqual([recent1.id]);
  });
});
