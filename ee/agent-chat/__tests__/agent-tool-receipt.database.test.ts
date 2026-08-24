import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));
vi.mock("@/features/user/user.service", () => ({
  UserService: class {
    getUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    getActiveUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    getActiveTenantUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    hasPermissionForUser() {
      return true;
    }

    hasPermission() {
      return Promise.resolve(true);
    }

    hasPermissionOrThrow() {
      return Promise.resolve();
    }
  },
}));

await import("@/core/di");
const { createContactsTool } = await import("@/features/mcp-tools/contact.mcp-tools");
const { executeMcpTool } = await import("@/features/mcp-tools/mcp-tool");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant, runWithTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");

const company = randomUUID();
const user = randomUUID();
const tenantUser = createMockUser({ companyId: company, id: user });

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

async function createContact(firstName: string) {
  return executeMcpTool(createContactsTool, [{ contacts: [{ firstName, lastName: "Receipt" }] }]);
}

describeDatabase("agent tool receipts wrap a real mutation", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: company } });
      await prisma.user.create({
        data: {
          id: user,
          companyId: company,
          email: `receipts-${user}@example.com`,
          firstName: "Receipt",
          lastName: "Tester",
          status: "active",
        },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: company } }));
    await prisma.$disconnect();
  });

  it("commits a record mutation when the receipt wrapper opens the transaction around it", async () => {
    const outsideTransaction = await runWithTenant(tenantUser, () => createContact("Outside"));
    const insideTransaction = await runWithTenant(tenantUser, () =>
      runInTransaction(async () => createContact("Inside")),
    );

    const stored = await runWithoutTenant(() =>
      prisma.contact.findMany({ where: { companyId: company }, select: { firstName: true } }),
    );

    expect(outsideTransaction.ok, `outside: ${outsideTransaction.result}`).toBe(true);
    expect(insideTransaction.ok, `inside: ${insideTransaction.result}`).toBe(true);
    expect(stored.map((contact) => contact.firstName).toSorted()).toEqual(["Inside", "Outside"]);
  });

  it("settles the receipt in the same transaction that commits the mutation", async () => {
    const repo = new PrismaAgentChatRepo();
    const conversationId = randomUUID();
    const turnRequestId = randomUUID();
    const toolCallId = randomUUID();

    await runWithoutTenant(async () => {
      await prisma.agentConversation.create({ data: { id: conversationId, companyId: company, userId: user } });
      await prisma.agentTurnRequest.create({
        data: {
          id: turnRequestId,
          companyId: company,
          userId: user,
          conversationId,
          clientRequestId: randomUUID(),
          text: "create a contact",
          status: "running",
          runId: randomUUID(),
          userMessageId: randomUUID(),
          affectedResources: [],
        },
      });
    });

    const claim = await runWithoutTenant(() =>
      repo.claimAgentToolReceiptUnscoped({
        turnRequestId,
        companyId: company,
        toolCallId,
        toolName: "create_contacts",
      }),
    );
    expect(claim.state).toBe("claimed");

    const outcome = await runWithTenant(tenantUser, () =>
      runInTransaction(async () => {
        const result = await createContact("Settled");
        await repo.settleAgentToolReceiptUnscoped({
          turnRequestId,
          companyId: company,
          toolCallId,
          resultJson: { ok: result.ok },
        });
        return result;
      }),
    );

    const [receipt, contacts] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentToolReceipt.findFirstOrThrow({ where: { turnRequestId, toolCallId } }),
        prisma.contact.count({ where: { companyId: company, firstName: "Settled" } }),
      ]),
    );

    expect(outcome.ok, outcome.result).toBe(true);
    expect(receipt.state).toBe("settled");
    expect(contacts).toBe(1);
  });
});
