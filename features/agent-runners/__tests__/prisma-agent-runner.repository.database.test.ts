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
const { PrismaAgentRunnerRepo } = await import("../prisma-agent-runner.repository");
const { generateAgentRunnerToken, hashAgentRunnerToken } = await import("../agent-runner-token");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;

async function workspace(): Promise<Workspace> {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

function asAdmin<T>(w: Workspace, fn: () => Promise<T>): Promise<T> {
  return runWithTenant(w.admin, fn);
}

function queueRunnerJob(w: Workspace, overrides: { status?: "queued" | "claimed"; ownerUserId?: string } = {}) {
  return runWithoutTenant(() =>
    prisma.agentJob.create({
      data: {
        companyId: w.companyId,
        runtime: "runner",
        status: overrides.status ?? "queued",
        sourceKind: "test",
        ownerUserId: overrides.ownerUserId ?? w.admin.id,
        prompt: "Summarise the open deals",
      },
    }),
  );
}

function addRunner(w: Workspace, seenAgoMs: number | null, revoked = false) {
  return runWithoutTenant(() =>
    prisma.agentRunner.create({
      data: {
        companyId: w.companyId,
        createdById: w.admin.id,
        name: "Runner",
        tokenHash: hashAgentRunnerToken(generateAgentRunnerToken()),
        lastSeenAt: seenAgoMs === null ? null : new Date(Date.now() - seenAgoMs),
        revokedAt: revoked ? new Date() : null,
      },
    }),
  );
}

describeDatabase("PrismaAgentRunnerRepo", { timeout: 60_000 }, () => {
  it("creates and lists runners of the acting workspace only", async () => {
    const mine = await workspace();
    const other = await workspace();
    const token = generateAgentRunnerToken();

    const created = await asAdmin(mine, () =>
      new PrismaAgentRunnerRepo().createRunner({ name: "Office laptop", tokenHash: hashAgentRunnerToken(token) }),
    );
    const listedByMine = await asAdmin(mine, () => new PrismaAgentRunnerRepo().listRunners());
    const listedByOther = await asAdmin(other, () => new PrismaAgentRunnerRepo().listRunners());

    expect(created).toMatchObject({ name: "Office laptop", machine: null, lastSeenAt: null, revokedAt: null });
    expect(created.clients).toEqual([]);
    expect(listedByMine.map((runner) => runner.id)).toEqual([created.id]);
    expect(listedByOther).toEqual([]);
    expect(JSON.stringify(listedByMine)).not.toContain(hashAgentRunnerToken(token));
  });

  it("revokes only inside the workspace and keeps the first revocation time", async () => {
    const mine = await workspace();
    const other = await workspace();
    const runner = await addRunner(mine, null);
    const first = new Date("2026-11-17T09:00:00.000Z");
    const second = new Date("2026-11-17T10:00:00.000Z");

    expect(await asAdmin(other, () => new PrismaAgentRunnerRepo().revokeRunner(runner.id, first))).toBeNull();
    expect(await asAdmin(mine, () => new PrismaAgentRunnerRepo().revokeRunner(runner.id, first))).toEqual(first);
    expect(await asAdmin(mine, () => new PrismaAgentRunnerRepo().revokeRunner(runner.id, second))).toEqual(first);
    const stored = await runWithoutTenant(() => prisma.agentRunner.findUnique({ where: { id: runner.id } }));
    expect(stored?.revokedAt).toEqual(first);
  });

  it("finds a runner by the hash of its token across workspaces and reports a workspace being deleted", async () => {
    const w = await workspace();
    const token = generateAgentRunnerToken();
    const runner = await runWithoutTenant(() =>
      prisma.agentRunner.create({
        data: {
          companyId: w.companyId,
          createdById: w.admin.id,
          name: "Runner",
          tokenHash: hashAgentRunnerToken(token),
        },
      }),
    );
    const repo = new PrismaAgentRunnerRepo();

    const found = await repo.findRunnerByTokenHashUnscoped(hashAgentRunnerToken(token));
    expect(found).toMatchObject({ id: runner.id, companyId: w.companyId, company: { deletingAt: null } });
    expect(await repo.findRunnerByTokenHashUnscoped(hashAgentRunnerToken(generateAgentRunnerToken()))).toBeNull();

    await runWithoutTenant(() =>
      prisma.company.update({ where: { id: w.companyId }, data: { deletingAt: new Date() } }),
    );
    expect((await repo.findRunnerByTokenHashUnscoped(hashAgentRunnerToken(token)))?.company.deletingAt).toBeInstanceOf(
      Date,
    );
  });

  it("records a heartbeat for a live runner and ignores a revoked one", async () => {
    const w = await workspace();
    const live = await addRunner(w, null);
    const revoked = await addRunner(w, null, true);
    const at = new Date("2026-11-17T09:00:00.000Z");
    const repo = new PrismaAgentRunnerRepo();
    const heartbeat = { machine: "ws-main", clients: [{ name: "claude" as const, version: "2.1.0" }], at };

    await repo.recordHeartbeatUnscoped(live.id, heartbeat);
    await repo.recordHeartbeatUnscoped(revoked.id, heartbeat);
    await repo.recordHeartbeatUnscoped(live.id, { machine: undefined, clients: [], at: new Date(at.getTime() + 1000) });

    const liveRow = await runWithoutTenant(() => prisma.agentRunner.findUnique({ where: { id: live.id } }));
    const revokedRow = await runWithoutTenant(() => prisma.agentRunner.findUnique({ where: { id: revoked.id } }));
    expect(liveRow).toMatchObject({ machine: "ws-main", clients: [], lastSeenAt: new Date(at.getTime() + 1000) });
    expect(revokedRow?.lastSeenAt).toBeNull();
  });

  it("touches only the last seen time", async () => {
    const w = await workspace();
    const runner = await addRunner(w, null);
    const at = new Date("2026-11-17T09:00:00.000Z");

    await new PrismaAgentRunnerRepo().touchRunnerUnscoped(runner.id, at);

    const row = await runWithoutTenant(() => prisma.agentRunner.findUnique({ where: { id: runner.id } }));
    expect(row).toMatchObject({ lastSeenAt: at, machine: null, clients: [] });
  });
});

describeDatabase("PrismaAgentRunnerRepo.findOfflineWorkspacesUnscoped", { timeout: 60_000 }, () => {
  const seenSince = () => new Date(Date.now() - 10 * 60_000);
  const find = (companyId: string) =>
    new PrismaAgentRunnerRepo()
      .findOfflineWorkspacesUnscoped({ seenSince: seenSince() })
      .then((all) => all.find((entry) => entry.companyId === companyId));

  it("reports a workspace with a queued runner job and no runner", async () => {
    const w = await workspace();
    await queueRunnerJob(w);
    await queueRunnerJob(w);

    expect(await find(w.companyId)).toEqual({
      companyId: w.companyId,
      owners: [{ userId: w.admin.id, displayLanguage: expect.any(String) }],
    });
  });

  it("reports one owner entry per distinct job owner", async () => {
    const w = await workspace();
    await queueRunnerJob(w);
    await queueRunnerJob(w, { ownerUserId: w.member.id });

    const entry = await find(w.companyId);

    expect(entry?.owners.map((owner) => owner.userId).sort()).toEqual([w.admin.id, w.member.id].sort());
  });

  it("does not report a workspace whose runner was seen in the last ten minutes", async () => {
    const w = await workspace();
    await queueRunnerJob(w);
    await addRunner(w, 60_000);

    expect(await find(w.companyId)).toBeUndefined();
  });

  it("reports a workspace whose runner was last seen long ago, never seen or revoked", async () => {
    const stale = await workspace();
    await queueRunnerJob(stale);
    await addRunner(stale, 11 * 60_000);
    const never = await workspace();
    await queueRunnerJob(never);
    await addRunner(never, null);
    const revoked = await workspace();
    await queueRunnerJob(revoked);
    await addRunner(revoked, 1_000, true);

    expect(await find(stale.companyId)).toBeDefined();
    expect(await find(never.companyId)).toBeDefined();
    expect(await find(revoked.companyId)).toBeDefined();
  });

  it("ignores jobs that are no longer queued, other runtimes, a workspace being deleted and an inactive owner", async () => {
    const claimed = await workspace();
    await queueRunnerJob(claimed, { status: "claimed" });
    const mate = await workspace();
    await runWithoutTenant(() =>
      prisma.agentJob.create({
        data: {
          companyId: mate.companyId,
          runtime: "mate",
          sourceKind: "test",
          ownerUserId: mate.admin.id,
          prompt: "x",
        },
      }),
    );
    const deleting = await workspace();
    await queueRunnerJob(deleting);
    await runWithoutTenant(() =>
      prisma.company.update({ where: { id: deleting.companyId }, data: { deletingAt: new Date() } }),
    );
    const inactive = await workspace();
    await queueRunnerJob(inactive, { ownerUserId: inactive.member.id });
    await runWithoutTenant(() =>
      prisma.user.update({ where: { id: inactive.member.id }, data: { status: "inactive" } }),
    );

    expect(await find(claimed.companyId)).toBeUndefined();
    expect(await find(mate.companyId)).toBeUndefined();
    expect(await find(deleting.companyId)).toBeUndefined();
    expect(await find(inactive.companyId)).toBeUndefined();
  });
});
