import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { RestRouteWorkspace } from "@/tests/helpers/rest-route-workspace";

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
const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { getDataViewStateRepo, getEntitlementService, getMessagingRepo, getQueryParamsPrecheck } = await import(
  "@/core/di"
);
const { GetMessagingThreadsInteractor } = await import("../get-messaging-threads.interactor");
const { getMessagingThreadsTool } = await import("@/features/mcp-tools/messaging.mcp-tools");
const { executeMcpTool } = await import("@/features/mcp-tools/mcp-tool");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const search = await restRoute("/v1/messaging/threads/search");
const providerFilter = (count: number) => ({
  filters: [{ field: "provider", operator: "in", value: Array.from({ length: count }, () => "mail") }],
});
let w: RestRouteWorkspace;

describeDatabase("messaging thread query budget at the interactor boundary", () => {
  beforeAll(async () => {
    w = await createRestRouteWorkspace();
    await runWithoutTenant(() =>
      prisma.subscription.create({ data: { companyId: w.companyId, plan: "enterprise", status: "active" } }),
    );
  });

  afterAll(async () => {
    await w?.cleanup();
  });

  it("answers a 101-value provider filter with a structured 400 on REST and succeeds with 100 values", async () => {
    const refused = await postAs(w, w.admin, search, providerFilter(101));
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(refused.body.error.issues[0]).toMatchObject({ customCode: "recordCalculationBudget" });

    const accepted = await postAs(w, w.admin, search, providerFilter(100));
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
  });

  it("refuses the same filter through MCP with the same structured failure", async () => {
    const refused = await w.as(w.admin, () =>
      executeMcpTool(getMessagingThreadsTool, [getMessagingThreadsTool.inputSchema.parse(providerFilter(101))]),
    );
    expect(refused).toMatchObject({
      ok: false,
      failure: { kind: "validation", issues: [expect.objectContaining({ customCode: "recordCalculationBudget" })] },
    });

    const accepted = await w.as(w.admin, () =>
      executeMcpTool(getMessagingThreadsTool, [getMessagingThreadsTool.inputSchema.parse(providerFilter(100))]),
    );
    expect(accepted.ok).toBe(true);
  });

  it("lets an unexpected repository error escape instead of converting it", async () => {
    const failure = new Error("database went away");
    const repo = getMessagingRepo();
    vi.spyOn(repo, "getItems").mockRejectedValue(failure);
    const interactor = new GetMessagingThreadsInteractor(
      repo,
      getDataViewStateRepo(),
      "api",
      getQueryParamsPrecheck(),
      getEntitlementService(),
    );

    await expect(w.as(w.admin, () => interactor.invoke({}))).rejects.toThrow("database went away");
  });
});
