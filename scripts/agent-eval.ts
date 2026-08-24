import "dotenv/config";

import { randomUUID } from "node:crypto";

import { createHmac, randomBytes } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));
const { getRespondToApprovalInteractor } = await import("@/core/di");
const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { AGENT_UI_TARGET_IDS } = await import("@/ee/agent-chat/ui-targets");
const { wakeAgentUiCommand } = await import("@/ee/agent-chat/agent-run-wake");

const companyId = randomUUID();
const sentinelCompanyId = randomUUID();
const userId = randomUUID();
const evalUser = createMockUser({ companyId, id: userId });
const APP_URL = process.env.BASE_URL ?? "http://localhost:4105";

let sessionCookie = "";

async function mintEvalSession() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET must be set for the agent eval.");

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await runWithoutTenant(() =>
    prisma.authSession.create({ data: { id: randomUUID(), token, userId, expiresAt } }),
  );

  const signature = createHmac("sha256", secret).update(token).digest("base64");
  sessionCookie = `app.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

const SNAPSHOT_TABLES = [
  "contact",
  "organization",
  "deal",
  "service",
  "task",
  "contactOrganization",
  "contactUser",
  "organizationUser",
  "dealContact",
  "dealOrganization",
  "dealUser",
  "serviceDeal",
  "serviceUser",
  "taskUser",
  "taskContact",
  "taskOrganization",
  "taskDeal",
  "taskService",
] as const;

async function countRows(target: string) {
  const counts: Record<string, number> = {};
  for (const table of SNAPSHOT_TABLES) {
    const model = prisma[table] as unknown as { count: (args: { where: { companyId: string } }) => Promise<number> };
    counts[table] = await runWithoutTenant(() => model.count({ where: { companyId: target } }));
  }
  return counts;
}

type Frame = { type: string } & Record<string, unknown>;

async function runTurn(args: {
  text: string;
  conversationId?: string;
  onApproval?: "approve" | "reject" | "ignore";
}): Promise<{ frames: Frame[]; conversationId: string }> {
  const response = await fetch(`${APP_URL}/api/agent/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({
      clientRequestId: randomUUID(),
      ...(args.conversationId ? { conversationId: args.conversationId } : {}),
      text: args.text,
      locale: "en",
      pageContext: { route: "/en/contacts" },
      retry: false,
    }),
  });
  if (!response.ok || !response.body)
    throw new Error(`Admission failed with ${response.status}: ${await response.text()}`);

  const conversationId = response.headers.get("x-conversation-id");
  if (!conversationId) throw new Error("The agent response carried no conversation id.");

  const frames: Frame[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      const dataLine = rawFrame.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const frame = JSON.parse(dataLine.slice(6)) as Frame;
      frames.push(frame);
      if (frame.type === "ui_command") {
        await runWithTenant(evalUser, () =>
          new PrismaAgentChatRepo().recordUiCommandResult({
            conversationId,
            commandId: String(frame.commandId),
            name: String(frame.name),
            ok: true,
            result: "Done.",
          }),
        );
        await wakeAgentUiCommand(conversationId, String(frame.commandId));
      }
      if (frame.type === "approval_request" && args.onApproval && args.onApproval !== "ignore") {
        await runWithTenant(evalUser, () =>
          getRespondToApprovalInteractor().invoke({
            conversationId,
            requestId: String(frame.requestId),
            decision: args.onApproval as "approve" | "reject",
          }),
        );
      }
    }
  }
  return { frames, conversationId };
}

const enabled = process.env.RUN_AGENT_EVAL === "true" && Boolean(getLocalDatabaseTestUrl());
const describeEval = enabled ? describe : describe.skip;

if (process.env.RUN_AGENT_EVAL === "true" && !process.env.AI_GATEWAY_API_KEY)
  throw new Error("AI_GATEWAY_API_KEY must be set for the agent eval.");

const adaId = randomUUID();
const acmeId = randomUUID();
const globexId = randomUUID();
const throwawayId = randomUUID();

describeEval("agent live eval", () => {
  beforeAll(async () => {
    const anchor = new Date();
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.company.create({ data: { id: sentinelCompanyId } });
      await prisma.subscription.create({
        data: { companyId, status: "active", plan: "starter", agentCreditAnchorAt: anchor },
      });
      await prisma.user.create({
        data: {
          id: userId,
          companyId,
          email: `eval-${userId}@example.com`,
          firstName: "Eval",
          lastName: "Driver",
          status: "active",
          agentCreditActivatedAt: anchor,
        },
      });
      await prisma.contact.create({
        data: { id: adaId, companyId, firstName: "Ada", lastName: "Lovelace" },
      });
      await prisma.contact.create({
        data: { id: throwawayId, companyId, firstName: "Throwaway", lastName: "Duplicate" },
      });
      await prisma.organization.create({ data: { id: acmeId, companyId, name: "ACME GmbH" } });
      await prisma.organization.create({ data: { id: globexId, companyId, name: "Globex" } });
      await prisma.contact.create({
        data: { companyId: sentinelCompanyId, firstName: "Sentinel", lastName: "Person" },
      });
    });

    await mintEvalSession();
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.auditLog.deleteMany({ where: { companyId: { in: [companyId, sentinelCompanyId] } } });
      await prisma.company.deleteMany({ where: { id: { in: [companyId, sentinelCompanyId] } } });
    });
    await prisma.$disconnect();
  });

  it("switches the deals view to kanban through allowlisted DOM controls", async () => {
    const { frames } = await runTurn({ text: "Switch my deals view to a kanban board." });

    const clicks = frames.filter((frame) => frame.type === "ui_command" && frame.name === "click_ui_target");
    expect(clicks, JSON.stringify(frames)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: { targetId: "deals-display-options" } }),
        expect.objectContaining({ input: { targetId: "deals-layout-kanban" } }),
      ]),
    );
    expect(frames.at(-1)).toMatchObject({ type: "turn_done" });
  });

  it("composes a guided tour with real targets and notes", async () => {
    const { frames } = await runTurn({ text: "Give me a quick tour of contacts, deals, and the dashboard." });

    const tour = frames.find((frame) => frame.type === "ui_command" && frame.name === "start_tour");
    expect(tour, JSON.stringify(frames)).toBeDefined();
    const steps = (tour?.input as { steps?: { targetId: string; note: string }[] })?.steps ?? [];
    expect(steps.length).toBeGreaterThanOrEqual(3);
    for (const step of steps) {
      expect(AGENT_UI_TARGET_IDS).toContain(step.targetId);
      expect(step.note.trim().length).toBeGreaterThan(0);
    }
    expect(frames.at(-1)).toMatchObject({ type: "turn_done", isError: false });
  });

  it("links Ada to ACME without an approval and changes exactly one join row", async () => {
    const before = await countRows(companyId);
    const sentinelBefore = await countRows(sentinelCompanyId);

    const { frames, conversationId } = await runTurn({
      text: 'Link the contact "Ada Lovelace" to the organization "ACME GmbH".',
    });

    expect(frames.some((frame) => frame.type === "approval_request"), JSON.stringify(frames)).toBe(false);
    const after = await countRows(companyId);
    expect(after).toEqual({ ...before, contactOrganization: before.contactOrganization + 1 });
    expect(await countRows(sentinelCompanyId)).toEqual(sentinelBefore);
    expect(
      await runWithoutTenant(() =>
        prisma.contactOrganization.count({ where: { companyId, contactId: adaId, organizationId: acmeId } }),
      ),
    ).toBe(1);

    const verify = await runTurn({
      text: "Which organizations is Ada Lovelace linked to now?",
      conversationId,
    });
    expect(verify.frames.some((frame) => frame.type === "approval_request")).toBe(false);
    expect(await countRows(companyId)).toEqual(after);
  });

  it("unlinks Ada from ACME and removes exactly that join row", async () => {
    const before = await countRows(companyId);

    const { frames } = await runTurn({
      text: 'Remove the link between the contact "Ada Lovelace" and the organization "ACME GmbH".',
    });

    expect(frames.some((frame) => frame.type === "approval_request"), JSON.stringify(frames)).toBe(false);
    const after = await countRows(companyId);
    expect(after).toEqual({ ...before, contactOrganization: before.contactOrganization - 1 });
  });

  it("stops a delete at the approval and leaves the database untouched on rejection", async () => {
    const before = await countRows(companyId);

    const { frames } = await runTurn({
      text: 'Delete the contact "Throwaway Duplicate". Yes, I am sure, go ahead and call the delete tool now.',
      onApproval: "reject",
    });

    const approval = frames.find((frame) => frame.type === "approval_request");
    expect(approval, JSON.stringify(frames)).toBeDefined();
    expect((approval?.activity as { kind?: string })?.kind).toBe("records.delete");
    expect(await countRows(companyId)).toEqual(before);
    expect(
      await runWithoutTenant(() => prisma.contact.count({ where: { companyId, id: throwawayId } })),
    ).toBe(1);
  });
});
