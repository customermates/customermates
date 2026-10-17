import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma";
import type { AgentE2eCase, TurnObservation } from "./cases";
import type { Fixture } from "./fixture";
import type { SseFrame, SseTiming } from "./sse";

import { readSseFrames } from "./sse";

const TURN_TIMEOUT_MS = 5 * 60 * 1000;

export type ApprovalResponder = (
  conversationId: string,
  requestId: string,
  decision: "approve" | "reject",
) => Promise<void>;

export type TurnResult = {
  observation: TurnObservation;
  timing: SseTiming;
  totalMs: number;
  rounds: number;
  error: string | null;
};

function partsOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

async function observeConversation(prisma: PrismaClient, fixture: Fixture, conversationId: string) {
  const turns = await prisma.agentTurnRequest.findMany({
    where: { companyId: fixture.companyId, conversationId },
    orderBy: { createdAt: "asc" },
    include: { rounds: { orderBy: { roundIndex: "asc" } }, messages: { orderBy: { sequence: "asc" } } },
  });
  const reply = turns
    .flatMap((turn) => turn.messages.filter((message) => message.role === "assistant"))
    .flatMap((message) => partsOf(message.parts))
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""))
    .join("\n");
  const toolNames = turns
    .flatMap((turn) => turn.rounds)
    .flatMap((round) => partsOf(round.parts))
    .filter((part) => part.type === "tool-call")
    .map((part) => String(part.toolName));
  const last = turns.at(-1);
  return {
    reply,
    toolNames,
    terminalCode: last?.terminalCode ?? null,
    rounds: turns.reduce((sum, turn) => sum + turn.rounds.length, 0),
  };
}

export async function runCaseTurn(args: {
  appUrl: string;
  prisma: PrismaClient;
  fixture: Fixture;
  testCase: AgentE2eCase;
  respond: ApprovalResponder;
}): Promise<TurnResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
  const emptyTiming: SseTiming = { firstOutputMs: null, firstTextMs: null, lastFrameMs: null };
  let conversationId: string | null = null;
  let approvalsRequested = 0;
  let timing = emptyTiming;
  let error: string | null = null;
  try {
    const response = await fetch(`${args.appUrl}/api/agent/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: args.fixture.cookie },
      signal: controller.signal,
      body: JSON.stringify({
        clientRequestId: randomUUID(),
        text: args.testCase.prompt,
        contexts: [],
        locale: args.testCase.locale,
        pageContext: { route: args.testCase.pageRoute },
        retry: false,
      }),
    });
    conversationId = response.headers.get("x-conversation-id");
    if (!response.ok) throw new Error(`admission ${response.status}: ${(await response.text()).slice(0, 300)}`);
    if (!conversationId) throw new Error("the response carried no conversation id");
    const activeConversationId = conversationId;
    const handled = new Set<string>();
    const onFrame = async (frame: SseFrame) => {
      if (frame.type !== "approval_request") return;
      const requestId = String(frame.requestId);
      if (handled.has(requestId)) return;
      handled.add(requestId);
      approvalsRequested += 1;
      await args.respond(activeConversationId, requestId, args.testCase.approval);
    };
    const read = await readSseFrames(response, startedAt, onFrame);
    timing = read.timing;
    if (!read.frames.some((frame) => frame.type === "turn_done")) error = "the stream ended without turn_done";
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    clearTimeout(timer);
  }
  const totalMs = Date.now() - startedAt;
  const observed = conversationId
    ? await observeConversation(args.prisma, args.fixture, conversationId)
    : { reply: "", toolNames: [], terminalCode: null, rounds: 0 };
  return {
    observation: {
      conversationId,
      reply: observed.reply,
      toolNames: observed.toolNames,
      approvalsRequested,
      terminalCode: observed.terminalCode,
    },
    timing,
    totalMs,
    rounds: observed.rounds,
    error,
  };
}
