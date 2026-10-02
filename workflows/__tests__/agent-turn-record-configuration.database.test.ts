import { randomUUID } from "node:crypto";

import { decode } from "@toon-format/toon";
import { createTranslator } from "next-intl";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as captureFailure from "@/workflows/capture-failure";
import type { TenantUser } from "@/features/user/user.schema";
import type { AgentTurnWorkflowPayload } from "@/workflows/agent-turn";
import type { ProviderConfigurationChange } from "@/features/records/configuration-provider.schema";

import messages from "@/i18n/locales/en.json";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

type WorkflowTool = {
  needsApproval: (input: unknown, options: { toolCallId: string }) => Promise<boolean>;
  execute?: (input: unknown, options: { toolCallId: string }) => Promise<unknown>;
};
type ScriptContext = {
  tools: Record<string, WorkflowTool>;
  messages: unknown[];
  call: (name: string, input: unknown, id: string) => Promise<unknown>;
};
type StreamResult = { finishReason: string; messages: unknown[]; steps: unknown[] };

const state = vi.hoisted(() => ({
  actor: null as TenantUser | null,
  script: null as null | ((context: ScriptContext) => Promise<StreamResult>),
  wake: null as null | (() => Promise<{ requestId: string }>),
  writes: [] as unknown[],
  calls: [] as { name: string; id: string; input: unknown; output: unknown }[],
  providerCalls: 0,
  scriptFailure: null as string | null,
  reportFailure: vi.fn().mockResolvedValue(undefined),
  reportWarning: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@ai-sdk/workflow", () => ({
  WorkflowAgent: class {
    constructor(
      private readonly options: {
        prepareStep: (input: { messages: unknown[] }) => Promise<{ activeTools?: string[] }>;
        onStepEnd: (step: unknown) => Promise<void>;
        onToolExecutionEnd: (event: unknown) => void;
        instructions: string;
        tools: Record<string, WorkflowTool>;
      },
    ) {}

    async stream({ messages }: { messages: unknown[] }): Promise<StreamResult> {
      if (!state.script) throw new Error("The deterministic provider script is missing.");
      const replay = [...messages];
      const steps: unknown[] = [];
      const prepare = async () => {
        const prepared = await this.options.prepareStep({
          messages: [{ role: "system", content: this.options.instructions }, ...replay],
        });
        expect(prepared.activeTools).toContain("configure_record_model");
        state.providerCalls++;
      };
      await prepare();
      let result: StreamResult;
      try {
        result = await state.script({
          tools: this.options.tools,
          messages: replay,
          call: async (name, input, id) => {
            const tool = this.options.tools[name];
            if (!tool?.execute) throw new Error(`Tool ${name} cannot execute.`);
            expect(await tool.needsApproval(input, { toolCallId: id })).toBe(false);
            const output = await tool.execute(input, { toolCallId: id });
            const retry = state.calls.some((call) => call.id === id);
            state.calls.push({ name, id, input, output });
            if (retry) return output;
            this.options.onToolExecutionEnd({ success: true, toolCall: { toolCallId: id, toolName: name }, output });
            const call = { type: "tool-call", toolCallId: id, toolName: name, input };
            replay.push(
              { role: "assistant", content: [call] },
              {
                role: "tool",
                content: [
                  { type: "tool-result", toolCallId: id, toolName: name, output: { type: "json", value: output } },
                ],
              },
            );
            const step = round([call], "tool-calls");
            steps.push(step);
            await this.options.onStepEnd(step);
            await prepare();
            return output;
          },
        });
      } catch (error) {
        state.scriptFailure = error instanceof Error ? error.message : String(error);
        throw error;
      }
      return { ...result, steps: [...steps, ...result.steps] };
    }
  },
}));
vi.mock("workflow", () => ({
  createHook: () => ({
    dispose: vi.fn(),
    async *[Symbol.asyncIterator]() {
      if (!state.wake) throw new Error("The deterministic approval wake is missing.");
      yield await state.wake();
    },
  }),
  getWritable: () => ({
    close: () => Promise.resolve(),
    getWriter: () => ({
      releaseLock: vi.fn(),
      write: (value: unknown) => {
        state.writes.push(value);
        return Promise.resolve();
      },
    }),
  }),
  sleep: () => new Promise<void>(() => {}),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: keyof typeof messages) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace })),
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
      if (!state.actor) throw new Error("The synthetic authenticated user is missing.");
      return Promise.resolve(state.actor);
    }

    getActiveUserOrThrow() {
      return this.getUserOrThrow();
    }
    getActiveTenantUserOrThrow() {
      return this.getUserOrThrow();
    }
    getActiveUserByIdOrThrow(id: string) {
      if (state.actor?.id !== id) throw new Error("Unexpected authenticated user.");
      return this.getUserOrThrow();
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
vi.mock("@/workflows/capture-failure", async (importOriginal) => ({
  ...(await importOriginal<typeof captureFailure>()),
  reportFailure: state.reportFailure,
  reportWarning: state.reportWarning,
}));

await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { BackgroundTaskService } = await import("@/core/utils/background-task.service");
const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { PrismaRecordRepo } = await import("@/features/records/prisma-record.repository");
const { createCrmPreset } = await import("@/features/records/crm-preset");
const { ConfigurationPreviewSchema } = await import("@/features/records/configuration.schema");
const { DiscoveredRecordTypesSchema } = await import("@/features/records/discover-record-types.interactor");
const { RecordModelSchema, RecordDtoSchema } = await import("@/features/records/record-model.schema");
const { RecordOperationResultSchema } = await import("@/features/records/record-query.schema");
const { RecordQueryResultSchema } = await import("@/features/records/record-query-result.schema");
const { runAgentTurn } = await import("@/workflows/agent-turn");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("A required scripted fixture value is missing.");
  return value;
}

function round(content: unknown[], finishReason: string) {
  return {
    content,
    finishReason,
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
    },
    providerMetadata: {},
  };
}

function finish(messages: unknown[], text: string): StreamResult {
  return { finishReason: "stop", messages, steps: [round([{ type: "text", text }], "stop")] };
}

function resultOf(output: unknown) {
  expect(output).toMatchObject({ ok: true });
  const result = output as { ok: boolean; result: string };
  expect(result.result).not.toContain("[truncated:");
  return decode(result.result);
}

function configurationResult(output: unknown) {
  return (resultOf(output) as { action: string; result: unknown }).result;
}

function mutationResult(output: unknown) {
  return (resultOf(output) as { result: unknown }).result;
}

function bundle(key: string): ProviderConfigurationChange {
  return {
    expectedRevision: 1,
    idempotencyKey: key,
    operations: [
      {
        operation: "createType",
        reference: "$projects",
        label: "Scripted Project",
        pluralLabel: "Scripted Projects",
        description: "Synthetic offline configuration",
        icon: "folder",
        embedded: false,
        accessPresetId: null,
      },
      {
        operation: "createType",
        reference: "$applications",
        label: "Scripted Application",
        pluralLabel: "Scripted Applications",
        description: "Synthetic offline configuration",
        icon: "folder",
        embedded: false,
        accessPresetId: null,
      },
      {
        operation: "putField",
        field: {
          id: "$budget",
          typeId: "$projects",
          label: "Budget",
          valueType: "number",
          behavior: { kind: "input" },
          required: false,
          archived: false,
          options: [],
          position: 2,
        },
      },
      {
        operation: "putField",
        field: {
          id: "$doubleBudget",
          typeId: "$projects",
          label: "Double budget",
          valueType: "number",
          behavior: {
            kind: "formula",
            expression: {
              root: "double",
              nodes: [
                { id: "budget", kind: "field", fieldId: "$budget" },
                { id: "two", kind: "literal", value: { kind: "decimal", value: "2", currency: null } },
                { id: "double", kind: "operation", operator: "multiply", argumentNodes: ["budget", "two"] },
              ],
            },
          },
          required: false,
          archived: false,
          options: [],
          position: 3,
        },
      },
      {
        operation: "putField",
        field: {
          id: "$memo",
          typeId: "$projects",
          label: "Memo",
          valueType: "text",
          behavior: { kind: "input" },
          required: false,
          archived: false,
          options: [],
          position: 4,
        },
      },
      {
        operation: "putRelationship",
        relationship: {
          id: "$projectApplications",
          sourceTypeId: "$projects",
          targetTypeId: "$applications",
          sourceLabel: "Applications",
          targetLabel: "Projects",
          sourceCardinality: "many",
          targetCardinality: "many",
          onSourceDelete: "unlink",
          onTargetDelete: "unlink",
          archived: false,
        },
      },
    ],
  };
}

async function fixture(): Promise<AgentTurnWorkflowPayload> {
  const companyId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const conversationId = randomUUID();
  const turnRequestId = randomUUID();
  const runId = randomUUID();
  companies.push(companyId);
  const actor = createMockUser({ companyId, id: userId, roleId });
  actor.role = { ...required(actor.role), id: roleId };
  state.actor = actor;
  const now = new Date();
  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    await prisma.userRole.create({ data: { id: roleId, companyId, name: "Admin", isSystemRole: true } });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        roleId,
        email: `scripted-${userId}@example.com`,
        firstName: "Scripted",
        lastName: "Tester",
        status: "active",
      },
    });
    await prisma.agentConversation.create({ data: { id: conversationId, companyId, userId } });
    await prisma.agentTurnRequest.create({
      data: {
        id: turnRequestId,
        companyId,
        userId,
        conversationId,
        clientRequestId: randomUUID(),
        text: "Create Projects with calculations and linked Applications",
        status: "running",
        runId,
        userMessageId: randomUUID(),
        providerStartedAt: now,
        affectedResources: [],
      },
    });
    await prisma.agentRunLease.create({
      data: { companyId, userId, conversationId, runId, expiresAt: new Date(now.getTime() + 600_000) },
    });
    await prisma.agentUsageEvent.create({
      data: {
        companyId,
        userId,
        turnRequestId,
        state: "reserved",
        model: "google/gemini-3.5-flash-lite",
        reservedCredits: 100,
        planSnapshot: "business",
        subscriptionStatusSnapshot: "active",
        allowanceCreditsSnapshot: 100,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 86_400_000),
        providerStartedAt: now,
      },
    });
  });
  await runWithTenant(actor, () =>
    runInTransaction(() => new PrismaRecordRepo().saveModel(createCrmPreset(companyId, "EUR"), userId)),
  );
  return {
    turnRequestId,
    companyId,
    userId,
    conversationId,
    runId,
    userName: "Scripted Tester",
    locale: "en",
    appBaseUrl: "http://localhost:4000",
    pageRoute: "/en/company/data-model",
    messages: [{ role: "user", text: "Create Projects with a doubled budget and linked Applications" }],
    tenant: { companyId, userId },
    surface: "chat",
    toolsets: ["record-model"],
    turnBudget: {
      modelSpec: "google/gemini-3.5-flash-lite",
      servingProvider: "vertex",
      inferenceRegion: "eu",
      reservedCredits: 100,
      roundReserveCredits: 2,
      maxOutputTokens: 100,
      maxContextTokens: 100_000,
      maxContextBytes: 400_000,
      maxToolResultChars: 6000,
    },
  };
}

async function assertCompleted(payload: AgentTurnWorkflowPayload) {
  const [turn, rounds, reply, usage, leases] = await runWithoutTenant(() =>
    Promise.all([
      prisma.agentTurnRequest.findUniqueOrThrow({ where: { id: payload.turnRequestId } }),
      prisma.agentRunRound.findMany({
        where: { turnRequestId: payload.turnRequestId },
        orderBy: { roundIndex: "asc" },
      }),
      prisma.agentMessage.findMany({ where: { turnRequestId: payload.turnRequestId, role: "assistant" } }),
      prisma.agentUsageEvent.findFirstOrThrow({ where: { turnRequestId: payload.turnRequestId } }),
      prisma.agentRunLease.count({ where: { companyId: payload.companyId, runId: payload.runId } }),
    ]),
  );
  expect(turn).toMatchObject({ status: "completed", terminalCode: "completed", stopReason: null });
  expect(rounds.length).toBeGreaterThan(1);
  expect(reply).toHaveLength(1);
  expect(turn.assistantMessageId).toBe(reply[0].id);
  expect(usage.state).toBe("settled");
  expect(leases).toBe(0);
  expect(state.reportFailure).not.toHaveBeenCalled();
  expect(state.writes).toContainEqual(
    expect.objectContaining({
      type: "turn_done",
      payload: expect.objectContaining({ terminalCode: "completed", replayed: false }),
    }),
  );
  return reply[0];
}

describeDatabase("scripted assistant configuration uses production tools and persistence", { timeout: 120_000 }, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    state.writes = [];
    state.calls = [];
    state.providerCalls = 0;
    state.scriptFailure = null;
    state.script = null;
    state.wake = null;
    state.reportFailure.mockClear();
    state.reportWarning.mockClear();
    vi.spyOn(PrismaAgentChatRepo.prototype, "markAgentTurnProviderStartedUnscoped").mockResolvedValue(true);
    vi.spyOn(PrismaAgentChatRepo.prototype, "canStartNextHostedAiProviderRoundUnscoped").mockResolvedValue(true);
    vi.spyOn(BackgroundTaskService.prototype, "dispatch").mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("External HTTP is forbidden in the scripted assistant test.");
      }),
    );
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("creates a related configuration bundle, calculates a persisted value, and safely replays both retry identities", async () => {
    const payload = await fixture();
    const change = bundle(randomUUID());
    let projectRef: { typeId: string; recordId: string } | undefined;
    let doubleFieldId: string | undefined;
    state.script = async ({ call, messages }) => {
      const discovery = DiscoveredRecordTypesSchema.parse(
        resultOf(await call("discover_record_types", {}, "discover")),
      );
      expect(discovery).toMatchObject({ schemaRevision: 1, canManageSchema: true });
      const preview = ConfigurationPreviewSchema.parse(
        configurationResult(await call("configure_record_model", { action: "preview", change }, "preview")),
      );
      expect(preview).toMatchObject({ valid: true, execution: "synchronous", nextRevision: 2 });
      expect(
        await runWithoutTenant(() =>
          prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: payload.companyId } }),
        ),
      ).toMatchObject({ revision: 1 });
      const applied = await call("configure_record_model", { action: "apply", change }, "apply");
      expect(RecordOperationResultSchema.parse(configurationResult(applied))).toMatchObject({
        status: "completed",
        schemaRevision: 2,
      });
      expect(await call("configure_record_model", { action: "apply", change }, "apply")).toEqual(applied);
      expect(await call("configure_record_model", { action: "apply", change }, "apply-new-call")).toEqual(applied);
      const conflicted = structuredClone(change);
      const first = conflicted.operations[0];
      if (first.operation !== "createType") throw new Error("The synthetic bundle shape changed.");
      first.label = "Conflicting project";
      expect(
        await call("configure_record_model", { action: "apply", change: conflicted }, "conflicting-key"),
      ).toMatchObject({ ok: false });
      const reference = (name: string) => {
        const value = preview.references.find((entry) => entry.reference === name)?.id;
        if (!value) throw new Error(`Missing client reference ${name}.`);
        return value;
      };
      const model = RecordModelSchema.parse(
        resultOf(
          await call("get_record_model", { typeIds: [reference("$projects"), reference("$applications")] }, "model"),
        ),
      );
      expect(model.types.map((type) => type.pluralLabel).sort()).toEqual([
        "Scripted Applications",
        "Scripted Projects",
      ]);
      doubleFieldId = reference("$doubleBudget");
      const application = RecordOperationResultSchema.parse(
        mutationResult(
          await call(
            "mutate_crm_record",
            {
              expectedRevision: 2,
              idempotencyKey: randomUUID(),
              mutation: {
                action: "create",
                typeId: reference("$applications"),
                fields: [
                  { fieldId: reference("$applications.name"), value: { kind: "text", value: "Offline application" } },
                ],
              },
            },
            "create-application",
          ),
        ),
      );
      if (application.status !== "completed") throw new Error("The small fixture unexpectedly staged a mutation.");
      const project = RecordOperationResultSchema.parse(
        mutationResult(
          await call(
            "mutate_crm_record",
            {
              expectedRevision: 2,
              idempotencyKey: randomUUID(),
              mutation: {
                action: "create",
                typeId: reference("$projects"),
                fields: [
                  { fieldId: reference("$projects.name"), value: { kind: "text", value: "Offline project" } },
                  { fieldId: reference("$budget"), value: { kind: "decimal", value: "34.25", currency: null } },
                ],
                links: [
                  { relationId: reference("$projectApplications"), direction: "outgoing", record: application.refs[0] },
                ],
              },
            },
            "create-project",
          ),
        ),
      );
      if (project.status !== "completed") throw new Error("The small fixture unexpectedly staged a mutation.");
      projectRef = project.refs[0];
      const read = RecordDtoSchema.parse(resultOf(await call("read_crm_record", projectRef, "read-project")));
      expect(read.fields.find((field) => field.fieldId === doubleFieldId)?.result).toEqual({
        state: "value",
        value: { kind: "decimal", value: "68.5", currency: null },
      });
      const related = RecordQueryResultSchema.parse(
        resultOf(
          await call(
            "query_crm_records",
            {
              typeId: projectRef.typeId,
              includeRelationships: [{ relationId: reference("$projectApplications"), direction: "outgoing" }],
              pageSize: 5,
            },
            "query-project",
          ),
        ),
      );
      expect(related.total).toBe(1);
      expect(
        related.records[0].relationships.flatMap((relation) => relation.records.map((record) => record.ref)),
      ).toContainEqual(application.refs[0]);
      return finish(messages, "Created Projects, Applications, their relationship, and a working budget calculation.");
    };

    await runAgentTurn(payload);
    expect(state.scriptFailure).toBeNull();
    expect(state.providerCalls).toBeGreaterThan(0);

    expect(projectRef).toBeDefined();
    const [schema, values, typeCount, relationships, receipts, configReceipts] = await runWithoutTenant(() =>
      Promise.all([
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: payload.companyId } }),
        prisma.recordValue.findMany({
          where: {
            companyId: payload.companyId,
            typeId: required(projectRef).typeId,
            recordId: required(projectRef).recordId,
            fieldId: doubleFieldId,
          },
        }),
        prisma.recordTypeDefinition.count({
          where: {
            companyId: payload.companyId,
            label: { in: ["Scripted Project", "Scripted Application", "Conflicting project"] },
          },
        }),
        prisma.recordLink.count({
          where: {
            companyId: payload.companyId,
            sourceTypeId: required(projectRef).typeId,
            sourceId: required(projectRef).recordId,
          },
        }),
        prisma.agentToolReceipt.findMany({
          where: { turnRequestId: payload.turnRequestId, toolCallId: { in: ["apply", "apply-new-call"] } },
        }),
        prisma.recordMutationReceipt.count({
          where: { companyId: payload.companyId, idempotencyKey: change.idempotencyKey },
        }),
      ]),
    );
    expect(schema.revision).toBe(2);
    expect(typeCount).toBe(2);
    expect(relationships).toBe(1);
    expect(values).toHaveLength(1);
    expect(values[0].state).toBe("value");
    expect(values[0].decimalValue?.toString()).toBe("68.5");
    expect(receipts).toHaveLength(2);
    expect(receipts.every((receipt) => receipt.state === "settled")).toBe(true);
    expect(receipts[0].resultJson).toEqual(receipts[1].resultJson);
    expect(configReceipts).toBe(1);
    expect(
      await runWithoutTenant(() => prisma.agentApproval.count({ where: { conversationId: payload.conversationId } })),
    ).toBe(0);
    await assertCompleted(payload);
  });

  it("persists a rejected configuration approval and blocks execution even if the scripted transport attempts the denied call", async () => {
    const payload = await fixture();
    const change = bundle(randomUUID());
    let deniedChange: ProviderConfigurationChange | undefined;
    let memoId: string | undefined;
    let segment = 0;
    state.wake = async () => {
      const requestId = `${payload.turnRequestId}:archive-memo`;
      const resolved = await runWithTenant(required(state.actor), () =>
        new PrismaAgentChatRepo().resolvePendingApprovalRequest({
          conversationId: payload.conversationId,
          requestId,
          decision: "reject",
        }),
      );
      expect(resolved).toEqual({ toolName: "configure_record_model", resolved: true });
      return { requestId };
    };
    state.script = async ({ call, tools, messages }) => {
      if (segment++ === 0) {
        const preview = ConfigurationPreviewSchema.parse(
          configurationResult(await call("configure_record_model", { action: "preview", change }, "create-preview")),
        );
        expect(preview.valid).toBe(true);
        resultOf(await call("configure_record_model", { action: "apply", change }, "create-apply"));
        const projectId = required(preview.references.find((reference) => reference.reference === "$projects")).id;
        memoId = required(preview.references.find((reference) => reference.reference === "$memo")).id;
        const model = RecordModelSchema.parse(
          resultOf(await call("get_record_model", { typeIds: [projectId] }, "read-model")),
        );
        const { publishedSummary, ...field } = required(model.fields.find((definition) => definition.id === memoId));
        expect(publishedSummary).toBe(false);
        if (field.behavior.kind !== "input") throw new Error("The synthetic memo must remain an input field.");
        deniedChange = {
          expectedRevision: 2,
          idempotencyKey: randomUUID(),
          operations: [{ operation: "putField", field: { ...field, behavior: field.behavior, archived: true } }],
        };
        const removalPreview = ConfigurationPreviewSchema.parse(
          configurationResult(
            await call("configure_record_model", { action: "preview", change: deniedChange }, "archive-preview"),
          ),
        );
        expect(removalPreview.valid).toBe(true);
        const input = { action: "apply", change: deniedChange };
        expect(await tools.configure_record_model.needsApproval(input, { toolCallId: "archive-memo" })).toBe(true);
        return {
          finishReason: "tool-calls",
          messages: [
            ...messages,
            {
              role: "assistant",
              content: [{ type: "tool-call", toolName: "configure_record_model", toolCallId: "archive-memo", input }],
            },
          ],
          steps: [
            round(
              [{ type: "tool-call", toolName: "configure_record_model", toolCallId: "archive-memo", input }],
              "tool-calls",
            ),
          ],
        };
      }
      expect(JSON.stringify(messages)).toContain('"approved":false');
      const denied = await required(tools.configure_record_model.execute)(
        { action: "apply", change: deniedChange },
        { toolCallId: "archive-memo" },
      );
      expect(denied).toMatchObject({ agentToolStatus: "cancelled", reason: "rejected" });
      return finish(
        [
          ...messages,
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "archive-memo",
                toolName: "configure_record_model",
                output: { type: "json", value: denied },
              },
            ],
          },
        ],
        "The configuration change was declined. Memo remains available.",
      );
    };

    await runAgentTurn(payload);
    expect(state.scriptFailure).toBeNull();
    expect(state.providerCalls).toBeGreaterThan(0);

    expect(segment).toBe(2);
    const [schema, field, approval, receipts, mutationReceipts] = await runWithoutTenant(() =>
      Promise.all([
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: payload.companyId } }),
        prisma.recordFieldDefinition.findFirstOrThrow({ where: { companyId: payload.companyId, id: memoId } }),
        prisma.agentApproval.findFirstOrThrow({
          where: { conversationId: payload.conversationId, requestId: `${payload.turnRequestId}:archive-memo` },
        }),
        prisma.agentToolReceipt.count({ where: { turnRequestId: payload.turnRequestId, toolCallId: "archive-memo" } }),
        prisma.recordMutationReceipt.count({
          where: { companyId: payload.companyId, idempotencyKey: required(deniedChange).idempotencyKey },
        }),
      ]),
    );
    expect(schema.revision).toBe(2);
    expect(field.archived).toBe(false);
    expect(approval).toMatchObject({ decision: "reject", toolName: "configure_record_model" });
    expect(receipts).toBe(0);
    expect(mutationReceipts).toBe(0);
    expect(state.writes).toContainEqual(
      expect.objectContaining({
        type: "approval_resolved",
        payload: expect.objectContaining({ requestId: `${payload.turnRequestId}:archive-memo`, decision: "reject" }),
      }),
    );
    const reply = await assertCompleted(payload);
    expect(JSON.stringify(reply.parts)).toContain("cancelled");
  });
});
