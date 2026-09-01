import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { OperatorActor } from "@/core/decorators/operator-context";

import { runWithOperator } from "@/core/decorators/operator-context";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
    NODE_ENV: "test",
  },
}));

import { OPERATOR_AUDIT_ACTION } from "../operator.schema";
import type { OperatorRefusal } from "../operator.repo";
import { PrismaOperatorRepo } from "../prisma-operator.repository";

const OPERATOR_REFUSALS: OperatorRefusal[] = ["conflict", "notFound", "unavailable"];

function assertAdmitted<T>(result: T | OperatorRefusal): asserts result is T {
  const refusal = OPERATOR_REFUSALS.find((candidate) => candidate === result);
  if (refusal) throw new Error(`Expected a successful operator write but the repository refused with "${refusal}".`);
}

const { prisma } = await import("@/prisma/db");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const authUserIds: string[] = [];
const actorIds: string[] = [];

function operatorActor(companyId = `company-${randomUUID()}`): OperatorActor {
  const userId = `operator-${randomUUID()}`;
  actorIds.push(userId);
  return {
    authUserId: `auth-${randomUUID()}`,
    userId,
    companyId,
    email: `${randomUUID()}@example.invalid`,
  };
}

async function createWorkspace(args: { domain: string; members: number; platformOperator?: boolean }) {
  const companyId = randomUUID();
  companyIds.push(companyId);
  const members: { userId: string; authUserId: string; email: string }[] = [];

  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    await prisma.subscription.create({
      data: { companyId, plan: "pro", status: "active", quantity: 1 },
    });

    for (let index = 0; index < args.members; index += 1) {
      const userId = randomUUID();
      const authUserId = randomUUID();
      const email = `member-${randomUUID()}@${args.domain}`;
      authUserIds.push(authUserId);
      await prisma.user.create({
        data: {
          id: userId,
          companyId,
          email,
          firstName: "Member",
          lastName: "One",
          status: "active",
          isPlatformOperator: index === 0 ? Boolean(args.platformOperator) : false,
        },
      });
      await prisma.authUser.create({
        data: { id: authUserId, companyId, email, name: "Member One", emailVerified: true },
      });
      await prisma.authSession.create({
        data: {
          id: randomUUID(),
          token: `token-${randomUUID()}`,
          userId: authUserId,
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        },
      });
      members.push({ userId, authUserId, email });
    }
  });

  return { companyId, members };
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    await prisma.operatorAuditEvent.deleteMany({ where: { actorUserId: { in: actorIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.authUser.deleteMany({ where: { id: { in: authUserIds } } });
  });
  await prisma.$disconnect();
});

describeDatabase("operator workspace deletion against a real database", { timeout: 120_000 }, () => {
  it("removes the workspace, its members and their sign-in identities, and keeps the audit event", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId, members } = await createWorkspace({ domain: "doomed.invalid", members: 2 });
    const survivor = await createWorkspace({ domain: "safe.invalid", members: 1 });
    const actor = operatorActor();

    const result = await runWithOperator(actor, () =>
      repo.deleteWorkspaceUnscoped({
        companyId,
        confirmWorkspaceLabel: "doomed.invalid",
        reason: "Spam signup",
      }),
    );
    assertAdmitted(result);

    expect(result.workspaceLabel).toBe("doomed.invalid");
    expect(result.deletedMemberCount).toBe(2);
    expect(result.deletedAuthIdentityCount).toBe(2);

    await runWithoutTenant(async () => {
      expect(await prisma.company.count({ where: { id: companyId } })).toBe(0);
      expect(await prisma.user.count({ where: { companyId } })).toBe(0);
      expect(await prisma.subscription.count({ where: { companyId } })).toBe(0);

      const emails = members.map((member) => member.email);
      expect(await prisma.authUser.count({ where: { email: { in: emails } } })).toBe(0);
      expect(await prisma.authSession.count({ where: { userId: { in: members.map((m) => m.authUserId) } } })).toBe(0);

      expect(await prisma.company.count({ where: { id: survivor.companyId } })).toBe(1);
      expect(await prisma.user.count({ where: { companyId: survivor.companyId } })).toBe(1);
      expect(await prisma.authUser.count({ where: { email: { in: survivor.members.map((m) => m.email) } } })).toBe(1);

      const audit = await prisma.operatorAuditEvent.findMany({ where: { actorUserId: actor.userId } });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.action).toBe(OPERATOR_AUDIT_ACTION.workspaceDelete);
      expect(audit[0]?.targetCompanyId).toBe(companyId);
      expect(audit[0]?.reason).toBe("Spam signup");
      expect((audit[0]?.metadata as { workspaceLabel?: string })?.workspaceLabel).toBe("doomed.invalid");
    });
  });

  it("succeeds when a member created an invite token", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId, members } = await createWorkspace({ domain: "invited.invalid", members: 1 });

    await runWithoutTenant(() =>
      prisma.inviteToken.create({
        data: {
          token: `invite-${randomUUID()}`,
          companyId,
          createdById: members[0].userId,
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        },
      }),
    );

    const result = await runWithOperator(operatorActor(), () =>
      repo.deleteWorkspaceUnscoped({
        companyId,
        confirmWorkspaceLabel: "invited.invalid",
        reason: "Cleanup",
      }),
    );
    assertAdmitted(result);

    await runWithoutTenant(async () => {
      expect(await prisma.company.count({ where: { id: companyId } })).toBe(0);
      expect(await prisma.inviteToken.count({ where: { companyId } })).toBe(0);
    });
  });

  it("refuses a mismatched confirmation label and leaves the workspace intact", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId } = await createWorkspace({ domain: "typo.invalid", members: 1 });

    const result = await runWithOperator(operatorActor(), () =>
      repo.deleteWorkspaceUnscoped({
        confirmWorkspaceLabel: "wrong.invalid",
        companyId,
        reason: "Cleanup",
      }),
    );

    expect(result).toBe("conflict");
    await runWithoutTenant(async () => {
      expect(await prisma.company.count({ where: { id: companyId } })).toBe(1);
      expect(await prisma.user.count({ where: { companyId } })).toBe(1);
    });
  });

  it("refuses to delete the acting operator's own workspace", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId } = await createWorkspace({ domain: "mine.invalid", members: 1 });

    const result = await runWithOperator(operatorActor(companyId), () =>
      repo.deleteWorkspaceUnscoped({
        companyId,
        confirmWorkspaceLabel: "mine.invalid",
        reason: "Cleanup",
      }),
    );

    expect(result).toBe("conflict");
    await runWithoutTenant(async () => {
      expect(await prisma.company.count({ where: { id: companyId } })).toBe(1);
    });
  });

  it("refuses a workspace that still holds an active platform operator", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId } = await createWorkspace({
      domain: "staff.invalid",
      members: 1,
      platformOperator: true,
    });

    const result = await runWithOperator(operatorActor(), () =>
      repo.deleteWorkspaceUnscoped({
        companyId,
        confirmWorkspaceLabel: "staff.invalid",
        reason: "Cleanup",
      }),
    );

    expect(result).toBe("conflict");
    await runWithoutTenant(async () => {
      expect(await prisma.company.count({ where: { id: companyId } })).toBe(1);
    });
  });

  it("reports notFound for an unknown workspace and for a repeated deletion", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId } = await createWorkspace({ domain: "once.invalid", members: 1 });

    const first = await runWithOperator(operatorActor(), () =>
      repo.deleteWorkspaceUnscoped({
        companyId,
        confirmWorkspaceLabel: "once.invalid",
        reason: "Cleanup",
      }),
    );
    assertAdmitted(first);

    const second = await runWithOperator(operatorActor(), () =>
      repo.deleteWorkspaceUnscoped({
        companyId,
        confirmWorkspaceLabel: "once.invalid",
        reason: "Cleanup",
      }),
    );
    expect(second).toBe("notFound");

    const unknown = await runWithOperator(operatorActor(), () =>
      repo.deleteWorkspaceUnscoped({
        companyId: randomUUID(),
        confirmWorkspaceLabel: "nobody.invalid",
        reason: "Cleanup",
      }),
    );
    expect(unknown).toBe("notFound");
  });

  it("leaves no row behind in any table that carries a companyId", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId, members } = await createWorkspace({ domain: "sweep.invalid", members: 2 });

    await runWithoutTenant(async () => {
      const owner = members[0];
      await prisma.contact.create({ data: { companyId, firstName: "Swept", lastName: "Contact" } });
      await prisma.organization.create({ data: { companyId, name: `Org ${randomUUID()}` } });
      await prisma.task.create({ data: { companyId, name: `Task ${randomUUID()}`, type: "custom" } });
      await prisma.auditLog.create({
        data: { companyId, userId: owner.userId, event: "contact.created", eventData: {}, entityId: randomUUID() },
      });
      await prisma.inviteToken.create({
        data: {
          token: `sweep-${randomUUID()}`,
          companyId,
          createdById: owner.userId,
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        },
      });
      await prisma.messagingInboundEvent.create({
        data: { companyId, source: "webhook", payload: { probe: "sweep" } },
      });
      await prisma.authVerification.create({
        data: {
          id: randomUUID(),
          identifier: owner.email.toUpperCase(),
          value: `pending-${randomUUID()}`,
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        },
      });
      await prisma.apikey.create({
        data: {
          id: randomUUID(),
          key: `hashed-${randomUUID()}`,
          referenceId: owner.authUserId,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
    });

    const tables = await runWithoutTenant(
      () =>
        prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'companyId'
        ORDER BY table_name
      `,
    );
    expect(tables.length).toBeGreaterThan(30);

    const result = await runWithOperator(operatorActor(), () =>
      repo.deleteWorkspaceUnscoped({
        companyId,
        confirmWorkspaceLabel: "sweep.invalid",
        reason: "Completeness sweep",
      }),
    );
    assertAdmitted(result);

    const survivors: string[] = [];
    await runWithoutTenant(async () => {
      for (const { table_name: table } of tables) {
        const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count FROM "${table}" WHERE "companyId" = $1`,
          companyId,
        );
        if (Number(rows[0]?.count ?? 0) > 0) survivors.push(table);
      }
    });

    expect(survivors, `tables still holding rows for the deleted workspace:\n${survivors.join("\n")}`).toEqual([]);

    await runWithoutTenant(async () => {
      const emails = members.map((member) => member.email);
      expect(await prisma.authUser.count({ where: { email: { in: emails } } })).toBe(0);
      expect(
        await prisma.authSession.count({ where: { userId: { in: members.map((member) => member.authUserId) } } }),
      ).toBe(0);
      expect(await prisma.apikey.count({ where: { referenceId: { in: members.map((m) => m.authUserId) } } })).toBe(0);
      expect(await prisma.authVerification.count({ where: { identifier: { in: emails, mode: "insensitive" } } })).toBe(
        0,
      );
      expect(await prisma.authAccount.count({ where: { userId: { in: members.map((m) => m.authUserId) } } })).toBe(0);

      const audit = await prisma.operatorAuditEvent.findMany({ where: { targetCompanyId: companyId } });
      expect(audit).toHaveLength(1);
    });
  });
});
