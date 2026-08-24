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
const { getCancelAgentTurnInteractor, getRespondToUiCommandInteractor } = await import("@/core/di");
const { MODEL_CATALOG } = await import("@/ee/agent-chat/model-catalog");
const { AGENT_RUN_LEASE_MS } = await import("@/ee/agent-chat/agent-turn-request");

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
  await runWithoutTenant(async () => {
    await prisma.authUser.create({
      data: {
        id: userId,
        companyId,
        name: "Eval Driver",
        email: `eval-${userId}@example.com`,
        emailVerified: true,
      },
    });
    await prisma.authSession.create({ data: { id: randomUUID(), token, userId, expiresAt } });
  });

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
  modelKey?: string;
  onApproval?: "approve" | "reject" | "ignore";
  onFrame?: (frame: Frame, conversationId: string) => Promise<void>;
  detachAfter?: number;
}): Promise<{ frames: Frame[]; conversationId: string; detached: boolean }> {
  const response = await fetch(`${APP_URL}/api/agent/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({
      clientRequestId: randomUUID(),
      ...(args.conversationId ? { conversationId: args.conversationId } : {}),
      ...(args.modelKey ? { modelKey: args.modelKey } : {}),
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
      if (args.onFrame) await args.onFrame(frame, conversationId);
      if (args.detachAfter !== undefined && frames.length >= args.detachAfter) {
        await reader.cancel();
        return { frames, conversationId, detached: true };
      }
      if (frame.type === "ui_command") {
        await runWithTenant(evalUser, () =>
          getRespondToUiCommandInteractor().invoke({
            conversationId,
            commandId: String(frame.commandId),
            name: String(frame.name) as never,
            ok: true,
            result: "Done.",
          }),
        );
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
  return { frames, conversationId, detached: false };
}

async function readAgentStream(conversationId: string, startIndex: number): Promise<Frame[]> {
  const response = await fetch(`${APP_URL}/api/agent/conversations/${conversationId}/stream?startIndex=${startIndex}`, {
    headers: { cookie: sessionCookie },
  });
  if (!response.ok || !response.body)
    throw new Error(`Reattach failed with ${response.status}: ${await response.text()}`);

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
      if (dataLine) frames.push(JSON.parse(dataLine.slice(6)) as Frame);
    }
  }
  return frames;
}

async function latestTurn(conversationId: string) {
  return runWithoutTenant(() =>
    prisma.agentTurnRequest.findFirstOrThrow({ where: { conversationId }, orderBy: { createdAt: "desc" } }),
  );
}

async function expectAccountingToBalance(conversationId: string, frames: Frame[]) {
  const done = frames.at(-1);
  expect(done?.type, JSON.stringify(frames.map((frame) => frame.type))).toBe("turn_done");

  const turn = await latestTurn(conversationId);
  const [rounds, usage] = await runWithoutTenant(() =>
    Promise.all([
      prisma.agentRunRound.findMany({ where: { turnRequestId: turn.id }, orderBy: { roundIndex: "asc" } }),
      prisma.agentUsageEvent.findFirst({ where: { turnRequestId: turn.id } }),
    ]),
  );

  expect(done?.numTurns, `rounds recorded for ${turn.id}`).toBe(rounds.length);
  expect(rounds.map((round) => round.roundIndex)).toEqual(rounds.map((_round, index) => index));
  if (usage?.costSource === "measured")
    expect(usage.costMicrocents).toBe(rounds.reduce((total, round) => total + round.costMicrocents, 0n));

  return { turn, rounds, usage };
}

const enabled = process.env.RUN_AGENT_EVAL === "true" && Boolean(getLocalDatabaseTestUrl());
const describeEval = enabled ? describe : describe.skip;

if (process.env.RUN_AGENT_EVAL === "true" && !process.env.AI_GATEWAY_API_KEY)
  throw new Error("AI_GATEWAY_API_KEY must be set for the agent eval.");

const adaId = randomUUID();
const acmeId = randomUUID();
const globexId = randomUUID();
const throwawayId = randomUUID();
const sweepId = randomUUID();
const stoppableId = randomUUID();
const evalRoleId = randomUUID();

describeEval("agent live eval", () => {
  beforeAll(async () => {
    const anchor = new Date();
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.company.create({ data: { id: sentinelCompanyId } });
      await prisma.subscription.create({
        data: { companyId, status: "active", plan: "starter", agentCreditAnchorAt: anchor },
      });
      await prisma.userRole.create({
        data: { id: evalRoleId, name: `eval-${evalRoleId}`, isSystemRole: false, companyId },
      });
      const { Action, Resource } = await import("@/generated/prisma");
      await prisma.rolePermission.createMany({
        data: Object.values(Resource).flatMap((resource) =>
          Object.values(Action).map((action) => ({
            id: randomUUID(),
            roleId: evalRoleId,
            companyId,
            resource,
            action,
          })),
        ),
      });
      await prisma.user.create({
        data: {
          id: userId,
          companyId,
          roleId: evalRoleId,
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
      await prisma.contact.create({
        data: { id: sweepId, companyId, firstName: "Sweepable", lastName: "Placeholder" },
      });
      await prisma.contact.create({
        data: { id: stoppableId, companyId, firstName: "Stoppable", lastName: "Placeholder" },
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

  it("stops a turn that is suspended waiting for an approval", async () => {
    const before = await countRows(companyId);
    let stopped = false;

    const { frames, conversationId } = await runTurn({
      text: 'Delete the contact "Stoppable Placeholder". Yes, I am sure, go ahead and call the delete tool now.',
      onApproval: "ignore",
      onFrame: async (frame, conversation) => {
        if (stopped || frame.type !== "approval_request") return;
        stopped = true;
        const result = await runWithTenant(evalUser, () =>
          getCancelAgentTurnInteractor().invoke({ conversationId: conversation }),
        );
        expect(result.ok && result.data.cancelling, JSON.stringify(result)).toBe(true);
      },
    });

    expect(stopped, JSON.stringify(frames)).toBe(true);
    expect(frames.at(-1)).toMatchObject({ type: "turn_done", terminalCode: "cancelled" });
    expect(await countRows(companyId)).toEqual(before);
    expect(await runWithoutTenant(() => prisma.contact.count({ where: { companyId, id: stoppableId } }))).toBe(1);

    const { turn } = await expectAccountingToBalance(conversationId, frames);
    expect(turn.terminalCode).toBe("cancelled");

    const lease = await runWithoutTenant(() => prisma.agentRunLease.findFirst({ where: { conversationId } }));
    expect(lease).toBeNull();
  });

  it("switches the deals view to kanban through allowlisted DOM controls", async () => {
    const { frames } = await runTurn({ text: "Open the Deals page and switch its layout to the kanban board." });

    const commands = frames.filter((frame) => frame.type === "ui_command");
    const targets = commands.map((frame) => (frame.input as { targetId?: string })?.targetId).filter(Boolean);

    expect(targets, JSON.stringify(frames)).toContain("deals-layout-kanban");
    for (const target of targets) expect(AGENT_UI_TARGET_IDS).toContain(target);
    expect(frames.at(-1)).toMatchObject({ type: "turn_done", terminalCode: "completed" });
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

  it("pins the model chosen at the start of a conversation to every later turn", async () => {
    const first = await runTurn({
      text: "How many contacts are in this workspace?",
      modelKey: "fast",
    });
    await expectAccountingToBalance(first.conversationId, first.frames);

    const second = await runTurn({
      text: "And how many organizations?",
      conversationId: first.conversationId,
    });
    await expectAccountingToBalance(second.conversationId, second.frames);

    const rounds = await runWithoutTenant(() =>
      prisma.agentRunRound.findMany({
        where: { turnRequest: { conversationId: first.conversationId } },
        select: { modelSpec: true },
      }),
    );
    expect(rounds.length).toBeGreaterThanOrEqual(2);
    for (const round of rounds) expect(round.modelSpec).toBe(MODEL_CATALOG.fast.modelId);
  });

  it("finishes a turn the client walked away from and reattaches without duplicating a frame", async () => {
    const detached = await runTurn({
      text: "List the organizations in this workspace and say one sentence about each.",
      detachAfter: 2,
    });
    expect(detached.detached).toBe(true);
    expect(detached.frames.at(-1)?.type).not.toBe("turn_done");

    const lastSeq = Number(detached.frames.at(-1)?.seq);
    expect(Number.isFinite(lastSeq)).toBe(true);

    const resumed = await readAgentStream(detached.conversationId, lastSeq + 1);
    expect(resumed.at(-1), JSON.stringify(resumed.map((frame) => frame.type))).toMatchObject({ type: "turn_done" });

    const seqs = [...detached.frames, ...resumed].map((frame) => Number(frame.seq));
    expect(new Set(seqs).size).toBe(seqs.length);

    const reply = resumed
      .filter((frame) => frame.type === "delta")
      .map((frame) => String(frame.text ?? ""))
      .join("");
    expect(reply.trim().length).toBeGreaterThan(0);
    await expectAccountingToBalance(detached.conversationId, resumed);
  });

  it("keeps a suspended approval alive past an ordinary lease and then applies it exactly once", async () => {
    const before = await countRows(companyId);
    const observed: { status: string; leaseHeadroomMs: number }[] = [];

    const { frames, conversationId } = await runTurn({
      text: 'Delete the contact "Sweepable Placeholder". Yes, I am sure, go ahead and call the delete tool now.',
      onApproval: "approve",
      onFrame: async (frame, conversation) => {
        if (frame.type !== "approval_request") return;
        const beyondOrdinaryLease = new Date(Date.now() + AGENT_RUN_LEASE_MS * 2);
        await runWithTenant(evalUser, () =>
          new PrismaAgentChatRepo().normalizeExpiredAgentRunLease(beyondOrdinaryLease, MODEL_CATALOG.balanced.modelId),
        );
        const [turn, lease] = await runWithoutTenant(() =>
          Promise.all([
            prisma.agentTurnRequest.findFirstOrThrow({
              where: { conversationId: conversation },
              orderBy: { createdAt: "desc" },
            }),
            prisma.agentRunLease.findFirst({ where: { conversationId: conversation } }),
          ]),
        );
        observed.push({
          status: turn.status,
          leaseHeadroomMs: lease ? lease.expiresAt.getTime() - Date.now() : 0,
        });
      },
    });

    expect(observed, JSON.stringify(frames)).toHaveLength(1);
    expect(observed[0].status).toBe("running");
    expect(observed[0].leaseHeadroomMs).toBeGreaterThan(AGENT_RUN_LEASE_MS);

    expect(frames.at(-1)).toMatchObject({ type: "turn_done", terminalCode: "completed" });
    expect(await runWithoutTenant(() => prisma.contact.count({ where: { companyId, id: sweepId } }))).toBe(0);
    expect(await countRows(companyId)).toEqual({ ...before, contact: before.contact - 1 });
    await expectAccountingToBalance(conversationId, frames);
  });

  it("stops a running turn on request and bills only what it had already spent", async () => {
    const before = await countRows(companyId);
    let cancelled = false;

    const { frames, conversationId } = await runTurn({
      text: "Review every contact and every organization, then summarize the workspace in detail.",
      onFrame: async (frame, conversation) => {
        if (cancelled || frame.type !== "activity") return;
        cancelled = true;
        const result = await runWithTenant(evalUser, () =>
          getCancelAgentTurnInteractor().invoke({ conversationId: conversation }),
        );
        expect(result.ok).toBe(true);
      },
    });

    expect(cancelled, JSON.stringify(frames)).toBe(true);
    expect(frames.at(-1)).toMatchObject({ type: "turn_done", terminalCode: "cancelled" });
    expect(await countRows(companyId)).toEqual(before);

    const { turn, rounds, usage } = await expectAccountingToBalance(conversationId, frames);
    expect(turn.terminalCode).toBe("cancelled");
    expect(usage?.state).toBe("settled");
    expect(rounds.length).toBeGreaterThan(0);
  });



});
