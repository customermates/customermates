import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const sourceDatabaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = sourceDatabaseUrl ? describe : describe.skip;
const databaseName = `workspace_platform_spend_${randomUUID().replaceAll("-", "")}`;
let adminClient: Client | null = null;

async function createIsolatedDatabase(sourceUrl: string): Promise<string> {
  const admin = new Client({ connectionString: sourceUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  adminClient = admin;
  const isolatedUrl = new URL(sourceUrl);
  isolatedUrl.pathname = `/${databaseName}`;
  const client = new Client({ connectionString: isolatedUrl.toString() });
  await client.connect();
  try {
    const root = join(process.cwd(), "prisma/migrations");
    const migrations = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations)
      await client.query(readFileSync(join(root, migration, "migration.sql"), "utf8"));
  } finally {
    await client.end();
  }
  return isolatedUrl.toString();
}

if (sourceDatabaseUrl) {
  process.env.DATABASE_URL = await createIsolatedDatabase(sourceDatabaseUrl);
  delete (globalThis as { prisma?: unknown }).prisma;
}

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    get DATABASE_URL() {
      return process.env.DATABASE_URL;
    },
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
    HOSTED_AI_PROVIDER_WORK_PAUSED: false,
    HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS: 1_000_000_000_000n,
    NODE_ENV: "test",
  },
}));

const { PrismaAgentChatRepo } = await import("../prisma-agent-chat.repository");
const { prismaAgentChatRepoDependencies } = await import("@/tests/helpers/prisma-agent-chat-repo");
const { AgentUsageService } = await import("../agent-usage.service");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const CREDIT = 1_000_000;
const MODEL = "anthropic/claude-haiku-5.5";
const PURPOSE = "workspaceSetup";

afterAll(async () => {
  if (sourceDatabaseUrl) await prisma.$disconnect();
  if (adminClient) {
    await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await adminClient.end();
  }
});

async function workspace() {
  const companyId = randomUUID();
  await runWithoutTenant(() => prisma.company.create({ data: { id: companyId } }));
  return companyId;
}

function charge(costMicrocents: number) {
  return { model: MODEL, inputTokens: 100, costMicrocents, costSource: "measured" as const };
}

describeDatabase("per-workspace platform-paid spend", { timeout: 120_000 }, () => {
  const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
  const usage = new AgentUsageService(repo);
  const spend = (companyId: string) =>
    runWithoutTenant(() => usage.workspacePlatformSpend({ companyId, purpose: PURPOSE }));
  const reserve = (companyId: string, worstCaseMicrocents: number, capMicrocents = 10 * CREDIT, now?: Date) =>
    runWithoutTenant(() =>
      usage.reserveWorkspacePlatform({
        companyId,
        purpose: PURPOSE,
        model: MODEL,
        worstCaseMicrocents,
        capMicrocents,
        now,
      }),
    );
  const settle = (reservationId: string, costMicrocents: number | null) =>
    runWithoutTenant(() =>
      usage.settlePlatformRetrieval({ reservationId, charge: costMicrocents === null ? null : charge(costMicrocents) }),
    );
  const platformTotal = () =>
    runWithoutTenant(async () => {
      const rows = await prisma.hostedAiPlatformUsage.findMany({ where: { purpose: PURPOSE } });
      return rows.reduce((sum, row) => sum + Number(row.costMicrocents), 0);
    });

  it("holds the worst case, settles the measured cost to the workspace and the platform, and refunds the rest", async () => {
    const companyId = await workspace();
    const before = await platformTotal();
    const first = await reserve(companyId, 4 * CREDIT);
    if (first.status !== "reserved") throw new Error(first.status);
    expect(await spend(companyId)).toEqual({ usedMicrocents: 0, heldMicrocents: 4 * CREDIT });

    await settle(first.id, CREDIT);
    expect(await spend(companyId)).toEqual({ usedMicrocents: CREDIT, heldMicrocents: 0 });
    expect((await platformTotal()) - before).toBe(CREDIT);
    expect(await runWithoutTenant(() => prisma.hostedAiPlatformReservation.count({ where: { id: first.id } }))).toBe(0);

    const refused = await reserve(companyId, 2 * CREDIT);
    if (refused.status !== "reserved") throw new Error(refused.status);
    await settle(refused.id, null);
    expect(await spend(companyId)).toEqual({ usedMicrocents: CREDIT, heldMicrocents: 0 });
  });

  it("refuses a reservation that would cross the workspace cap while other workspaces keep their own", async () => {
    const companyId = await workspace();
    const other = await workspace();
    const held = await reserve(companyId, 6 * CREDIT);
    expect(held.status).toBe("reserved");
    expect(await reserve(companyId, 5 * CREDIT)).toEqual({ status: "cap" });
    expect((await reserve(other, 5 * CREDIT)).status).toBe("reserved");
    if (held.status !== "reserved") return;
    await settle(held.id, 9 * CREDIT);
    expect(await reserve(companyId, 2 * CREDIT)).toEqual({ status: "cap" });
    expect((await reserve(companyId, CREDIT)).status).toBe("reserved");
  });

  it("admits concurrent reservations only up to the cap", async () => {
    const companyId = await workspace();
    const results = await Promise.all(Array.from({ length: 6 }, () => reserve(companyId, 3 * CREDIT)));
    expect(results.filter((result) => result.status === "reserved")).toHaveLength(3);
    expect(results.filter((result) => result.status === "cap")).toHaveLength(3);
  });

  it("converts an abandoned hold into workspace spend when the stale sweep settles it", async () => {
    const companyId = await workspace();
    const stale = await reserve(companyId, 2 * CREDIT, 10 * CREDIT, new Date(Date.now() - 30 * 60_000));
    expect(stale.status).toBe("reserved");
    expect(await runWithoutTenant(() => usage.settleStalePlatformReservations())).toBeGreaterThanOrEqual(1);
    expect(await spend(companyId)).toEqual({ usedMicrocents: 2 * CREDIT, heldMicrocents: 0 });
  });

  it("removes the workspace ledger with its workspace", async () => {
    const companyId = await workspace();
    const held = await reserve(companyId, CREDIT);
    if (held.status !== "reserved") throw new Error(held.status);
    await settle(held.id, CREDIT);
    await runWithoutTenant(() => prisma.company.delete({ where: { id: companyId } }));
    expect(await spend(companyId)).toEqual({ usedMicrocents: 0, heldMicrocents: 0 });
  });
});
