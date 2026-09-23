import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { Pool } from "pg";

import type { BenchmarkArm } from "./arms";
import type { Campaign } from "./campaign";
import type { BenchmarkDb, CaseId, Fixture, ObservedTurn, OracleResult } from "./fixtures";
import type { JudgeVerdict } from "./judge";
import type { SseFrame, SseTiming } from "./sse";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { agentToolOutcomeStatus } from "@/ee/agent-chat/agent-durable-stream";
import { AGENT_PANEL_TOOL_NAMES, isAgentPanelTool } from "@/ee/agent-chat/agent-ui-command";
import { respondToApprovalAs, respondToUiCommandAs } from "@/tests/helpers/agent-benchmark-responder";

import { armModelKey } from "./arms";
import { admitEpisode, recordCharge, registerEpisode, updateEpisode } from "./campaign";
import { BENCHMARK_CASES, scoreBenchmarkCase, seedBenchmarkCase } from "./fixtures";
import { mintBenchmarkSession } from "./session";
import { readSseFrames } from "./sse";

const TURN_TIMEOUT_MS = 15 * 60 * 1000;
const MICROCENTS_PER_USD = 100_000_000;


function assertKnownPanelTool(name: string) {
  if (isAgentPanelTool(name)) return;
  throw new Error(
    `The run received a ui_command for "${name}", which this build does not define (${AGENT_PANEL_TOOL_NAMES.join(", ")}). ` +
      "Another application process is executing this run's workflow steps against the same database. " +
      "Stop it, or point this run at its own database, and start over.",
  );
}

export type TurnRecord = {
  index: number;
  prompt: string;
  conversationId: string | null;
  status: number;
  timing: SseTiming;
  wallMs: number;
  terminal: Record<string, unknown> | null;
  uiCommands: string[];
  approvals: { requestId: string; decision: string }[];
  frameCount: number;
  error: string | null;
  responderError?: string;
};

export type RoundMetric = {
  turnRequestId: string;
  roundIndex: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costMicrocents: string;
  finishReason: string;
  createdAt: string;
};

export type EpisodeArtifact = {
  campaignId: string;
  episodeId: string;
  arm: string;
  modelKey: string;
  caseId: CaseId;
  title: string;
  repetition: number;
  runtimeVariant: string;
  namespace: string;
  companyId: string;
  actorUserId: string;
  prompts: readonly string[];
  judgeFacts: readonly string[];
  turns: TurnRecord[];
  observed: ObservedTurn[];
  metrics: { turns: { id: string; status: string; terminalCode: string | null; stopReason: string | null; modelSpec: string | null; servingProvider: string | null; createdAt: string; providerStartedAt: string | null; terminalAt: string | null }[]; rounds: RoundMetric[] };
  usage: { turnRequestId: string | null; costMicrocents: string; costSource: string; chargedCredits: number; state: string; model: string }[];
  usd: number;
  measuredShare: number;
  oracle: OracleResult | null;
  eligibility: { exactPrompts: boolean; oneConversation: boolean; expectedTurnCount: boolean; correctRoute: boolean; allTurnsTerminal: boolean };
  skipped: string | null;
  capturedAt: string;
  judge?: JudgeVerdict;
};

export type EpisodeRequest = {
  db: BenchmarkDb;
  pool: Pool;
  appUrl: string;
  campaign: Campaign;
  arm: BenchmarkArm;
  caseId: CaseId;
  repetition: number;
  runtimeVariant: string;
  outputDir: string;
  approvalDecision?: "approve" | "reject";
};

function approvalPolicy(caseId: CaseId, override?: "approve" | "reject"): "approve" | "reject" {
  return override ?? (caseId === "M8" || caseId === "N24" ? "reject" : "reject");
}

async function respondToUiCommand(fixture: Fixture, conversationId: string, frame: SseFrame) {
  await respondToUiCommandAs(
    { companyId: fixture.companyId, userId: fixture.actorUserId },
    { conversationId, commandId: String(frame.commandId), name: String(frame.name) },
  );
}

async function respondToApproval(fixture: Fixture, conversationId: string, frame: SseFrame, decision: "approve" | "reject") {
  await respondToApprovalAs(
    { companyId: fixture.companyId, userId: fixture.actorUserId },
    { conversationId, requestId: String(frame.requestId), decision },
  );
}

async function runTurn(input: {
  appUrl: string;
  cookie: string;
  fixture: Fixture;
  modelKey: string;
  prompt: string;
  index: number;
  conversationId: string | null;
  approvalDecision: "approve" | "reject";
}): Promise<TurnRecord> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
  const record: TurnRecord = {
    index: input.index,
    prompt: input.prompt,
    conversationId: input.conversationId,
    status: 0,
    timing: { firstFrameMs: null, firstOutputMs: null, firstDeltaMs: null, lastFrameMs: null },
    wallMs: 0,
    terminal: null,
    uiCommands: [],
    approvals: [],
    frameCount: 0,
    error: null,
  };
  try {
    const response = await fetch(`${input.appUrl}/api/agent/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: input.cookie },
      signal: controller.signal,
      body: JSON.stringify({
        clientRequestId: crypto.randomUUID(),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        modelKey: input.modelKey,
        text: input.prompt,
        retry: false,
      }),
    });
    record.status = response.status;
    record.conversationId = response.headers.get("x-conversation-id") ?? input.conversationId;
    if (!response.ok) {
      record.error = `admission ${response.status}: ${(await response.text()).slice(0, 500)}`;
      return record;
    }
    const conversationId = record.conversationId;
    if (!conversationId) {
      record.error = "no conversation id";
      return record;
    }
    const { frames, timing } = await readSseFrames(response, startedAt, async (frame) => {
      try {
        if (frame.type === "ui_command") {
          assertKnownPanelTool(String(frame.name));
          record.uiCommands.push(String(frame.name));
          await respondToUiCommand(input.fixture, conversationId, frame);
        }
        if (frame.type === "approval_request") {
          record.approvals.push({ requestId: String(frame.requestId), decision: input.approvalDecision });
          await respondToApproval(input.fixture, conversationId, frame, input.approvalDecision);
        }
      } catch (error) {
        record.responderError = error instanceof Error ? error.message : String(error);
      }
    });
    record.frameCount = frames.length;
    record.timing = timing;
    const terminal = frames.find((frame) => frame.type === "turn_done");
    record.terminal = terminal ? { ...terminal } : null;
    if (!terminal) record.error = "stream ended without turn_done";
    return record;
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    return record;
  } finally {
    clearTimeout(timer);
    record.wallMs = Date.now() - startedAt;
  }
}

async function observeEpisode(db: BenchmarkDb, fixture: Fixture) {
  const turns = await runWithoutTenant(() =>
    db.prisma.agentTurnRequest.findMany({
      where: { companyId: fixture.companyId, userId: fixture.actorUserId },
      orderBy: { createdAt: "asc" },
      include: { rounds: { orderBy: { roundIndex: "asc" } }, messages: { orderBy: { sequence: "asc" } } },
    }),
  );
  const observed: ObservedTurn[] = [];
  const metrics: EpisodeArtifact["metrics"] = { turns: [], rounds: [] };
  for (const turn of turns) {
    const assistant = turn.messages.filter((message) => message.role === "assistant");
    const visibleParts = assistant.flatMap((message) => (Array.isArray(message.parts) ? message.parts : [])) as Record<string, unknown>[];
    const text = visibleParts
      .filter((part) => part.type === "text")
      .map((part) => String(part.text ?? ""))
      .join("\n");
    const rawParts = turn.rounds.flatMap((round) => (Array.isArray(round.parts) ? round.parts : [])) as Record<string, unknown>[];
    const tools = rawParts
      .filter((part) => part.type === "tool-call")
      .map((part) => {
        const result = rawParts.find(
          (value) => ["tool-result", "tool-error", "tool-output-denied"].includes(String(value.type)) && value.toolCallId === part.toolCallId,
        );
        const activity = visibleParts.find((value) => value.type === "activity" && value.id === part.toolCallId);
        const wrapped = result?.output;
        const output = wrapped && typeof wrapped === "object" && "value" in wrapped ? (wrapped as { value: unknown }).value : wrapped;
        const status =
          result?.type === "tool-error"
            ? "error"
            : result?.type === "tool-output-denied"
              ? "cancelled"
              : result?.type === "tool-result" && output !== undefined
                ? agentToolOutcomeStatus(output).status
                : (activity?.status as string | undefined);
        const outcome = status === "done" ? "ok" : status === "error" ? "error" : status === "cancelled" ? "cancelled" : undefined;
        return { name: String(part.toolName), input: part.input, output, status, outcome } as ObservedTurn["tools"][number];
      });
    const approvals = await runWithoutTenant(() =>
      db.prisma.agentApproval.findMany({ where: { companyId: fixture.companyId, conversationId: turn.conversationId } }),
    );
    observed.push({
      text,
      tools,
      terminalCode: turn.terminalCode ?? turn.status,
      approvalDecisions: approvals.flatMap((item) =>
        item.decision === "reject" ? ["reject" as const] : item.decision === "approve" ? ["approve" as const] : [],
      ),
    });
    metrics.turns.push({
      id: turn.id,
      status: turn.status,
      terminalCode: turn.terminalCode,
      stopReason: turn.stopReason,
      modelSpec: turn.modelSpec,
      servingProvider: turn.servingProvider,
      createdAt: turn.createdAt.toISOString(),
      providerStartedAt: turn.providerStartedAt?.toISOString() ?? null,
      terminalAt: turn.terminalAt?.toISOString() ?? null,
    });
    for (const round of turn.rounds)
      metrics.rounds.push({
        turnRequestId: turn.id,
        roundIndex: round.roundIndex,
        inputTokens: round.inputTokens,
        outputTokens: round.outputTokens,
        cacheReadTokens: round.cacheReadTokens,
        cacheWriteTokens: round.cacheWriteTokens,
        reasoningTokens: round.reasoningTokens,
        costMicrocents: round.costMicrocents.toString(),
        finishReason: round.finishReason,
        createdAt: round.createdAt.toISOString(),
      });
  }
  const usage = await runWithoutTenant(() =>
    db.prisma.agentUsageEvent.findMany({ where: { companyId: fixture.companyId, userId: fixture.actorUserId }, orderBy: { createdAt: "asc" } }),
  );
  return {
    turns,
    observed,
    metrics,
    usage: usage.map((event) => ({
      turnRequestId: event.turnRequestId,
      costMicrocents: event.costMicrocents.toString(),
      costSource: event.costSource,
      chargedCredits: event.chargedCredits,
      state: event.state,
      model: event.model,
    })),
  };
}

const MAX_FIXTURE_ATTEMPTS = 6;

async function seedFreshBenchmarkCase(db: BenchmarkDb, caseId: CaseId, baseNamespace: string) {
  for (let attempt = 1; attempt <= MAX_FIXTURE_ATTEMPTS; attempt += 1) {
    const namespace = attempt === 1 ? baseNamespace : `${baseNamespace}:t${attempt}`;
    try {
      return await seedBenchmarkCase(db, caseId, namespace);
    } catch (error) {
      const exhausted = attempt === MAX_FIXTURE_ATTEMPTS;
      const taken = error instanceof Error && error.message.startsWith("Fixture namespace already exists");
      if (!taken || exhausted) throw error;
    }
  }
  throw new Error("unreachable");
}

export async function runEpisode(request: EpisodeRequest): Promise<EpisodeArtifact> {
  const definition = BENCHMARK_CASES.find((entry) => entry.id === request.caseId);
  if (!definition) throw new Error(`Unknown case ${request.caseId}.`);
  const baseNamespace = `${request.campaign.id}:${request.runtimeVariant}:${request.arm.id}:r${request.repetition}`;
  const fixture = await seedFreshBenchmarkCase(request.db, request.caseId, baseNamespace);
  const episodeId = await registerEpisode(request.pool, {
    campaignId: request.campaign.id,
    arm: request.arm.id,
    caseId: request.caseId,
    repetition: request.repetition,
    runtimeVariant: request.runtimeVariant,
    namespace: fixture.namespace,
    companyId: fixture.companyId,
    actorUserId: fixture.actorUserId,
  });
  const modelKey = armModelKey(request.arm);
  const artifact: EpisodeArtifact = {
    campaignId: request.campaign.id,
    episodeId,
    arm: request.arm.id,
    modelKey,
    caseId: request.caseId,
    title: definition.title,
    repetition: request.repetition,
    runtimeVariant: request.runtimeVariant,
    namespace: fixture.namespace,
    companyId: fixture.companyId,
    actorUserId: fixture.actorUserId,
    prompts: definition.prompts,
    judgeFacts: definition.judgeFacts ?? [],
    turns: [],
    observed: [],
    metrics: { turns: [], rounds: [] },
    usage: [],
    usd: 0,
    measuredShare: 0,
    oracle: null,
    eligibility: { exactPrompts: false, oneConversation: false, expectedTurnCount: false, correctRoute: false, allTurnsTerminal: false },
    skipped: null,
    capturedAt: "",
  };
  const artifactPath = resolve(request.outputDir, request.runtimeVariant, request.arm.id, `${request.caseId}-r${request.repetition}.json`);

  const admission = await admitEpisode(request.pool, request.campaign, request.arm, definition.prompts.length);
  if (!admission.admitted) {
    artifact.skipped = `campaign cap: spent ${admission.spentUsd.toFixed(4)} USD, worst case ${admission.worstCaseUsd.toFixed(4)} USD, headroom ${admission.headroomUsd.toFixed(4)} USD`;
    await updateEpisode(request.pool, episodeId, "skipped", artifact.skipped, null);
    artifact.capturedAt = new Date().toISOString();
    await persist(artifactPath, artifact);
    return artifact;
  }

  await updateEpisode(request.pool, episodeId, "running", null, null);
  const cookie = await mintBenchmarkSession(request.db.prisma, fixture.actorUserId);
  let conversationId: string | null = null;
  for (const [index, prompt] of definition.prompts.entries()) {
    const turn = await runTurn({
      appUrl: request.appUrl,
      cookie,
      fixture,
      modelKey,
      prompt,
      index,
      conversationId,
      approvalDecision: approvalPolicy(request.caseId, request.approvalDecision),
    });
    artifact.turns.push(turn);
    conversationId = turn.conversationId;
    if (turn.error) break;
  }

  const observation = await observeEpisode(request.db, fixture);
  artifact.observed = observation.observed;
  artifact.metrics = observation.metrics;
  artifact.usage = observation.usage;
  const submittedPrompts = observation.turns.flatMap((turn) =>
    turn.messages
      .filter((message) => message.role === "user")
      .map((message) =>
        (Array.isArray(message.parts) ? message.parts : [])
          .filter((part) => part && typeof part === "object" && "type" in part && (part as { type?: string }).type === "text")
          .map((part) => String((part as { text?: string }).text ?? ""))
          .join(""),
      ),
  );
  artifact.eligibility = {
    exactPrompts: JSON.stringify(submittedPrompts) === JSON.stringify(definition.prompts),
    oneConversation: observation.turns.length > 0 && new Set(observation.turns.map((turn) => turn.conversationId)).size === 1,
    expectedTurnCount: observation.turns.length === definition.prompts.length,
    correctRoute: observation.turns.length > 0 && observation.turns.every((turn) => turn.modelSpec === request.arm.modelId && turn.servingProvider === request.arm.servingProvider),
    allTurnsTerminal: observation.turns.length > 0 && observation.turns.every((turn) => turn.terminalAt !== null),
  };

  const totalMicrocents = observation.usage.reduce((total, event) => total + BigInt(event.costMicrocents), 0n);
  artifact.usd = Number(totalMicrocents) / MICROCENTS_PER_USD;
  const measured = observation.usage.filter((event) => event.costSource === "measured").length;
  artifact.measuredShare = observation.usage.length ? measured / observation.usage.length : 0;
  for (const event of observation.usage)
    await recordCharge(request.pool, request.campaign.id, episodeId, "turn", Number(BigInt(event.costMicrocents)) / MICROCENTS_PER_USD, event.costSource === "measured", {
      turnRequestId: event.turnRequestId,
      chargedCredits: event.chargedCredits,
      state: event.state,
    });

  const responderFailure = artifact.turns.find((turn) => turn.responderError)?.responderError;
  if (responderFailure) {
    artifact.skipped = `the benchmark responder failed, so this episode observes the harness and not the assistant: ${responderFailure}`;
    await updateEpisode(request.pool, episodeId, "skipped", artifact.skipped, artifactPath);
  } else if (!artifact.eligibility.expectedTurnCount) {
    artifact.skipped = `actor turn count ${observation.turns.length} does not equal prompt count ${definition.prompts.length}`;
    await updateEpisode(request.pool, episodeId, "skipped", artifact.skipped, artifactPath);
  } else {
    artifact.oracle = await scoreBenchmarkCase(request.db, fixture, { turns: observation.observed });
    await updateEpisode(request.pool, episodeId, "scored", null, artifactPath);
  }
  artifact.capturedAt = new Date().toISOString();
  await persist(artifactPath, artifact);
  return artifact;
}

export async function persist(path: string, artifact: EpisodeArtifact) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(artifact, null, 2) + "\n");
}
