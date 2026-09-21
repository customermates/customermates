import "dotenv/config";

import { randomUUID } from "node:crypto";

import { createHmac, randomBytes } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
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
const { isAgentPanelTool } = await import("@/ee/agent-chat/agent-ui-command");
const { getCancelAgentTurnInteractor, getRespondToUiCommandInteractor } = await import("@/core/di");
const { MODEL_CATALOG, SHIPPED_AGENT_MODEL_KEY } = await import("@/ee/agent-chat/model-catalog");
const { AGENT_RUN_LEASE_MS } = await import("@/ee/agent-chat/agent-turn-request");

const companyId = randomUUID();
const sentinelCompanyId = randomUUID();
const userId = randomUUID();
const evalUser = createMockUser({ companyId, id: userId });
const APP_URL = process.env.BASE_URL ?? "http://localhost:4105";
const RESUME_RETRY_DELAYS_MS = [0, 500, 1500, 4000] as const;

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
    await prisma.authSession.create({
      data: { id: randomUUID(), token, userId, expiresAt },
    });
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
    const model = prisma[table] as unknown as {
      count: (args: { where: { companyId: string } }) => Promise<number>;
    };
    counts[table] = await runWithoutTenant(() => model.count({ where: { companyId: target } }));
  }
  return counts;
}

type Frame = { type: string } & Record<string, unknown>;

async function runTurn(args: {
  text: string;
  conversationId?: string;
  modelKey?: string;
  locale?: string;
  pageRoute?: string;
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
      locale: args.locale ?? "en",
      pageContext: { route: args.pageRoute ?? "/en/contacts" },
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
        if (!isAgentPanelTool(String(frame.name))) {
          throw new Error(
            `The evaluation received a ui_command for "${String(frame.name)}", which this build does not define. ` +
              "Another application process is executing these workflow steps against the same database.",
          );
        }
        let resumed = false;
        for (const delay of RESUME_RETRY_DELAYS_MS) {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          const result = await runWithTenant(evalUser, () =>
            getRespondToUiCommandInteractor().invoke({
              conversationId,
              commandId: String(frame.commandId),
              name: String(frame.name) as never,
              ok: true,
              result: "Done.",
            }),
          );
          if (!result.ok) throw new Error(`UI command response failed: ${JSON.stringify(result.error)}`);
          if (result.data.resumed) {
            resumed = true;
            break;
          }
        }
        if (!resumed) throw new Error(`UI command ${String(frame.commandId)} did not resume its workflow hook.`);
      }
      if (frame.type === "approval_request" && args.onApproval && args.onApproval !== "ignore") {
        let resumed = false;
        for (const delay of RESUME_RETRY_DELAYS_MS) {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          const result = await runWithTenant(evalUser, () =>
            getRespondToApprovalInteractor().invoke({
              conversationId,
              requestId: String(frame.requestId),
              decision: args.onApproval as "approve" | "reject",
            }),
          );
          if (!result.ok) throw new Error(`Approval response failed: ${JSON.stringify(result.error)}`);
          if (result.data.resumed) {
            resumed = true;
            break;
          }
        }
        if (!resumed) throw new Error(`Approval ${String(frame.requestId)} did not resume its workflow hook.`);
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
    prisma.agentTurnRequest.findFirstOrThrow({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    }),
  );
}

async function expectAccountingToBalance(conversationId: string, frames: Frame[]) {
  const done = frames.at(-1);
  expect(done?.type, JSON.stringify(frames.map((frame) => frame.type))).toBe("turn_done");

  const turn = await latestTurn(conversationId);
  const [rounds, usage] = await runWithoutTenant(() =>
    Promise.all([
      prisma.agentRunRound.findMany({
        where: { turnRequestId: turn.id },
        orderBy: { roundIndex: "asc" },
      }),
      prisma.agentUsageEvent.findFirst({ where: { turnRequestId: turn.id } }),
    ]),
  );

  expect(done?.numTurns, `rounds recorded for ${turn.id}`).toBe(rounds.length);
  expect(rounds.map((round) => round.roundIndex)).toEqual(rounds.map((_round, index) => index));
  if (usage?.costSource === "measured")
    expect(usage.costMicrocents).toBe(rounds.reduce((total, round) => total + round.costMicrocents, 0n));

  return { turn, rounds, usage };
}

async function expectShippedModel(conversationId: string, frames: Frame[]) {
  const accounting = await expectAccountingToBalance(conversationId, frames);
  expect(accounting.rounds.length).toBeGreaterThan(0);
  for (const round of accounting.rounds) expect(round.modelSpec).toBe(MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY].modelId);
  return accounting;
}

function expectViewActivity(
  frames: Frame[],
  activity: {
    kind: "views.configure" | "views.delete";
    surfaceKey: string;
    action: string;
    viewKey?: string;
  },
) {
  expect(
    frames.find(
      (frame) =>
        frame.type === (activity.kind === "views.delete" ? "approval_request" : "activity") &&
        (frame.activity as { kind?: unknown })?.kind === activity.kind,
    ),
    JSON.stringify(frames),
  ).toMatchObject({
    type: activity.kind === "views.delete" ? "approval_request" : "activity",
    activity: {
      kind: activity.kind,
      viewSurfaceKey: activity.surfaceKey,
      viewAction: activity.action,
      ...(activity.viewKey ? { viewKey: activity.viewKey } : {}),
    },
  });
}

function visibleReply(frames: Frame[]) {
  return frames
    .filter((frame) => frame.type === "delta")
    .map((frame) => String(frame.text ?? ""))
    .join("");
}

function agentToolCalls(rounds: readonly { roundIndex: number; parts: unknown }[]) {
  const calls: { roundIndex: number; toolName: string; input: unknown }[] = [];
  for (const round of rounds) {
    if (!Array.isArray(round.parts)) continue;
    for (const rawPart of round.parts) {
      const part = rawPart as {
        type?: unknown;
        toolName?: unknown;
        input?: unknown;
      };
      if (part.type === "tool-call" && typeof part.toolName === "string") {
        calls.push({
          roundIndex: round.roundIndex,
          toolName: part.toolName,
          input: part.input,
        });
      }
    }
  }
  return calls;
}

const enabled = process.env.RUN_AGENT_EVAL === "true" && Boolean(getLocalDatabaseTestUrl());
const describeEval = enabled ? describe : describe.skip;

if (process.env.RUN_AGENT_EVAL === "true" && !process.env.AI_GATEWAY_API_KEY)
  throw new Error("AI_GATEWAY_API_KEY must be set for the agent eval.");
if (process.env.RUN_AGENT_EVAL === "true" && process.env.WORKFLOW_TARGET_WORLD !== "@workflow/world-postgres") {
  throw new Error(
    "WORKFLOW_TARGET_WORLD=@workflow/world-postgres must be set for the app server and agent eval so approval hooks share state.",
  );
}

const adaId = randomUUID();
const acmeId = randomUUID();
const globexId = randomUUID();
const throwawayId = randomUUID();
const sweepId = randomUUID();
const stoppableId = randomUUID();
const novaDealId = randomUUID();
const evalRoleId = randomUUID();

describeEval("agent live eval", () => {
  beforeAll(async () => {
    const anchor = new Date();
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.company.create({ data: { id: sentinelCompanyId } });
      await prisma.subscription.create({
        data: {
          companyId,
          status: "active",
          plan: "starter",
          agentCreditAnchorAt: anchor,
        },
      });
      await prisma.userRole.create({
        data: {
          id: evalRoleId,
          name: `eval-${evalRoleId}`,
          isSystemRole: false,
          companyId,
        },
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
        data: {
          id: throwawayId,
          companyId,
          firstName: "Throwaway",
          lastName: "Duplicate",
        },
      });
      await prisma.contact.create({
        data: {
          id: sweepId,
          companyId,
          firstName: "Sweepable",
          lastName: "Placeholder",
        },
      });
      await prisma.contact.create({
        data: {
          id: stoppableId,
          companyId,
          firstName: "Stoppable",
          lastName: "Placeholder",
        },
      });
      await prisma.organization.create({
        data: { id: acmeId, companyId, name: "ACME GmbH" },
      });
      await prisma.organization.create({
        data: { id: globexId, companyId, name: "Globex" },
      });
      await prisma.deal.create({
        data: { id: novaDealId, companyId, name: "Nova Expansion" },
      });
      await prisma.contact.create({
        data: {
          companyId: sentinelCompanyId,
          firstName: "Sentinel",
          lastName: "Person",
        },
      });
    });

    await mintEvalSession();
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.auditLog.deleteMany({
        where: { companyId: { in: [companyId, sentinelCompanyId] } },
      });
      await prisma.company.deleteMany({
        where: { id: { in: [companyId, sentinelCompanyId] } },
      });
    });
    await prisma.$disconnect();
  });

  it("updates the current Contacts All view from its Ask AI appearance context and preserves omitted state", async () => {
    const initialFilters = [{ field: "firstName", operator: "contains", value: "Ada" }];
    await runWithoutTenant(() =>
      prisma.p13n.upsert({
        where: {
          companyId_userId_p13nId: {
            companyId,
            userId,
            p13nId: SURFACE.contacts,
          },
        },
        create: {
          companyId,
          userId,
          p13nId: SURFACE.contacts,
          activeViewKey: ALL_VIEW_KEY,
          filters: initialFilters,
          searchTerm: "Lovelace",
          sortDescriptor: { field: "name", direction: "asc" },
          pagination: { pageSize: 25 },
          columnOrder: [],
          hiddenColumns: [],
          viewMode: "card",
        },
        update: {
          activeViewKey: ALL_VIEW_KEY,
          filters: initialFilters,
          searchTerm: "Lovelace",
          sortDescriptor: { field: "name", direction: "asc" },
          pagination: { pageSize: 25 },
          viewMode: "card",
        },
      }),
    );

    const pageRoute = `/en/contacts?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.contacts}&viewAction=update`;
    const { frames, conversationId } = await runTurn({
      pageRoute,
      text:
        "Context: Contacts.\n" +
        "Update the appearance of my current view “All”. Keep any settings I do not mention.\n\n" +
        "Switch this current Contacts view to the table layout and sort by name descending. Keep every other setting.",
    });

    expect(
      frames.some((frame) => frame.type === "approval_request"),
      JSON.stringify(frames),
    ).toBe(false);
    expectViewActivity(frames, {
      kind: "views.configure",
      surfaceKey: SURFACE.contacts,
      action: "update",
      viewKey: ALL_VIEW_KEY,
    });
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activity_result",
          isError: false,
          viewHref: `/contacts?view=${ALL_VIEW_KEY}`,
        }),
      ]),
    );
    expect(visibleReply(frames)).not.toContain("/contacts?view=");

    const stored = await runWithoutTenant(() =>
      prisma.p13n.findUniqueOrThrow({
        where: {
          companyId_userId_p13nId: {
            companyId,
            userId,
            p13nId: SURFACE.contacts,
          },
        },
      }),
    );
    expect(stored).toMatchObject({
      activeViewKey: ALL_VIEW_KEY,
      filters: initialFilters,
      searchTerm: "Lovelace",
      sortDescriptor: { field: "name", direction: "desc" },
      pagination: { pageSize: 25 },
      viewMode: "table",
    });
    await expectShippedModel(conversationId, frames);
  });

  it("updates one named Contacts view only after reading its fresh state and preserves every omitted field", async () => {
    const viewId = randomUUID();
    const preserved = {
      filters: [{ field: "firstName", operator: "equals", value: "Ada" }],
      searchTerm: "Lovelace",
      sortDescriptor: { field: "createdAt", direction: "desc" },
      grouping: { field: "createdAt", bucket: "month" },
      columnOrder: ["firstName", "lastName"],
      columnWidths: { firstName: 220 },
      hiddenColumns: ["updatedAt"],
      pageSize: 100,
    };
    await runWithoutTenant(async () => {
      await prisma.dataView.create({
        data: {
          id: viewId,
          companyId,
          userId,
          surfaceKey: SURFACE.contacts,
          name: "Protected setup",
          position: 0,
          ...preserved,
          viewMode: "card",
        },
      });
      await prisma.p13n.update({
        where: {
          companyId_userId_p13nId: {
            companyId,
            userId,
            p13nId: SURFACE.contacts,
          },
        },
        data: { activeViewKey: viewId },
      });
    });

    const pageRoute = `/en/contacts?view=${viewId}`;
    const { frames, conversationId } = await runTurn({
      pageRoute,
      text:
        "Context: Contacts.\n" +
        "Update my named Contacts saved view “Protected setup”. Keep any settings I do not mention.\n\n" +
        "Switch only this saved view to the table layout.",
    });

    const exactReadIndex = frames.findIndex(
      (frame) =>
        frame.type === "activity" &&
        (frame.activity as { kind?: unknown; viewKey?: unknown })?.kind === "views.read" &&
        (frame.activity as { viewKey?: unknown }).viewKey === viewId,
    );
    const updateIndex = frames.findIndex(
      (frame) =>
        frame.type === "activity" &&
        (frame.activity as { kind?: unknown; viewAction?: unknown })?.kind === "views.configure" &&
        (frame.activity as { viewAction?: unknown }).viewAction === "update",
    );
    expect(exactReadIndex, JSON.stringify(frames)).toBeGreaterThanOrEqual(0);
    expect(updateIndex, JSON.stringify(frames)).toBeGreaterThan(exactReadIndex);
    expectViewActivity(frames, {
      kind: "views.configure",
      surfaceKey: SURFACE.contacts,
      action: "update",
      viewKey: viewId,
    });
    expect(await runWithoutTenant(() => prisma.dataView.findUniqueOrThrow({ where: { id: viewId } }))).toMatchObject({
      id: viewId,
      name: "Protected setup",
      ...preserved,
      viewMode: "table",
    });
    expect(
      await runWithoutTenant(() =>
        prisma.p13n.findUniqueOrThrow({
          where: {
            companyId_userId_p13nId: {
              companyId,
              userId,
              p13nId: SURFACE.contacts,
            },
          },
          select: { activeViewKey: true },
        }),
      ),
    ).toEqual({ activeViewKey: viewId });
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activity_result",
          isError: false,
          viewHref: `/contacts?view=${viewId}`,
        }),
      ]),
    );
    expect(visibleReply(frames)).not.toContain("/contacts?view=");

    const accounting = await expectShippedModel(conversationId, frames);
    const toolCalls = agentToolCalls(accounting.rounds);
    const matchingUpdates = toolCalls.filter((call) => {
      const input = call.input as {
        action?: unknown;
        viewKey?: unknown;
      } | null;
      return call.toolName === "manage_data_views" && input?.action === "update" && input.viewKey === viewId;
    });
    expect(matchingUpdates).toHaveLength(1);
    const updateCall = matchingUpdates[0];
    const rawUpdateIndex = updateCall ? toolCalls.indexOf(updateCall) : -1;
    expect(rawUpdateIndex).toBeGreaterThan(0);
    const listCall = toolCalls[rawUpdateIndex - 1];
    expect(listCall?.toolName).toBe("manage_data_views");
    expect(listCall?.input).toEqual({
      action: "list",
      surfaceKey: SURFACE.contacts,
      viewKey: viewId,
    });
    expect(listCall?.roundIndex).toBeLessThan(updateCall?.roundIndex ?? -1);
    expect(updateCall?.input).toEqual({
      action: "update",
      surfaceKey: SURFACE.contacts,
      viewKey: viewId,
      state: { viewMode: "table" },
    });
  });

  it("does not invent an unsupported Contacts filter or mutate the current view", async () => {
    const viewId = randomUUID();
    await runWithoutTenant(async () => {
      await prisma.dataView.create({
        data: {
          id: viewId,
          companyId,
          userId,
          surfaceKey: SURFACE.contacts,
          name: "Unsupported filter guard",
          position: 1,
          filters: [{ field: "lastName", operator: "contains", value: "Lovelace" }],
          searchTerm: "Ada",
          sortDescriptor: { field: "name", direction: "asc" },
          viewMode: "table",
          columnOrder: ["firstName", "lastName"],
          columnWidths: { lastName: 180 },
          hiddenColumns: ["createdAt"],
          pageSize: 25,
        },
      });
      await prisma.p13n.update({
        where: {
          companyId_userId_p13nId: {
            companyId,
            userId,
            p13nId: SURFACE.contacts,
          },
        },
        data: { activeViewKey: viewId },
      });
    });
    const [viewBefore, p13nBefore, customColumnsBefore] = await runWithoutTenant(() =>
      Promise.all([
        prisma.dataView.findUniqueOrThrow({ where: { id: viewId } }),
        prisma.p13n.findUniqueOrThrow({
          where: {
            companyId_userId_p13nId: {
              companyId,
              userId,
              p13nId: SURFACE.contacts,
            },
          },
        }),
        prisma.customColumn.findMany({
          where: { companyId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            label: true,
            type: true,
            entityType: true,
            options: true,
          },
        }),
      ]),
    );

    const { frames, conversationId } = await runTurn({
      pageRoute: `/en/contacts?view=${viewId}&viewSurface=${SURFACE.contacts}&viewAction=update`,
      text:
        "Context: Contacts.\n" +
        "Update the filters and search in my current view “Unsupported filter guard”. Keep any settings I do not mention.\n\n" +
        "Filter this view by a Purchase order number field containing 2026.",
    });

    const [viewAfter, p13nAfter, customColumnsAfter] = await runWithoutTenant(() =>
      Promise.all([
        prisma.dataView.findUniqueOrThrow({ where: { id: viewId } }),
        prisma.p13n.findUniqueOrThrow({
          where: {
            companyId_userId_p13nId: {
              companyId,
              userId,
              p13nId: SURFACE.contacts,
            },
          },
        }),
        prisma.customColumn.findMany({
          where: { companyId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            label: true,
            type: true,
            entityType: true,
            options: true,
          },
        }),
      ]),
    );
    expect(viewAfter).toEqual(viewBefore);
    expect(p13nAfter).toEqual(p13nBefore);
    expect(customColumnsAfter).toEqual(customColumnsBefore);
    expect(visibleReply(frames)).toMatch(
      /could not|couldn't|does not|doesn't|unavailable|not available|not supported|no .*field/iu,
    );
    expect(frames.at(-1)).toMatchObject({
      type: "turn_done",
      terminalCode: "completed",
    });
    await expectShippedModel(conversationId, frames);
  });

  it("creates and selects a Contacts view for linked deals without retargeting the request to Deals", async () => {
    const dealsP13nBefore = await runWithoutTenant(() =>
      prisma.p13n.findUnique({
        where: {
          companyId_userId_p13nId: { companyId, userId, p13nId: SURFACE.deals },
        },
      }),
    );
    const beforeDealViews = await runWithoutTenant(() =>
      prisma.dataView.count({
        where: { companyId, userId, surfaceKey: SURFACE.deals },
      }),
    );
    const beforeContactViews = await runWithoutTenant(() =>
      prisma.dataView.count({
        where: { companyId, userId, surfaceKey: SURFACE.contacts },
      }),
    );
    const pageRoute = `/en/contacts?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.contacts}&viewAction=create`;
    const { frames, conversationId } = await runTurn({
      pageRoute,
      text:
        "Context: Contacts.\n" +
        "Create a new view called “Contacts with deals” using the request below.\n\n" +
        "Show contacts linked to at least one deal, use the card layout, and sort by name ascending.",
    });

    expect(
      frames.some((frame) => frame.type === "approval_request"),
      JSON.stringify(frames),
    ).toBe(false);
    expectViewActivity(frames, {
      kind: "views.configure",
      surfaceKey: SURFACE.contacts,
      action: "create",
    });

    const [afterContactViews, matchingViews] = await runWithoutTenant(() =>
      Promise.all([
        prisma.dataView.count({
          where: { companyId, userId, surfaceKey: SURFACE.contacts },
        }),
        prisma.dataView.findMany({
          where: {
            companyId,
            userId,
            surfaceKey: SURFACE.contacts,
            name: "Contacts with deals",
          },
        }),
      ]),
    );
    expect(afterContactViews).toBe(beforeContactViews + 1);
    expect(matchingViews).toHaveLength(1);
    const view = matchingViews[0];
    if (!view) throw new Error("The created Contacts view could not be read back.");
    expect(view).toMatchObject({
      filters: [{ field: "dealIds", operator: "hasSome" }],
      sortDescriptor: { field: "name", direction: "asc" },
      viewMode: "card",
    });
    expect(
      await runWithoutTenant(() =>
        prisma.dataView.count({
          where: { companyId, userId, surfaceKey: SURFACE.deals },
        }),
      ),
    ).toBe(beforeDealViews);
    expect(
      await runWithoutTenant(() =>
        prisma.p13n.findUnique({
          where: {
            companyId_userId_p13nId: {
              companyId,
              userId,
              p13nId: SURFACE.deals,
            },
          },
        }),
      ),
    ).toEqual(dealsP13nBefore);
    expect(
      await runWithoutTenant(() =>
        prisma.p13n.findUniqueOrThrow({
          where: {
            companyId_userId_p13nId: {
              companyId,
              userId,
              p13nId: SURFACE.contacts,
            },
          },
          select: { activeViewKey: true },
        }),
      ),
    ).toEqual({ activeViewKey: view.id });
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activity_result",
          isError: false,
          viewHref: `/contacts?view=${view.id}`,
        }),
      ]),
    );
    expect(visibleReply(frames)).not.toContain("/contacts?view=");
    await expectShippedModel(conversationId, frames);
  });

  it("updates the current record timeline view and keeps its navigation on that record", async () => {
    await runWithoutTenant(() =>
      prisma.p13n.upsert({
        where: {
          companyId_userId_p13nId: {
            companyId,
            userId,
            p13nId: SURFACE.entityTimeline,
          },
        },
        create: {
          companyId,
          userId,
          p13nId: SURFACE.entityTimeline,
          activeViewKey: ALL_VIEW_KEY,
          filters: [{ field: "timelineKind", operator: "in", value: ["messages"] }],
          sortDescriptor: { field: "at", direction: "asc" },
          columnOrder: [],
          hiddenColumns: [],
        },
        update: {
          activeViewKey: ALL_VIEW_KEY,
          filters: [{ field: "timelineKind", operator: "in", value: ["messages"] }],
          sortDescriptor: { field: "at", direction: "asc" },
        },
      }),
    );
    const pageRoute = `/de/contacts/${adaId}?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.entityTimeline}&viewAction=update`;
    const { frames, conversationId } = await runTurn({
      locale: "de",
      pageRoute,
      text:
        "Kontext: Aktivitätenverlauf dieses Datensatzes.\n" +
        "Passe die Aktivitätsfilter oder die Sortierung meiner aktuellen Verlaufsansicht „Alle“ an. Behalte alle Einstellungen bei, die ich nicht erwähne.\n\n" +
        "Zeige nur Datensatzänderungen und sortiere die neuesten Aktivitäten zuerst.",
    });

    expect(
      frames.some((frame) => frame.type === "approval_request"),
      JSON.stringify(frames),
    ).toBe(false);
    expectViewActivity(frames, {
      kind: "views.configure",
      surfaceKey: SURFACE.entityTimeline,
      action: "update",
      viewKey: ALL_VIEW_KEY,
    });
    const expectedHref = `/contacts/${adaId}?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.entityTimeline}`;
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activity_result",
          isError: false,
          viewHref: expectedHref,
        }),
      ]),
    );
    expect(visibleReply(frames)).not.toContain(`/contacts/${adaId}`);
    expect(visibleReply(frames)).toMatch(/erledigt|ansicht|aktivität|aktualisiert|geändert|eingestellt|sortiert/iu);
    const stored = await runWithoutTenant(() =>
      prisma.p13n.findUniqueOrThrow({
        where: {
          companyId_userId_p13nId: {
            companyId,
            userId,
            p13nId: SURFACE.entityTimeline,
          },
        },
      }),
    );
    expect(stored).toMatchObject({
      activeViewKey: ALL_VIEW_KEY,
      filters: [{ field: "timelineKind", operator: "in", value: ["changes"] }],
      sortDescriptor: { field: "at", direction: "desc" },
    });
    await expectShippedModel(conversationId, frames);
  });

  it("requires approval before deleting a saved view and keeps it when approval is rejected", async () => {
    const viewId = randomUUID();
    await runWithoutTenant(() =>
      prisma.dataView.create({
        data: {
          id: viewId,
          companyId,
          userId,
          surfaceKey: SURFACE.contacts,
          name: "Deletion guard",
          position: 2,
          viewMode: "table",
        },
      }),
    );
    const { frames, conversationId } = await runTurn({
      pageRoute: `/en/contacts?view=${viewId}`,
      text: 'Delete my saved Contacts view "Deletion guard".',
      onApproval: "reject",
    });

    expectViewActivity(frames, {
      kind: "views.delete",
      surfaceKey: SURFACE.contacts,
      action: "delete",
      viewKey: viewId,
    });
    expect(
      await runWithoutTenant(() =>
        prisma.dataView.count({
          where: {
            id: viewId,
            companyId,
            userId,
            surfaceKey: SURFACE.contacts,
          },
        }),
      ),
    ).toBe(1);
    await expectShippedModel(conversationId, frames);
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
          getCancelAgentTurnInteractor().invoke({
            conversationId: conversation,
          }),
        );
        expect(result.ok && result.data.cancelling, JSON.stringify(result)).toBe(true);
      },
    });

    expect(stopped, JSON.stringify(frames)).toBe(true);
    expect(frames.at(-1)).toMatchObject({
      type: "turn_done",
      terminalCode: "cancelled",
    });
    expect(await countRows(companyId)).toEqual(before);
    expect(await runWithoutTenant(() => prisma.contact.count({ where: { companyId, id: stoppableId } }))).toBe(1);

    const { turn } = await expectAccountingToBalance(conversationId, frames);
    expect(turn.terminalCode).toBe("cancelled");

    const lease = await runWithoutTenant(() => prisma.agentRunLease.findFirst({ where: { conversationId } }));
    expect(lease).toBeNull();
  });

  it("points at the control that opens the kanban layout, never past its prerequisite", async () => {
    const { frames } = await runTurn({
      text: "Open the Deals page and show me where I can switch to the kanban board myself. Do not change a saved view.",
    });

    const commands = frames.filter((frame) => frame.type === "ui_command");
    const targets = commands
      .flatMap((frame) => {
        const input = frame.input as {
          targetId?: string;
          steps?: { targetId?: string }[];
        };
        return frame.name === "start_tour" ? (input.steps ?? []).map((step) => step.targetId) : [input.targetId];
      })
      .filter((target): target is string => Boolean(target));

    for (const target of targets) expect(AGENT_UI_TARGET_IDS).toContain(target);
    expect(targets, JSON.stringify(frames)).toContain("deals-display-options");
    const layoutIndex = targets.indexOf("deals-layout-board");
    if (layoutIndex >= 0) expect(targets.indexOf("deals-display-options")).toBeLessThan(layoutIndex);
    expect(
      frames.some(
        (frame) => frame.type === "activity" && (frame.activity as { kind?: unknown })?.kind === "views.configure",
      ),
      JSON.stringify(frames),
    ).toBe(false);
    expect(frames.at(-1)).toMatchObject({
      type: "turn_done",
      terminalCode: "completed",
    });
  });

  it("opens the deal Nova Expansion on its page and never in the drawer", async () => {
    const { frames } = await runTurn({ text: "Open the deal Nova Expansion." });

    const navigations = frames.filter((frame) => frame.type === "ui_command" && frame.name === "navigate");
    expect(navigations, JSON.stringify(frames)).toHaveLength(1);
    expect(navigations[0]?.input).toEqual({
      entity: "deal",
      recordId: novaDealId,
    });
    expect(JSON.stringify(frames)).not.toContain("?open=");
    expect(frames.at(-1)).toMatchObject({
      type: "turn_done",
      terminalCode: "completed",
    });
  });

  it("composes a guided tour with real targets and notes", async () => {
    const { frames } = await runTurn({
      text: "Give me a quick tour of contacts, deals, and the dashboard.",
    });

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

    expect(
      frames.some((frame) => frame.type === "approval_request"),
      JSON.stringify(frames),
    ).toBe(false);
    const after = await countRows(companyId);
    expect(after, JSON.stringify(frames)).toEqual({
      ...before,
      contactOrganization: before.contactOrganization + 1,
    });
    expect(await countRows(sentinelCompanyId)).toEqual(sentinelBefore);
    expect(
      await runWithoutTenant(() =>
        prisma.contactOrganization.count({
          where: { companyId, contactId: adaId, organizationId: acmeId },
        }),
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

    expect(
      frames.some((frame) => frame.type === "approval_request"),
      JSON.stringify(frames),
    ).toBe(false);
    const after = await countRows(companyId);
    expect(after, JSON.stringify(frames)).toEqual({
      ...before,
      contactOrganization: before.contactOrganization - 1,
    });
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
    expect(await runWithoutTenant(() => prisma.contact.count({ where: { companyId, id: throwawayId } }))).toBe(1);
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
            prisma.agentRunLease.findFirst({
              where: { conversationId: conversation },
            }),
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

    expect(frames.at(-1)).toMatchObject({
      type: "turn_done",
      terminalCode: "completed",
    });
    expect(await runWithoutTenant(() => prisma.contact.count({ where: { companyId, id: sweepId } }))).toBe(0);
    expect(await countRows(companyId)).toEqual({
      ...before,
      contact: before.contact - 1,
    });
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
          getCancelAgentTurnInteractor().invoke({
            conversationId: conversation,
          }),
        );
        expect(result.ok).toBe(true);
      },
    });

    expect(cancelled, JSON.stringify(frames)).toBe(true);
    expect(frames.at(-1)).toMatchObject({
      type: "turn_done",
      terminalCode: "cancelled",
    });
    expect(await countRows(companyId)).toEqual(before);

    const { turn, rounds, usage } = await expectAccountingToBalance(conversationId, frames);
    expect(turn.terminalCode).toBe("cancelled");
    expect(usage?.state).toBe("settled");
    expect(rounds.length).toBeGreaterThan(0);
  });
});
