import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { TenantUser } from "@/features/user/user.schema";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
    HOSTED_AI_PROVIDER_WORK_PAUSED: false,
    HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS: 1_000_000_000_000_000n,
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("@/core/utils/background-task.service", () => ({
  BackgroundTaskService: class {
    dispatch = () => Promise.resolve();
    dispatchTracked = () => Promise.resolve(randomUUID());
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const di = await import("@/core/di");
const { agencyPlan } = await import("@/features/workspace-setup/__tests__/setup-plan-fixtures");
const { SetupPlanSchema } = await import("@/features/workspace-setup/setup-plan.schema");
const { emptySetupPhase } = await import("../workspace-setup-phases");
const { notifyWorkspaceSetupOnce } = await import("../workspace-setup-notice-marker");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

type Workspace = { companyId: string; owner: TenantUser; run: <T>(fn: () => Promise<T>) => Promise<T> };

async function workspace(): Promise<Workspace> {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const admin = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Ada",
        lastName: "Owner",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, admin };
  });
  const owner = createMockUser({ ...seed.admin, role: { ...seed.role, permissions: [] } });
  return { companyId: seed.company.id, owner, run: (fn) => runWithTenant(owner, fn) };
}

async function buildingSetup(ws: Workspace) {
  return runWithoutTenant(async () => {
    const crawl = await prisma.wikiWebsiteCrawl.create({
      data: {
        companyId: ws.companyId,
        userId: ws.owner.id,
        clientRequestId: randomUUID(),
        homepageUrl: "https://studio.example/",
        registrableDomain: "studio.example",
        locale: "en",
        payer: "workspaceSetup",
        status: "synthesizing",
        targets: [{ url: "https://studio.example/", category: "about", status: "read" }],
      },
    });
    const setup = await prisma.workspaceSetup.create({
      data: {
        companyId: ws.companyId,
        userId: ws.owner.id,
        status: "building",
        crawlId: crawl.id,
        plan: SetupPlanSchema.parse(agencyPlan),
        planRevision: 1,
        confirmedAt: new Date(),
        phases: {
          knowledgeBase: emptySetupPhase(),
          dataModel: emptySetupPhase(),
          views: emptySetupPhase(),
          records: emptySetupPhase(),
          dashboard: emptySetupPhase(),
        },
      },
    });
    return setup.id;
  });
}

describeDatabase("workspace setup build claims against the database", { timeout: 60_000 }, () => {
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("lets exactly one of two concurrent runs claim a phase and keeps the other out", async () => {
    const ws = await workspace();
    const setupId = await buildingSetup(ws);
    const service = di.getWorkspaceSetupBuildService();

    const results = await Promise.all([
      ws.run(() => service.runPhase(setupId, "knowledgeBase", false, "run-a")),
      ws.run(() => service.runPhase(setupId, "knowledgeBase", false, "run-b")),
    ]);
    expect([...results].sort()).toEqual(["busy", "wait"]);
    const winner = results[0] === "wait" ? "run-a" : "run-b";
    const loser = winner === "run-a" ? "run-b" : "run-a";
    const stored = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(stored?.phases.knowledgeBase).toMatchObject({ status: "running", attempts: 1, claimToken: winner });

    expect(await ws.run(() => service.runPhase(setupId, "knowledgeBase", false, loser))).toBe("busy");
    expect(await ws.run(() => service.runPhase(setupId, "knowledgeBase", false, winner))).toBe("wait");

    await ws.run(() => service.abandon(setupId, loser));
    expect((await ws.run(() => di.getWorkspaceSetupRepo().get(setupId)))?.phases.knowledgeBase?.status).toBe("running");
    await ws.run(() => service.abandon(setupId, winner));
    const released = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(released?.phases.knowledgeBase).toMatchObject({ status: "failed", error: "error", claimedAt: null });
    expect(released?.phases.knowledgeBase).not.toHaveProperty("claimToken");
  });

  it("finds a Knowledge Base page created after a recorded intent by its title", async () => {
    const ws = await workspace();
    const before = new Date(Date.now() - 1_000);
    const created = await ws.run(() =>
      di.getCreateWikiPagesInteractor().invoke({
        requireEmpty: false,
        pages: [{ title: "How we work", kind: "knowledge", markdown: "We work in sprints." }],
      }),
    );
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    const repo = di.getWorkspaceSetupRepo();

    expect(await ws.run(() => repo.findWikiPageCreatedSince("How we work", before))).toBe(created.data[0].id);
    expect(await ws.run(() => repo.findWikiPageCreatedSince("How we work", new Date(Date.now() + 60_000)))).toBeNull();
    expect(await ws.run(() => repo.findWikiPageCreatedSince("Another page", before))).toBeNull();
    const other = await workspace();
    expect(
      await other.run(() => di.getWorkspaceSetupRepo().findWikiPageCreatedSince("How we work", before)),
    ).toBeNull();
  });

  it("stores which notice was sent on the setup, so a repeated notify step sends nothing", async () => {
    const ws = await workspace();
    const setupId = await buildingSetup(ws);
    await runWithoutTenant(() =>
      prisma.workspaceSetup.update({ where: { id: setupId }, data: { status: "failed", finishedAt: new Date() } }),
    );
    const notifier = { send: vi.fn(() => Promise.resolve(true)) };
    const repo = di.getWorkspaceSetupRepo();

    expect(await ws.run(() => notifyWorkspaceSetupOnce(repo, notifier, setupId, "build"))).toBe("workspaceFailed");
    expect(await ws.run(() => notifyWorkspaceSetupOnce(repo, notifier, setupId, "build"))).toBeNull();
    expect(notifier.send).toHaveBeenCalledExactlyOnceWith("workspaceFailed");
  });
});
