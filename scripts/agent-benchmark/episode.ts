import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import type { Pool } from "pg";

import type { BenchmarkArm } from "./arms";
import type { Campaign } from "./campaign";
import type {
  BenchmarkCase,
  BenchmarkCaseDriver,
  BenchmarkDb, CaseId, Fixture, ObservedTurn,
  OracleCheck,
  OracleResult,
} from "./fixtures";
import type { JudgeVerdict } from "./judge";
import type { SseFrame, SseTiming } from "./sse";
import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { agentToolOutcomeStatus } from "@/ee/agent-chat/agent-durable-stream";
import { AGENT_PANEL_TOOL_NAMES, isAgentPanelTool,
} from "@/ee/agent-chat/agent-ui-command";
import { AGENT_RUN_LEASE_MS } from "@/ee/agent-chat/agent-turn-request";
import { resolveAgentModel } from "@/ee/agent-chat/model-catalog";
import {
  cancelAgentTurnAs,
  expireAgentRunLeaseAs,
  respondToApprovalAs,
  respondToUiCommandAs,
} from "@/tests/helpers/agent-benchmark-responder";

import { armModelKey } from "./arms";
import { resolveBenchmarkRuntimeSource } from "./build-source";
import {
  completeEpisode,
  recordCharge,
  registerEpisode,
  reserveCharge,
  settleReservedCharge,
  updateEpisode,
  worstCaseEpisodeCredits,
  worstCaseEpisodeUsd,
} from "./campaign";
import { BENCHMARK_CASES,
  FIXTURE_VERSION,
  scoreBenchmarkCase, seedBenchmarkCase,
} from "./fixtures";
import { mintBenchmarkSession } from "./session";
import { benchmarkServerSourceError, readSseFrames } from "./sse";

const TURN_TIMEOUT_MS = 15 * 60 * 1000;
const MICROCENTS_PER_USD = 100_000_000;
const RESUME_RETRY_DELAYS_MS = [0, 500, 1500, 4000] as const;
export const ARTIFACT_SCHEMA_VERSION = 4 as const;


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
  request: { locale: string; pageRoute: string; modelKey: string | null };
  serverSourceCommit: string | null;
  uiCommands: { name: string; input: unknown }[];
  approvals: { requestId: string; decision: string }[];
  streamEvents: { type: string; activity?: unknown; viewHref?: string; isError?: boolean }[];
  frameSeqs: number[];
  detached: boolean;
  reattached: boolean;
  resumedFrameCount: number;
  resumedDeltaText: string;
  cancelRequested: boolean;
  leaseProbe: { status: string; leaseHeadroomMs: number } | null;
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
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  fixtureVersion: string;
  sourceCommit: string;
  sourceDirty: boolean;
  armConfig: BenchmarkArm;
  effectiveModelConfig: AgentModelEntry;
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
  creditCeiling: number;
  prompts: readonly string[];
  judgeFacts: readonly string[];
  comparative: boolean;
  judgeable: boolean;
  mergeRequired: boolean;
  turns: TurnRecord[];
  observed: ObservedTurn[];
  metrics: { turns: { id: string; status: string; terminalCode: string | null; stopReason: string | null; modelSpec: string | null; servingProvider: string | null; createdAt: string; providerStartedAt: string | null; terminalAt: string | null;
    }[]; rounds: RoundMetric[];
  };
  usage: { turnRequestId: string | null; costMicrocents: string; costSource: string; chargedCredits: number; state: string; model: string;
  }[];
  usd: number;
  measuredShare: number;
  oracle: OracleResult | null;
  eligibility: { exactPrompts: boolean; oneConversation: boolean; expectedTurnCount: boolean; correctRoute: boolean; allTurnsTerminal: boolean;
    accountingBalanced: boolean;
    withinCreditCeiling: boolean;
    streamSequenceUnique: boolean;
    noActiveLease: boolean;
  };
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

let cachedSourceIdentity: { sourceCommit: string; sourceDirty: boolean } | null = null;

export function benchmarkSourceIdentity(options?: { refresh?: boolean }) {
  if (cachedSourceIdentity && !options?.refresh) return cachedSourceIdentity;
  cachedSourceIdentity = resolveBenchmarkRuntimeSource();
  return cachedSourceIdentity;
}

function approvalPolicy(
  definition: BenchmarkCase, override?: "approve" | "reject",
): "approve" | "reject" | "ignore" {
  return definition.driver?.approval ?? override ?? "reject";
}

async function respondToUiCommand(fixture: Fixture, conversationId: string, frame: SseFrame,
) {
  for (const delay of RESUME_RETRY_DELAYS_MS) {
    if (delay)
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    const result = await respondToUiCommandAs(
    { companyId: fixture.companyId, userId: fixture.actorUserId },
    { conversationId, commandId: String(frame.commandId), name: String(frame.name),
      },
  );
    if (!result.ok)
      throw new Error(
        `UI command response failed: ${JSON.stringify(result.error)}`,
      );
    if (result.data.resumed) return;
  }
  throw new Error(
    `UI command ${String(frame.commandId)} did not resume its workflow hook.`,
  );
}

async function respondToApproval(
  fixture: Fixture,
  conversationId: string,
  frame: SseFrame,
  decision: "approve" | "reject",
) {
  for (const delay of RESUME_RETRY_DELAYS_MS) {
    if (delay)
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    const result = await respondToApprovalAs(
      { companyId: fixture.companyId, userId: fixture.actorUserId },
      { conversationId, requestId: String(frame.requestId), decision },
    );
    if (!result.ok)
      throw new Error(
        `Approval response failed: ${JSON.stringify(result.error)}`,
      );
    if (result.data.resumed) return;
  }
  throw new Error(
    `Approval ${String(frame.requestId)} did not resume its workflow hook.`,
  );
}

async function runTurn(input: {
  db: BenchmarkDb;
  appUrl: string;
  cookie: string;
  fixture: Fixture;
  modelKey?: string;
  modelId: string;
  prompt: string;
  index: number;
  conversationId: string | null;
  locale: string;
  pageRoute: string;
  driver: BenchmarkCaseDriver;
  approvalDecision: "approve" | "reject" | "ignore";
}): Promise<TurnRecord> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
  const record: TurnRecord = {
    index: input.index,
    prompt: input.prompt,
    conversationId: input.conversationId,
    status: 0,
    timing: { firstFrameMs: null, firstDeltaMs: null, lastFrameMs: null },
    wallMs: 0,
    terminal: null,
    request: {
      locale: input.locale,
      pageRoute: input.pageRoute,
      modelKey: input.modelKey ?? null,
    },
    serverSourceCommit: null,
    uiCommands: [],
    approvals: [],
    streamEvents: [],
    frameSeqs: [],
    detached: false,
    reattached: false,
    resumedFrameCount: 0,
    resumedDeltaText: "",
    cancelRequested: false,
    leaseProbe: null,
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
        ...(input.conversationId
          ? { conversationId: input.conversationId }
          : {}),
        ...(input.modelKey ? { modelKey: input.modelKey } : {}),
        text: input.prompt,
        locale: input.locale,
        pageContext: { route: input.pageRoute },
        retry: false,
      }),
    });
    record.status = response.status;
    record.serverSourceCommit = response.headers.get(
      "x-agent-benchmark-source-commit",
    );
    record.conversationId =
      response.headers.get("x-conversation-id") ?? input.conversationId;
    if (!response.ok) {
      record.error = `admission ${response.status}: ${(await response.text()).slice(0, 500)}`;
      return record;
    }
    const expectedSourceCommit = benchmarkSourceIdentity().sourceCommit;
    const sourceError = benchmarkServerSourceError(
      expectedSourceCommit,
      record.serverSourceCommit,
    );
    if (sourceError) {
      await response.body?.cancel();
      record.error = sourceError;
      return record;
    }
    const conversationId = record.conversationId;
    if (!conversationId) {
      record.error = "no conversation id";
      return record;
    }
    const handledCommands = new Set<string>();
    const handledApprovals = new Set<string>();
    const handleFrame = async (frame: SseFrame) => {
      try {
        if (["activity", "activity_result", "approval_request"].includes(frame.type))
          record.streamEvents.push({
            type: frame.type,
            ...(frame.activity !== undefined ? { activity: frame.activity } : {}),
            ...(typeof frame.viewHref === "string" ? { viewHref: frame.viewHref } : {}),
            ...(typeof frame.isError === "boolean" ? { isError: frame.isError } : {}),
          });
        if (frame.type === "ui_command") {
          assertKnownPanelTool(String(frame.name));
          const commandId = String(frame.commandId);
          if (handledCommands.has(commandId)) return;
          handledCommands.add(commandId);
          record.uiCommands.push({
            name: String(frame.name),
            input: frame.input,
          });
          await respondToUiCommand(input.fixture, conversationId, frame);
        }
        if (frame.type === "approval_request") {
          const requestId = String(frame.requestId);
          if (handledApprovals.has(requestId)) return;
          handledApprovals.add(requestId);
          record.approvals.push({
            requestId: String(frame.requestId),
            decision: input.approvalDecision,
          });
          if (input.driver.expireOrdinaryLeaseOnApproval) {
            await expireAgentRunLeaseAs(
              {
                companyId: input.fixture.companyId,
                userId: input.fixture.actorUserId,
              },
              input.modelId,
            );
            const [turn, lease] = await runWithoutTenant(() =>
              Promise.all([
                input.db.prisma.agentTurnRequest.findFirstOrThrow({
                  where: { companyId: input.fixture.companyId, conversationId },
                  orderBy: { createdAt: "desc" },
                  select: { status: true },
                }),
                input.db.prisma.agentRunLease.findFirst({
                  where: { companyId: input.fixture.companyId, conversationId },
                  select: { expiresAt: true },
                }),
              ]),
            );
            record.leaseProbe = {
              status: turn.status,
              leaseHeadroomMs: lease
                ? lease.expiresAt.getTime() - Date.now()
                : 0,
            };
          }
          if (input.driver.cancelOn === "approval_request") {
            const result = await cancelAgentTurnAs(
              {
                companyId: input.fixture.companyId,
                userId: input.fixture.actorUserId,
              },
              conversationId,
            );
            if (!result.ok || !result.data.cancelling)
              throw new Error(`Cancel failed: ${JSON.stringify(result)}`);
            record.cancelRequested = true;
          } else if (input.approvalDecision !== "ignore") {
            await respondToApproval(
              input.fixture,
              conversationId,
              frame,
              input.approvalDecision,
            );
          }
        }
        if (
          frame.type === "activity" &&
          input.driver.cancelOn === "activity" &&
          !record.cancelRequested
        ) {
          const result = await cancelAgentTurnAs(
            {
              companyId: input.fixture.companyId,
              userId: input.fixture.actorUserId,
            },
            conversationId,
          );
          if (!result.ok)
            throw new Error(`Cancel failed: ${JSON.stringify(result)}`);
          record.cancelRequested = true;
        }
      } catch (error) {
        record.responderError =
          error instanceof Error ? error.message : String(error);
        throw error;
      }
    };
    const first = await readSseFrames(response, startedAt, handleFrame, {
      detachAfterFrames: input.driver.detachAfterFrames,
    });
    let frames = first.frames;
    record.timing = first.timing;
    record.detached = first.detached;
    if (first.detached) {
      const lastSeq = Number(frames.at(-1)?.seq);
      if (!Number.isFinite(lastSeq))
        throw new Error("Detached stream had no numeric sequence.");
      const resumedResponse = await fetch(
        `${input.appUrl}/api/agent/conversations/${conversationId}/stream?startIndex=${lastSeq + 1}`,
        { headers: { cookie: input.cookie }, signal: controller.signal },
      );
      if (!resumedResponse.ok)
        throw new Error(
          `Reattach failed with ${resumedResponse.status}: ${(await resumedResponse.text()).slice(0, 500)}`,
        );
      const resumed = await readSseFrames(
        resumedResponse,
        startedAt,
        handleFrame,
      );
      frames = [...frames, ...resumed.frames];
      record.reattached = true;
      record.resumedFrameCount = resumed.frames.length;
      record.resumedDeltaText = resumed.frames
        .filter((frame) => frame.type === "delta")
        .map((frame) => String(frame.text ?? ""))
        .join("");
      record.timing = {
        firstFrameMs: first.timing.firstFrameMs ?? resumed.timing.firstFrameMs,
        firstDeltaMs: first.timing.firstDeltaMs ?? resumed.timing.firstDeltaMs,
        lastFrameMs: resumed.timing.lastFrameMs ?? first.timing.lastFrameMs,
      };
    }
    record.frameSeqs = frames
      .map((frame) => Number(frame.seq))
      .filter(Number.isFinite);
    record.frameCount = frames.length;
    const terminal = [...frames]
      .reverse()
      .find((frame) => frame.type === "turn_done");
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
      include: {
        rounds: { orderBy: { roundIndex: "asc" } },
        messages: { orderBy: { sequence: "asc" } },
      },
    }),
  );
  const observed: ObservedTurn[] = [];
  const metrics: EpisodeArtifact["metrics"] = { turns: [], rounds: [] };
  for (const turn of turns) {
    const assistant = turn.messages.filter(
      (message) => message.role === "assistant",
    );
    const visibleParts = assistant.flatMap((message) =>
      Array.isArray(message.parts) ? message.parts : [],
    ) as Record<string, unknown>[];
    const text = visibleParts
      .filter((part) => part.type === "text")
      .map((part) => String(part.text ?? ""))
      .join("\n");
    const rawParts = turn.rounds.flatMap((round) =>
      (Array.isArray(round.parts) ? round.parts : []).map((part) => ({
        part: part as Record<string, unknown>,
        roundIndex: round.roundIndex,
      })),
    );
    const tools = rawParts
      .filter(({ part }) => part.type === "tool-call")
      .map(({ part, roundIndex }) => {
        const result = rawParts.find(
          ({ part: value }) =>
            ["tool-result", "tool-error", "tool-output-denied"].includes(
              String(value.type),
            ) && value.toolCallId === part.toolCallId,
        )?.part;
        const activity = visibleParts.find(
          (value) => value.type === "activity" && value.id === part.toolCallId,
        );
        const wrapped = result?.output;
        const output =
          wrapped && typeof wrapped === "object" && "value" in wrapped
            ? (wrapped as { value: unknown }).value
            : wrapped;
        const status =
          result?.type === "tool-error"
            ? "error"
            : result?.type === "tool-output-denied"
              ? "cancelled"
              : result?.type === "tool-result" && output !== undefined
                ? agentToolOutcomeStatus(output).status
                : (activity?.status as string | undefined);
        const outcome =
          status === "done"
            ? "ok"
            : status === "error"
              ? "error"
              : status === "cancelled"
                ? "cancelled"
                : undefined;
        return {
          name: String(part.toolName),
          input: part.input,
          output,
          status,
          outcome,
          roundIndex,
        } as ObservedTurn["tools"][number];
      });
    const approvals = await runWithoutTenant(() =>
      db.prisma.agentApproval.findMany({
        where: {
          companyId: fixture.companyId,
          conversationId: turn.conversationId,
        },
      }),
    );
    observed.push({
      text,
      tools,
      terminalCode: turn.terminalCode ?? turn.status,
      approvalDecisions: approvals.flatMap((item) =>
        item.decision === "reject"
          ? ["reject" as const]
          : item.decision === "approve"
            ? ["approve" as const]
            : [],
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
    db.prisma.agentUsageEvent.findMany({
      where: { companyId: fixture.companyId, userId: fixture.actorUserId },
      orderBy: { createdAt: "asc" },
    }),
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

async function seedFreshBenchmarkCase(
  db: BenchmarkDb,
  caseId: CaseId,
  baseNamespace: string,
  creditCeiling: number,
) {
  for (let attempt = 1; attempt <= MAX_FIXTURE_ATTEMPTS; attempt += 1) {
    const namespace =
      attempt === 1 ? baseNamespace : `${baseNamespace}:t${attempt}`;
    try {
      return await seedBenchmarkCase(db, caseId, namespace, creditCeiling);
    } catch (error) {
      const exhausted = attempt === MAX_FIXTURE_ATTEMPTS;
      const taken =
        error instanceof Error &&
        error.message.startsWith("Fixture namespace already exists");
      if (!taken || exhausted) throw error;
    }
  }
  throw new Error("unreachable");
}

function turnContext(
  definition: BenchmarkCase,
  fixture: Fixture,
  index: number,
) {
  const configured = definition.contexts?.[index] ?? {};
  const pageRoute = (configured.pageRoute ?? "/en/contacts").replace(
    /\{([^}]+)\}/g,
    (_match, key: string) => {
      const value = fixture.ids[key];
      if (!value)
        throw new Error(
          `Case ${definition.id} route references unknown fixture id ${key}.`,
        );
      return value;
    },
  );
  return { locale: configured.locale ?? "en", pageRoute };
}

function turnModelKey(
  definition: BenchmarkCase,
  index: number,
  campaignModelKey: string,
) {
  const configured = definition.contexts?.[index]?.modelKey;
  if (configured === "omit") return undefined;
  if (configured && configured !== "campaign") return configured;
  return index === 0 ? campaignModelKey : undefined;
}

export function benchmarkCaseModelSelection(
  caseId: CaseId,
  arm: BenchmarkArm,
): { modelKey: string; modelConfig: AgentModelEntry } {
  const definition = BENCHMARK_CASES.find((entry) => entry.id === caseId);
  if (!definition) throw new Error(`Unknown case ${caseId}.`);
  const campaignModelKey = armModelKey(arm);
  const modelKey =
    turnModelKey(definition, 0, campaignModelKey) ?? campaignModelKey;
  const modelConfig: AgentModelEntry =
    modelKey === campaignModelKey
      ? {
          modelId: arm.modelId,
          servingProvider: arm.servingProvider,
          inferenceRegion: arm.inferenceRegion,
          maxOutputTokens: arm.maxOutputTokens,
          maxContextTokens: arm.maxContextTokens,
          maxToolResultChars: arm.maxToolResultChars,
          ...(arm.reasoningEffort
            ? { reasoningEffort: arm.reasoningEffort }
            : {}),
          ...(arm.thinkingLevel ? { thinkingLevel: arm.thinkingLevel } : {}),
        }
      : resolveAgentModel(modelKey);
  return { modelKey, modelConfig };
}

function withIntegrityChecks(
  oracle: OracleResult,
  checks: OracleCheck[],
): OracleResult {
  return {
    ...oracle,
    checks: [...checks, ...oracle.checks],
    passed: checks.every((check) => check.passed) && oracle.passed,
  };
}

export async function runEpisode(
  request: EpisodeRequest,
): Promise<EpisodeArtifact> {
  const definition = BENCHMARK_CASES.find(
    (entry) => entry.id === request.caseId,
  );
  if (!definition) throw new Error(`Unknown case ${request.caseId}.`);
  const campaignModelKey = armModelKey(request.arm);
  const { modelKey, modelConfig: effectiveModelConfig } =
    benchmarkCaseModelSelection(request.caseId, request.arm);
  const budgetArm = { ...request.arm, ...effectiveModelConfig };
  const creditCeiling = worstCaseEpisodeCredits(
    budgetArm,
    definition.prompts.length,
  );
  const worstCaseUsd = worstCaseEpisodeUsd(
    budgetArm,
    definition.prompts.length,
  );
  const baseNamespace = `${request.campaign.id}:${request.runtimeVariant}:${request.arm.id}:r${request.repetition}`;
  const fixture = await seedFreshBenchmarkCase(
    request.db,
    request.caseId,
    baseNamespace,
    creditCeiling,
  );
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
  const source = benchmarkSourceIdentity();
  const artifact: EpisodeArtifact = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    fixtureVersion: FIXTURE_VERSION,
    ...source,
    armConfig: request.arm,
    effectiveModelConfig,
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
    creditCeiling,
    prompts: definition.prompts,
    judgeFacts: definition.judgeFacts ?? [],
    comparative: definition.comparative !== false,
    judgeable: definition.judgeable !== false,
    mergeRequired: definition.mergeRequired === true,
    turns: [],
    observed: [],
    metrics: { turns: [], rounds: [] },
    usage: [],
    usd: 0,
    measuredShare: 0,
    oracle: null,
    eligibility: {
      exactPrompts: false,
      oneConversation: false,
      expectedTurnCount: false,
      correctRoute: false,
      allTurnsTerminal: false,
      accountingBalanced: false,
      withinCreditCeiling: false,
      streamSequenceUnique: false,
      noActiveLease: false,
    },
    skipped: null,
    capturedAt: "",
  };
  const artifactPath = resolve(
    request.outputDir,
    request.runtimeVariant,
    request.arm.id,
    `${request.caseId}-r${request.repetition}.json`,
  );

  const episodeReservationId = await reserveCharge(
    request.pool,
    request.campaign.id,
    episodeId,
    "probe",
    worstCaseUsd,
    {
      purpose: "episode-worst-case",
      arm: request.arm.id,
      caseId: request.caseId,
      repetition: request.repetition,
      creditCeiling,
    },
  );
  if (!episodeReservationId) {
    artifact.skipped = `campaign cap cannot admit the ${worstCaseUsd.toFixed(4)} USD worst-case reservation`;
    artifact.capturedAt = new Date().toISOString();
    await persistAndCompleteEpisode({
      pool: request.pool,
      episodeId,
      state: "skipped",
      reason: artifact.skipped,
      artifactPath,
      artifact,
    });
    return artifact;
  }

  await updateEpisode(request.pool, episodeId, "running", null, null);
  const cookie = await mintBenchmarkSession(
    request.db.prisma,
    fixture.actorUserId,
  );
  let conversationId: string | null = null;
  for (const [index, prompt] of definition.prompts.entries()) {
    const context = turnContext(definition, fixture, index);
    const turn = await runTurn({
      db: request.db,
      appUrl: request.appUrl,
      cookie,
      fixture,
      modelKey: turnModelKey(definition, index, campaignModelKey),
      modelId: effectiveModelConfig.modelId,
      prompt,
      index,
      conversationId,
      locale: context.locale,
      pageRoute: context.pageRoute,
      driver: definition.driver ?? {},
      approvalDecision: approvalPolicy(definition, request.approvalDecision),
    });
    artifact.turns.push(turn);
    conversationId = turn.conversationId;
    if (turn.error) break;
  }

  const observation = await observeEpisode(request.db, fixture);
  artifact.observed = observation.observed.map((turn, index) => ({
    ...turn,
    streamEvents: artifact.turns[index]?.streamEvents ?? [],
  }));
  artifact.metrics = observation.metrics;
  artifact.usage = observation.usage;
  const submittedPrompts = observation.turns.flatMap((turn) =>
    turn.messages
      .filter((message) => message.role === "user")
      .map((message) =>
        (Array.isArray(message.parts) ? message.parts : [])
          .filter(
            (part) =>
              part &&
              typeof part === "object" &&
              "type" in part &&
              (part as { type?: string }).type === "text",
          )
          .map((part) => String((part as { text?: string }).text ?? ""))
          .join(""),
      ),
  );
  const accountingBalanced =
    observation.turns.length > 0 &&
    observation.turns.every((turn, index) => {
      const rounds = turn.rounds;
      const event = observation.usage.filter(
        (usage) => usage.turnRequestId === turn.id,
      );
      const terminal = artifact.turns[index]?.terminal;
      const measuredCost = rounds.reduce(
        (total, round) => total + round.costMicrocents,
        0n,
      );
      return (
        Number(terminal?.numTurns) === rounds.length &&
        rounds.every((round, roundIndex) => round.roundIndex === roundIndex) &&
        event.length === 1 &&
        event[0]?.state === "settled" &&
        (event[0]?.costSource !== "measured" ||
          BigInt(event[0].costMicrocents) === measuredCost) &&
        String(terminal?.terminalCode ?? "") ===
          String(turn.terminalCode ?? turn.status)
      );
    });
  const streamSequenceUnique = artifact.turns.every(
    (turn) =>
      turn.frameSeqs.length === turn.frameCount &&
      turn.frameSeqs.length === new Set(turn.frameSeqs).size &&
      (!turn.detached || (turn.reattached && turn.frameSeqs.length > 0)),
  );
  const activeLeases = conversationId
    ? await runWithoutTenant(() =>
        request.db.prisma.agentRunLease.count({
          where: { companyId: fixture.companyId, conversationId },
        }),
      )
    : 1;
  const totalUsageMicrocents = observation.usage.reduce(
    (total, event) => total + BigInt(event.costMicrocents),
    0n,
  );
  const totalChargedCredits = observation.usage.reduce(
    (total, event) => total + event.chargedCredits,
    0,
  );
  artifact.eligibility = {
    exactPrompts:
      JSON.stringify(submittedPrompts) === JSON.stringify(definition.prompts),
    oneConversation:
      observation.turns.length > 0 &&
      new Set(observation.turns.map((turn) => turn.conversationId)).size === 1,
    expectedTurnCount: observation.turns.length === definition.prompts.length,
    correctRoute:
      observation.turns.length > 0 &&
      observation.turns.every(
        (turn) =>
          turn.modelSpec === effectiveModelConfig.modelId &&
          turn.servingProvider === effectiveModelConfig.servingProvider &&
          turn.rounds.every(
            (round) =>
              round.modelSpec === effectiveModelConfig.modelId &&
              round.servingProvider === effectiveModelConfig.servingProvider,
          ),
      ) &&
      observation.usage.every(
        (event) => event.model === effectiveModelConfig.modelId,
      ),
    allTurnsTerminal:
      observation.turns.length > 0 &&
      observation.turns.every((turn) => turn.terminalAt !== null),
    accountingBalanced,
    withinCreditCeiling:
      totalChargedCredits <= creditCeiling &&
      totalUsageMicrocents <=
        BigInt(creditCeiling) * BigInt(MICROCENTS_PER_USD / 100),
    streamSequenceUnique,
    noActiveLease: activeLeases === 0,
  };

  artifact.usd = Number(totalUsageMicrocents) / MICROCENTS_PER_USD;
  const measured = observation.usage.filter(
    (event) => event.costSource === "measured",
  ).length;
  artifact.measuredShare = observation.usage.length
    ? measured / observation.usage.length
    : 0;
  for (const event of observation.usage)
    await recordCharge(
      request.pool,
      request.campaign.id,
      episodeId,
      "turn",
      Number(BigInt(event.costMicrocents)) / MICROCENTS_PER_USD,
      event.costSource === "measured",
      {
        turnRequestId: event.turnRequestId,
        chargedCredits: event.chargedCredits,
        state: event.state,
      },
    );
  await settleReservedCharge(request.pool, episodeReservationId, 0, {
    purpose: "episode-worst-case",
    arm: request.arm.id,
    caseId: request.caseId,
    repetition: request.repetition,
    creditCeiling,
    reservedWorstCaseUsd: worstCaseUsd,
    settledToTurnChargesUsd: artifact.usd,
  });

  const responderFailure = artifact.turns.find(
    (turn) => turn.responderError,
  )?.responderError;
  let terminalState: "scored" | "skipped" = "scored";
  let terminalReason: string | null = null;
  if (responderFailure) {
    artifact.skipped = `the benchmark responder failed, so this episode observes the harness and not the assistant: ${responderFailure}`;
    terminalState = "skipped";
    terminalReason = artifact.skipped;
  } else if (!artifact.eligibility.expectedTurnCount) {
    artifact.skipped = `actor turn count ${observation.turns.length} does not equal prompt count ${definition.prompts.length}`;
    terminalState = "skipped";
    terminalReason = artifact.skipped;
  } else {
    const oracle = await scoreBenchmarkCase(request.db, fixture, {
      turns: artifact.observed,
    });
    const integrityChecks: OracleCheck[] = Object.entries(
      artifact.eligibility,
    ).map(([id, passed]) => ({
      id: `integrity:${id}`,
      passed,
      gate: "runtime",
    }));
    integrityChecks.push({
      id: "integrity:model-key-request-contract",
      gate: "runtime",
      passed: artifact.turns.every(
        (turn, index) =>
          turn.request.modelKey ===
          (turnModelKey(definition, index, campaignModelKey) ?? null),
      ),
    });
    integrityChecks.push({
      id: "integrity:page-route-persisted-and-request-context-serialized",
      gate: "runtime",
      passed: artifact.turns.every((turn, index) => {
        const expected = turnContext(definition, fixture, index);
        return (
          turn.request.locale === expected.locale &&
          turn.request.pageRoute === expected.pageRoute &&
          observation.turns[index]?.pageRoute === expected.pageRoute
        );
      }),
    });
    integrityChecks.push({
      id: "integrity:server-source-commit",
      gate: "runtime",
      passed: artifact.turns.every(
        (turn) => turn.serverSourceCommit === artifact.sourceCommit,
      ),
    });
    if (definition.driver?.detachAfterFrames !== undefined)
      integrityChecks.push({
        id: "integrity:detached-and-reattached",
        gate: "runtime",
        passed: artifact.turns.some(
          (turn) =>
            turn.detached &&
            turn.reattached &&
            turn.resumedFrameCount > 0 &&
            Boolean(turn.resumedDeltaText.trim()) &&
            turn.terminal?.type === "turn_done" &&
            turn.frameSeqs.every(
              (seq, index, all) => index === 0 || seq > all[index - 1]!,
            ),
        ),
      });
    if (definition.driver?.cancelOn)
      integrityChecks.push({
        id: "integrity:cancellation-requested",
        gate: "runtime",
        passed: artifact.turns.some((turn) => turn.cancelRequested),
      });
    if (definition.driver?.expireOrdinaryLeaseOnApproval)
      integrityChecks.push({
        id: "integrity:approval-survived-ordinary-lease",
        gate: "runtime",
        passed: artifact.turns.some(
          (turn) =>
            turn.leaseProbe?.status === "running" &&
            turn.leaseProbe.leaseHeadroomMs > AGENT_RUN_LEASE_MS,
        ),
      });
    if (definition.id === "R52")
      integrityChecks.push({
        id: "integrity:cancelled-run-settled-spent-work",
        gate: "runtime",
        passed:
          artifact.metrics.rounds.length > 0 &&
          artifact.usage.length === 1 &&
          artifact.usage[0]?.state === "settled",
      });
    artifact.oracle = withIntegrityChecks(oracle, integrityChecks);
  }
  artifact.capturedAt = new Date().toISOString();
  await persistAndCompleteEpisode({
    pool: request.pool,
    episodeId,
    state: terminalState,
    reason: terminalReason,
    artifactPath,
    artifact,
  });
  return artifact;
}

export async function persist(path: string, artifact: EpisodeArtifact) {
  const contents = JSON.stringify(artifact, null, 2) + "\n";
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporaryPath = resolve(
    directory,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    const handle = await open(temporaryPath, "wx");
    try {
      await handle.writeFile(contents);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, path);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function persistAndCompleteEpisode(input: {
  pool: Pool;
  episodeId: string;
  state: "scored" | "skipped";
  reason: string | null;
  artifactPath: string;
  artifact: EpisodeArtifact;
}) {
  await persist(input.artifactPath, input.artifact);
  await completeEpisode(
    input.pool,
    input.episodeId,
    input.state,
    input.reason,
    input.artifactPath,
  );
}
