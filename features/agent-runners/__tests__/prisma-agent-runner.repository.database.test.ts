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
const { PrismaAgentJobRepo } = await import("@/features/agent-jobs/prisma-agent-job.repository");
const { QueuedAgentJobRunnerRepo } = await import("../queued-agent-job-runner.repository");
const { AgentRunnerRevocation } = await import("../agent-runner-revocation");
const { generateAgentRunnerToken, hashAgentRunnerToken } = await import("../agent-runner-token");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;
type JobOverrides = {
  status?: "queued" | "claimed" | "running" | "succeeded";
  ownerUserId?: string;
  pinnedRunnerId?: string;
  runnerId?: string;
  attempts?: number;
  createdAt?: Date;
};

async function workspace(): Promise<Workspace> {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

function asAdmin<T>(w: Workspace, fn: () => Promise<T>): Promise<T> {
  return runWithTenant(w.admin, fn);
}

function queueRunnerJob(w: Workspace, overrides: JobOverrides = {}) {
  return runWithoutTenant(() =>
    prisma.agentJob.create({
      data: {
        companyId: w.companyId,
        runtime: "runner",
        status: overrides.status ?? "queued",
        sourceKind: "test",
        ownerUserId: overrides.ownerUserId ?? w.admin.id,
        prompt: "Summarise the open deals",
        ...(overrides.pinnedRunnerId ? { pinnedRunnerId: overrides.pinnedRunnerId } : {}),
        ...(overrides.runnerId ? { runnerId: overrides.runnerId } : {}),
        ...(overrides.attempts === undefined ? {} : { attempts: overrides.attempts }),
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      },
    }),
  );
}

function addRunner(w: Workspace, seenAgoMs: number | null, revoked = false, createdById = w.admin.id) {
  return runWithoutTenant(() =>
    prisma.agentRunner.create({
      data: {
        companyId: w.companyId,
        createdById,
        name: "Runner",
        tokenHash: hashAgentRunnerToken(generateAgentRunnerToken()),
        lastSeenAt: seenAgoMs === null ? null : new Date(Date.now() - seenAgoMs),
        revokedAt: revoked ? new Date() : null,
      },
    }),
  );
}

function jobStatus(id: string) {
  return runWithoutTenant(() =>
    prisma.agentJob.findUnique({ where: { id }, select: { status: true, error: true, runnerId: true } }),
  );
}

describeDatabase("PrismaAgentRunnerRepo", { timeout: 60_000 }, () => {
  it("creates and lists runners of the acting workspace only, with the member who added each", async () => {
    const mine = await workspace();
    const other = await workspace();
    const token = generateAgentRunnerToken();

    const created = await asAdmin(mine, () =>
      new PrismaAgentRunnerRepo().createRunner({ name: "Office laptop", tokenHash: hashAgentRunnerToken(token) }),
    );
    const listedByMine = await asAdmin(mine, () => new PrismaAgentRunnerRepo().listRunners());
    const listedByOther = await asAdmin(other, () => new PrismaAgentRunnerRepo().listRunners());

    expect(created).toMatchObject({
      name: "Office laptop",
      machine: null,
      lastSeenAt: null,
      revokedAt: null,
      createdById: mine.admin.id,
    });
    expect(created.clients).toEqual([]);
    expect(listedByMine.map((runner) => runner.id)).toEqual([created.id]);
    expect(listedByOther).toEqual([]);
    expect(JSON.stringify(listedByMine)).not.toContain(hashAgentRunnerToken(token));
  });

  it("finds a runner for revoking only inside the acting workspace", async () => {
    const mine = await workspace();
    const other = await workspace();
    const runner = await addRunner(mine, null);

    expect(await asAdmin(other, () => new PrismaAgentRunnerRepo().findRunner(runner.id))).toBeNull();
    expect(await asAdmin(mine, () => new PrismaAgentRunnerRepo().findRunner(runner.id))).toMatchObject({
      id: runner.id,
      revokedAt: null,
    });
  });

  it("revokes only inside the named workspace and keeps the first revocation time", async () => {
    const mine = await workspace();
    const other = await workspace();
    const runner = await addRunner(mine, null);
    const first = new Date("2026-11-17T09:00:00.000Z");
    const second = new Date("2026-11-17T10:00:00.000Z");
    const repo = new PrismaAgentRunnerRepo();

    expect(await repo.revokeRunnerUnscoped({ companyId: other.companyId, id: runner.id, at: first })).toBe(false);
    expect(await repo.revokeRunnerUnscoped({ companyId: mine.companyId, id: runner.id, at: first })).toBe(true);
    expect(await repo.revokeRunnerUnscoped({ companyId: mine.companyId, id: runner.id, at: second })).toBe(false);
    const stored = await runWithoutTenant(() => prisma.agentRunner.findUnique({ where: { id: runner.id } }));
    expect(stored?.revokedAt).toEqual(first);
  });

  it("lists the unrevoked runners one member added", async () => {
    const w = await workspace();
    const own = await addRunner(w, null);
    await addRunner(w, null, true);
    await addRunner(w, null, false, w.member.id);

    const ids = await new PrismaAgentRunnerRepo().findUnrevokedRunnerIdsOfUnscoped({
      companyId: w.companyId,
      createdById: w.admin.id,
    });

    expect(ids).toEqual([own.id]);
  });

  it("finds a runner by the hash of its token with the state of its workspace and of the member who added it", async () => {
    const w = await workspace();
    const token = generateAgentRunnerToken();
    const runner = await runWithoutTenant(() =>
      prisma.agentRunner.create({
        data: {
          companyId: w.companyId,
          createdById: w.member.id,
          name: "Runner",
          tokenHash: hashAgentRunnerToken(token),
        },
      }),
    );
    const repo = new PrismaAgentRunnerRepo();

    const found = await repo.findRunnerByTokenHashUnscoped(hashAgentRunnerToken(token));
    expect(found).toMatchObject({
      id: runner.id,
      companyId: w.companyId,
      createdById: w.member.id,
      company: { deletingAt: null },
      createdBy: { status: "active", pausedByPlanAt: null },
    });
    expect(await repo.findRunnerByTokenHashUnscoped(hashAgentRunnerToken(generateAgentRunnerToken()))).toBeNull();

    await runWithoutTenant(() =>
      prisma.user.update({ where: { id: w.member.id }, data: { status: "inactive", pausedByPlanAt: new Date() } }),
    );
    await runWithoutTenant(() =>
      prisma.company.update({ where: { id: w.companyId }, data: { deletingAt: new Date() } }),
    );
    const later = await repo.findRunnerByTokenHashUnscoped(hashAgentRunnerToken(token));
    expect(later?.company.deletingAt).toBeInstanceOf(Date);
    expect(later?.createdBy.status).toBe("inactive");
    expect(later?.createdBy.pausedByPlanAt).toBeInstanceOf(Date);
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

describeDatabase("the jobs a runner may take", { timeout: 60_000 }, () => {
  it("offers only queued runner jobs of the runner's member, oldest first, unpinned or pinned to it", async () => {
    const w = await workspace();
    const other = await workspace();
    const runner = await addRunner(w, 1_000);
    const sibling = await addRunner(w, 1_000);
    const base = Date.now() - 60_000;
    const second = await queueRunnerJob(w, { createdAt: new Date(base + 2_000) });
    const first = await queueRunnerJob(w, { createdAt: new Date(base + 1_000), pinnedRunnerId: runner.id });
    await queueRunnerJob(w, { createdAt: new Date(base), ownerUserId: w.member.id });
    await queueRunnerJob(w, { createdAt: new Date(base), pinnedRunnerId: sibling.id });
    await queueRunnerJob(w, { createdAt: new Date(base), status: "claimed" });
    await queueRunnerJob(other, { createdAt: new Date(base) });
    const repo = new PrismaAgentRunnerRepo();
    const args = { companyId: w.companyId, ownerUserId: w.admin.id, runnerId: runner.id };

    expect(await repo.findClaimableJobIdsUnscoped({ ...args, limit: 5 })).toEqual([first.id, second.id]);
    expect(await repo.findClaimableJobIdsUnscoped({ ...args, limit: 1 })).toEqual([first.id]);
  });

  it("gives a member's job to that member's runner and never to the runner of another member", async () => {
    const w = await workspace();
    const adminRunner = await addRunner(w, 1_000);
    const memberRunner = await addRunner(w, 1_000, false, w.member.id);
    const job = await queueRunnerJob(w, { ownerUserId: w.member.id });
    const repo = new QueuedAgentJobRunnerRepo(new PrismaAgentJobRepo(), new PrismaAgentRunnerRepo());
    const asRunner = (id: string, createdById: string) => ({ id, companyId: w.companyId, name: "Runner", createdById });

    expect(await repo.claimNextForRunner(asRunner(adminRunner.id, w.admin.id))).toBeNull();
    expect(await jobStatus(job.id)).toMatchObject({ status: "queued", runnerId: null });

    const claim = await repo.claimNextForRunner(asRunner(memberRunner.id, w.member.id));
    expect(claim).toMatchObject({ id: job.id, ownerUserId: w.member.id, attempt: 1 });
    expect(await jobStatus(job.id)).toMatchObject({ status: "claimed", runnerId: memberRunner.id });
  });

  it("puts a claimed job back in the queue only for the runner and the attempt that hold it, and lets it be claimed again", async () => {
    const w = await workspace();
    const other = await workspace();
    const runner = await addRunner(w, 1_000);
    const sibling = await addRunner(w, 1_000);
    const job = await queueRunnerJob(w);
    const started = await queueRunnerJob(w, { status: "running", runnerId: runner.id, attempts: 1 });
    const repo = new QueuedAgentJobRunnerRepo(new PrismaAgentJobRepo(), new PrismaAgentRunnerRepo());
    const asRunner = (id: string, companyId = w.companyId) => ({
      id,
      companyId,
      name: "Runner",
      createdById: w.admin.id,
    });
    const claim = await repo.claimNextForRunner(asRunner(runner.id));
    expect(claim).toMatchObject({ id: job.id, attempt: 1 });

    expect(await repo.releaseClaim(job.id, asRunner(sibling.id), 1)).toBe(false);
    expect(await repo.releaseClaim(job.id, asRunner(runner.id), 2)).toBe(false);
    expect(await repo.releaseClaim(job.id, asRunner(runner.id, other.companyId), 1)).toBe(false);
    expect(await repo.releaseClaim(started.id, asRunner(runner.id), 1)).toBe(false);
    expect(await jobStatus(job.id)).toMatchObject({ status: "claimed", runnerId: runner.id });
    expect(await jobStatus(started.id)).toMatchObject({ status: "running", runnerId: runner.id });

    expect(await repo.releaseClaim(job.id, asRunner(runner.id), 1)).toBe(true);
    const released = await runWithoutTenant(() => prisma.agentJob.findUnique({ where: { id: job.id } }));
    expect(released).toMatchObject({
      status: "queued",
      runnerId: null,
      claimedAt: null,
      timeoutAt: null,
      attempts: 1,
      startedAttempts: 0,
    });

    expect(await repo.claimNextForRunner(asRunner(sibling.id))).toMatchObject({ id: job.id, attempt: 2 });
  });

  it("lists the claimed and running jobs of one runner with their attempt", async () => {
    const w = await workspace();
    const runner = await addRunner(w, 1_000);
    const sibling = await addRunner(w, 1_000);
    const claimed = await queueRunnerJob(w, { status: "claimed", runnerId: runner.id, attempts: 1 });
    const running = await queueRunnerJob(w, { status: "running", runnerId: runner.id, attempts: 2 });
    await queueRunnerJob(w, { status: "succeeded", runnerId: runner.id, attempts: 1 });
    await queueRunnerJob(w, { status: "running", runnerId: sibling.id, attempts: 1 });

    const live = await new PrismaAgentRunnerRepo().findLiveJobsOfRunnerUnscoped({
      companyId: w.companyId,
      runnerId: runner.id,
    });

    expect(live.sort((left, right) => left.attempts - right.attempts)).toEqual([
      { id: claimed.id, attempts: 1 },
      { id: running.id, attempts: 2 },
    ]);
  });

  it("revoking a runner cancels its live and pinned jobs as runnerRevoked and asks for their keys to be revoked", async () => {
    const w = await workspace();
    const runner = await addRunner(w, 1_000);
    const sibling = await addRunner(w, 1_000);
    const running = await queueRunnerJob(w, { status: "running", runnerId: runner.id, attempts: 1 });
    const pinned = await queueRunnerJob(w, { pinnedRunnerId: runner.id });
    const untouched = await queueRunnerJob(w, { status: "running", runnerId: sibling.id, attempts: 1 });
    const revokedKeys: unknown[] = [];
    const credentials = {
      revoke: (args: unknown) => {
        revokedKeys.push(args);
        return Promise.resolve();
      },
    };
    const revocation = new AgentRunnerRevocation(new PrismaAgentRunnerRepo(), new PrismaAgentJobRepo(), credentials);

    await revocation.revoke({ companyId: w.companyId, runnerId: runner.id, at: new Date() });

    expect(await jobStatus(running.id)).toMatchObject({ status: "cancelled", error: "runnerRevoked" });
    expect(await jobStatus(pinned.id)).toMatchObject({ status: "cancelled", error: "runnerRevoked" });
    expect(await jobStatus(untouched.id)).toMatchObject({ status: "running", error: null });
    expect(revokedKeys).toEqual([{ companyId: w.companyId, jobId: running.id, attempt: 1 }]);
    const stored = await runWithoutTenant(() => prisma.agentRunner.findUnique({ where: { id: runner.id } }));
    expect(stored?.revokedAt).toBeInstanceOf(Date);
  });
});

describeDatabase("PrismaAgentRunnerRepo.findWaitingOwnersUnscoped", { timeout: 60_000 }, () => {
  const seenSince = () => new Date(Date.now() - 10 * 60_000);
  const find = (companyId: string) =>
    new PrismaAgentRunnerRepo()
      .findWaitingOwnersUnscoped({ seenSince: seenSince() })
      .then((all) => all.filter((entry) => entry.companyId === companyId));

  it("reports a member with a queued runner job and no runner, once", async () => {
    const w = await workspace();
    await queueRunnerJob(w);
    await queueRunnerJob(w);

    expect(await find(w.companyId)).toEqual([
      { companyId: w.companyId, userId: w.admin.id, displayLanguage: expect.any(String), lastSeenAt: null },
    ]);
  });

  it("reports a member whose job waits although the runner of another member is online", async () => {
    const w = await workspace();
    await queueRunnerJob(w, { ownerUserId: w.member.id });
    await addRunner(w, 60_000);

    expect((await find(w.companyId)).map((owner) => owner.userId)).toEqual([w.member.id]);
  });

  it("does not report a member whose own runner was seen in the last ten minutes", async () => {
    const w = await workspace();
    await queueRunnerJob(w);
    await addRunner(w, 60_000);

    expect(await find(w.companyId)).toEqual([]);
  });

  it("reports a job pinned to an offline runner although another runner of the member is online", async () => {
    const w = await workspace();
    const offline = await addRunner(w, 30 * 60_000);
    await addRunner(w, 60_000);
    await queueRunnerJob(w, { pinnedRunnerId: offline.id });

    const [owner] = await find(w.companyId);

    expect(owner).toMatchObject({ userId: w.admin.id });
    expect(owner?.lastSeenAt?.getTime()).toBe(offline.lastSeenAt?.getTime());
  });

  it("reports a member whose runner was last seen long ago, never seen or revoked, with the last time it was seen", async () => {
    const stale = await workspace();
    await queueRunnerJob(stale);
    const staleRunner = await addRunner(stale, 11 * 60_000);
    const never = await workspace();
    await queueRunnerJob(never);
    await addRunner(never, null);
    const revoked = await workspace();
    await queueRunnerJob(revoked);
    await addRunner(revoked, 1_000, true);

    expect((await find(stale.companyId))[0]?.lastSeenAt?.getTime()).toBe(staleRunner.lastSeenAt?.getTime());
    expect((await find(never.companyId))[0]).toMatchObject({ lastSeenAt: null });
    expect((await find(revoked.companyId))[0]).toMatchObject({ lastSeenAt: null });
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

    expect(await find(claimed.companyId)).toEqual([]);
    expect(await find(mate.companyId)).toEqual([]);
    expect(await find(deleting.companyId)).toEqual([]);
    expect(await find(inactive.companyId)).toEqual([]);
  });
});
