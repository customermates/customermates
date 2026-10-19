import { convertToLanguageModelPrompt, standardizePrompt } from "ai/internal";
import { describe, expect, it, vi } from "vitest";

import type { TenantUser } from "@/features/user/user.schema";
import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const tenant = vi.hoisted(() => ({ user: undefined as TenantUser | undefined }));

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" } }));
vi.mock("@/core/di", () =>
  createMockDiModule(() => {
    if (!tenant.user) throw new Error("Expected a routine owner.");
    return tenant.user;
  }),
);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { agentCreditsToMicrocents } from "@/core/commercial/agent-credits";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import type { DiscoveredRecordTypes } from "@/features/records/discover-record-types.interactor";
import { GetWikiCatalogInteractor } from "@/features/wiki/get-wiki-catalog.interactor";
import { SEED_IDS } from "@/prisma/seeds/context";
import { applyNorthwindModel } from "@/prisma/seeds/northwind-schema";
import { SYNTHETIC_ROUTINES, type SeedRoutine } from "@/prisma/seeds/routines";
import { SYNTHETIC_WIKI_PAGE_DEFINITIONS } from "@/prisma/seeds/wiki";
import { composeRoutinePrompt } from "@/ee/routines/routine-prompt";
import { DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN } from "@/ee/routines/routine-run-limits";
import { ROUTINE_PROMPT_MAX_CHARS } from "@/ee/routines/routine.schema";
import {
  agentStepContext,
  isAgentContextWithinBudget,
  resolveAgentTurnBudget,
  serializedAgentContextBytes,
} from "@/ee/agent-chat/agent-budget-policy";
import { buildAgentProviderContext } from "@/ee/agent-chat/agent-provider-context";
import { agentToolDefinitionsForTurn } from "@/ee/agent-chat/agent-tools";
import { activeAgentToolNames } from "@/ee/agent-chat/agent-toolset-routing";
import { AGENT_MODELS, type AgentModelEntry } from "@/ee/agent-chat/model-catalog";
import { SendAgentMessageInteractor } from "@/ee/agent-chat/send-agent-message.interactor";
import { agentSystemPromptParts, routineTriggerEventOf } from "@/ee/agent-chat/system-prompt";
import type { AgentTurnWorkflowPayload } from "@/workflows/agent-turn";

const COMPANY_ID = SEED_IDS.company;
const THREAD = {
  id: "35000000-0000-4000-8000-000000000001",
  connectedAccountId: "37000000-0000-4000-8000-000000000001",
};
const RECORD_ID = "80000000-0000-4000-8000-000000000001";
const OWNERS = {
  user: ["Max", "Bergmann"],
  sofiaRossiUser: ["Sofia", "Rossi"],
  elenaHoffmannUser: ["Elena", "Hoffmann"],
} as const satisfies Record<SeedRoutine["owner"], readonly [string, string]>;

function northwindDiscovery(): DiscoveredRecordTypes {
  const model = applyNorthwindModel(createCrmPreset(COMPANY_ID), COMPANY_ID);
  const types = model.types.filter((type) => !type.archived && !type.embedded);
  return {
    schemaRevision: model.revision,
    canManageSchema: true,
    canPublishSummary: true,
    canManageRoles: true,
    total: types.length,
    types: types.slice(0, 25).map((type) => ({
      id: type.id,
      label: type.label,
      pluralLabel: type.pluralLabel,
      description: type.description,
      icon: type.icon,
      embedded: false,
      fieldCount: model.fields.filter((field) => field.typeId === type.id && !field.archived).length,
      recordCount: 0,
      permittedActions: ["create", "readOwn", "readAll", "update", "delete"],
    })),
  };
}

function northwindWikiCatalog() {
  const pages = SYNTHETIC_WIKI_PAGE_DEFINITIONS.map((page, index) => ({
    id: page.id,
    title: page.title,
    markdown: page.markdown,
    kind: page.kind,
    whenToUse: page.whenToUse ?? null,
    createdAt: new Date(Date.UTC(2026, 8, 1, 9, index)),
    updatedAt: new Date(Date.UTC(2026, 8, 1, 9, index)),
  }));
  const knowledge = pages.filter((page) => page.kind === "knowledge");
  const procedures = pages
    .filter((page) => page.kind === "procedure")
    .toSorted((left, right) => left.title.localeCompare(right.title));
  return new GetWikiCatalogInteractor({
    listCatalogPages: ({ page }: { page: number }) =>
      Promise.resolve({ items: knowledge.slice((page - 1) * 10, page * 10), total: knowledge.length }),
    loadOperatingPages: (limit: number) =>
      Promise.resolve({
        guide: pages.find((page) => page.kind === "guide") ?? null,
        procedures: procedures.slice(0, limit),
        proceduresTotal: procedures.length,
      }),
  } as never);
}

function triggerOf(routine: Pick<SeedRoutine, "trigger">) {
  if (routine.trigger.kind === "schedule") return { triggerEvent: null, triggerEntityId: null, triggerPayload: null };
  const [event] = routine.trigger.events;
  const sample = routine.trigger.sample;
  if (!event.startsWith("record.")) {
    return {
      triggerEvent: event,
      triggerEntityId: sample?.kind === "messaging" ? sample.entityId : THREAD.id,
      triggerPayload: sample?.kind === "messaging" ? sample.payload(THREAD) : { ...THREAD, threadId: THREAD.id },
    };
  }
  const typeId = presetId(COMPANY_ID, routine.trigger.recordTypes?.[0] ?? "deal");
  const updated = event === "record.updated";
  return {
    triggerEvent: event,
    triggerEntityId: RECORD_ID,
    triggerPayload: {
      event,
      id: "2e000000-0000-4000-8000-000000000101",
      timestamp: "2026-10-14T09:00:00.000Z",
      companyId: COMPANY_ID,
      actorId: "20000000-0000-4000-8000-000000000001",
      data: {
        causeId: "stage-change",
        cause: { kind: "mutation" },
        record: {
          ref: { typeId, recordId: RECORD_ID },
          schemaRevision: 1,
          beforeVersion: updated ? 1 : null,
          afterVersion: updated ? 2 : 1,
          assignments: null,
          identities: null,
          links: [],
          related: [],
          fields: [
            {
              fieldId: "30000000-0000-4000-8000-000000000045",
              before: null,
              after: {
                fieldId: "30000000-0000-4000-8000-000000000045",
                label: "Stage",
                valueType: "select",
                options: [],
                value: { state: "restricted" },
              },
            },
          ],
        },
      },
    },
  };
}

function admissionHarness() {
  const ceiling = agentCreditsToMicrocents(DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN);
  const repo = {
    normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
    findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
    findConversation: vi
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve({ id, origin: "routine", modelKey: null, creditCeilingMicrocents: BigInt(ceiling) }),
      ),
    claimAgentRunLease: vi.fn().mockResolvedValue("claimed"),
    isAtAgentRunLimit: vi.fn().mockResolvedValue(false),
    deleteUnusedAgentConversation: vi.fn().mockResolvedValue(undefined),
    recordAgentTurnExternalRun: vi.fn().mockResolvedValue(undefined),
    releasePreProviderAdmissionOrThrowUnscoped: vi.fn().mockResolvedValue(undefined),
    admitAgentTurnOrThrow: vi.fn().mockImplementation((args) =>
      Promise.resolve({
        conversationId: args.conversationId,
        userMessageId: args.turn.userMessageId,
        recentMessages: [{ id: args.turn.userMessageId, role: "user", parts: [{ type: "text", text: args.title }] }],
      }),
    ),
  };
  const usage = {
    prepareTurn: vi.fn().mockImplementation(
      (
        _userId: string,
        _now: Date,
        options: {
          model: AgentModelEntry;
          requiredContextBytes: number;
          creditCeilingMicrocents: number | null;
          webSearchReserveMicrocents: number;
        },
      ) => {
        const budget = resolveAgentTurnBudget({
          model: options.model,
          availableMicrocents: options.creditCeilingMicrocents ?? ceiling,
          requiredContextBytes: options.requiredContextBytes,
          webSearchReserveMicrocents: options.webSearchReserveMicrocents,
        });
        return Promise.resolve({
          summary: { blockedReason: budget ? null : "configuration_unavailable" },
          reservation: budget
            ? {
                budget,
                reservedMicrocents: budget.reservedMicrocents,
                periodStart: new Date("2026-10-01T00:00:00Z"),
                periodEnd: new Date("2026-11-01T00:00:00Z"),
              }
            : null,
        });
      },
    ),
    reserveUsage: vi.fn().mockResolvedValue(true),
  };
  const background = { dispatchTracked: vi.fn().mockResolvedValue("wrun_routine_budget") };
  const discovery = northwindDiscovery();
  const interactor = new SendAgentMessageInteractor(
    repo as never,
    usage as never,
    mockEntitlementService(),
    background as never,
    { invoke: () => Promise.resolve({ ok: true as const, data: discovery }) },
    northwindWikiCatalog(),
    { hasPermission: () => Promise.resolve(true) },
    { findLatestCrawl: () => Promise.resolve(null) },
  );
  return { interactor, usage, background };
}

async function firstRoutineRound(owner: SeedRoutine["owner"], text: string, index: number) {
  const [firstName, lastName] = OWNERS[owner];
  tenant.user = createMockUser({
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    companyId: COMPANY_ID,
    firstName,
    lastName,
  });
  const harness = admissionHarness();
  const result = await runWithTenant(tenant.user, () =>
    harness.interactor.invokeRoutine({
      conversationId: `33000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      clientRequestId: `32000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      text,
      retry: false,
    }),
  );
  expect(result).toMatchObject({ ok: true, data: { disposition: "run" } });
  const payload = harness.background.dispatchTracked.mock.calls.at(-1)?.[1] as AgentTurnWorkflowPayload;
  const admitted = harness.usage.prepareTurn.mock.calls.at(-1)?.[2] as { requiredContextBytes: number };

  const surface = payload.surface ?? "chat";
  const initialToolsets = payload.toolsets ?? [];
  const shells = agentToolDefinitionsForTurn({
    surface,
    servingProvider: payload.turnBudget.servingProvider,
    locale: payload.locale,
    wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
    webSearchEnabled: payload.webSearchEnabled,
  });
  const active = activeAgentToolNames({ tools: shells, initialToolsets, messages: [] });
  const tools = shells
    .filter((shell) => active.includes(shell.name))
    .map(({ toolset: _toolset, ...definition }) => definition);
  const context = buildAgentProviderContext(
    agentSystemPromptParts({
      userName: payload.userName,
      locale: payload.locale,
      surface,
      loadedToolsets: initialToolsets,
      schemaDigest: payload.schemaDigest ?? null,
      triggerEvent: routineTriggerEventOf(payload.messages.findLast((message) => message.role === "user")?.text),
      wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
      webSearchEnabled: payload.webSearchEnabled,
    }),
    payload.messages,
    tools,
    payload.wikiCatalog,
  );
  const stepMessages = await convertToLanguageModelPrompt({
    prompt: await standardizePrompt({ system: context.system, messages: context.messages }),
    supportedUrls: {},
    download: undefined,
  });
  return {
    payload,
    admittedBytes: admitted.requiredContextBytes,
    sent: agentStepContext({ system: context.system, messages: stepMessages, tools }),
  };
}

describe("routine context budget", () => {
  it.each(SYNTHETIC_ROUTINES.map((routine) => [routine.index, routine.trigger.kind, routine.name, routine] as const))(
    "starts Northwind seed routine %i (%s, %s) inside the provider context of the default model",
    async (index, _kind, _name, routine) => {
      const text = composeRoutinePrompt(routine.prompt, { routineName: routine.name, ...triggerOf(routine) });
      const { payload, admittedBytes, sent } = await firstRoutineRound(routine.owner, text, index);

      expect(payload.surface).toBe("routine");
      expect(payload.toolsets).toEqual([]);
      expect(payload.schemaDigest).toContain("Onboarding projects");
      expect(payload.wikiCatalog).toContain("Operating Guide");
      expect(payload.turnBudget.modelSpec).toBe(AGENT_MODELS.routine.modelId);
      expect(sent).not.toHaveProperty("system");
      expect(serializedAgentContextBytes(sent)).toBeLessThanOrEqual(admittedBytes);
      expect(isAgentContextWithinBudget(sent, payload.turnBudget.maxContextBytes)).toBe(true);
    },
  );

  it("starts a full-length user routine that names every capability with core tools inside the budget", async () => {
    const request =
      "Every Monday email the team a pipeline summary, draft LinkedIn replies, update the dashboard widget, check webhook deliveries, review routines, roles and members, and adjust saved views and record fields. ";
    const prompt = request
      .repeat(Math.ceil(ROUTINE_PROMPT_MAX_CHARS / request.length))
      .slice(0, ROUTINE_PROMPT_MAX_CHARS);
    const text = composeRoutinePrompt(prompt, {
      routineName: "Monday team digest",
      ...triggerOf({
        trigger: { kind: "event", events: ["record.updated"], recordTypes: ["deal"], debounceSeconds: 300 },
      }),
    });
    const { payload, admittedBytes, sent } = await firstRoutineRound("user", text, 99);

    expect(payload.toolsets).toEqual([]);
    expect(serializedAgentContextBytes(sent)).toBeLessThanOrEqual(admittedBytes);
    expect(isAgentContextWithinBudget(sent, payload.turnBudget.maxContextBytes)).toBe(true);
  });
});
