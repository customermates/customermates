import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantUser } from "@/features/user/user.schema";
import type * as StructuredModelCall from "@/ee/agent-chat/structured-model-call";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

const state = vi.hoisted(() => ({
  dispatch: vi.fn((..._args: unknown[]) => Promise.resolve()),
  generate: vi.fn(),
  plan: null as unknown,
}));

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
    HOSTED_AI_PROVIDER_WORK_PAUSED: false,
    HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS: 1_000_000_000_000_000n,
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("@/core/utils/background-task.service", () => ({
  BackgroundTaskService: class {
    dispatch = state.dispatch;
    dispatchTracked = () => Promise.resolve(randomUUID());
  },
}));
vi.mock("@/ee/agent-chat/structured-model-call", async (importOriginal) => ({
  ...(await importOriginal<typeof StructuredModelCall>()),
  generateStructuredObject: state.generate,
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const di = await import("@/core/di");
const { createTestRecordRepo, initializeStarterRecordModel } = await import("@/tests/helpers/record-repository");
const { createTestWorkspaceRegistration } = await import("@/tests/helpers/workspace-registration");
const { PermissionService } = await import("@/core/base/permission.service");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
const { RegisterUserInteractor } = await import("@/features/user/register/register-user.interactor");
const { agencyPlan } = await import("@/features/workspace-setup/__tests__/setup-plan-fixtures");
const { planPartFor } = await import("./setup-wire-fixtures");
const { WORKSPACE_SETUP_BUDGETS } = await import("../workspace-setup-spend");
const { SETUP_BUILD_PHASE_ATTEMPTS } = await import("../workspace-setup-attempts");
const { SETUP_PHASE_STALE_MS, emptySetupPhase } = await import("../workspace-setup-build.service");
const { SETUP_GENERATION_STALE_MS } = await import("../workspace-setup-interview.service");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const CHARGE = { inputTokens: 1_000, costMicrocents: 25_000, costSource: "measured" as const };

type Workspace = { companyId: string; owner: TenantUser; run: <T>(fn: () => Promise<T>) => Promise<T> };

async function workspace(): Promise<Workspace> {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const admin = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: role.id,
        firstName: "Ada",
        lastName: "Owner",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, admin };
  });
  const owner = createMockUser({ ...seed.admin, role: { ...seed.role, permissions: [] } });
  const run = <T>(fn: () => Promise<T>) => runWithTenant(owner, fn);
  return { companyId: seed.company.id, owner, run };
}

type PromptColumn = { column: string; valueType: string; options?: string[]; multiple: boolean };

function sampleValue(column: PromptColumn, index: number): string | null {
  switch (column.valueType) {
    case "number":
    case "currency":
      return String(1_000 * (index + 1));
    case "date":
      return `2026-0${(index % 9) + 1}-15`;
    case "dateTime":
      return `2026-0${(index % 9) + 1}-15T10:00:00Z`;
    case "boolean":
      return index % 2 ? "yes" : "no";
    case "select":
      return column.options?.[index % column.options.length] ?? null;
    case "email":
    case "channels":
      return `sample${index + 1}@example.test`;
    case "phone":
      return null;
    case "url":
      return `https://example.test/${index + 1}`;
    default:
      return `Sample ${index + 1}`;
  }
}

function sampleRows(prompt: string, columns: string[], count: number) {
  const line = prompt.split("\n").find((entry) => entry.startsWith("Columns: ")) ?? "Columns: []";
  const described = JSON.parse(line.slice("Columns: ".length)) as PromptColumn[];
  return Array.from({ length: count }, (_value, index) =>
    Object.fromEntries(
      columns.map((column) => {
        const definition = described.find((entry) => entry.column === column);
        return [column, definition ? sampleValue(definition, index) : null];
      }),
    ),
  );
}

function modelReplies() {
  state.generate.mockImplementation(
    (args: {
      label: string;
      prompt: string;
      model: { modelId: string };
      schema: { shape?: Record<string, unknown> };
    }) => {
      const charge = { ...CHARGE, model: args.model.modelId };
      if (args.label === "Workspace setup follow-ups") return Promise.resolve({ output: { questions: [] }, charge });
      const part = planPartFor(args.label, (state.plan ?? agencyPlan) as typeof agencyPlan);
      if (part) return Promise.resolve({ output: part, charge });
      if (args.label === "Workspace setup sample records") {
        const records = (
          args.schema as unknown as { shape: { records: { element: { shape: Record<string, unknown> } } } }
        ).shape.records.element.shape;
        const columns = Object.keys(records);
        return Promise.resolve({ output: { records: sampleRows(args.prompt, columns, 3) }, charge });
      }
      return Promise.resolve({ output: null, charge, failure: `unexpected ${args.label}`, failureScope: "request" });
    },
  );
}

type MappingReply = {
  columns: Array<{ column: string; field: string | null; namePart?: "first" | "last" }>;
  relationships: Array<{ column: string; relationship: string | null }>;
};

function promptKey(prompt: string, prefix: string, label: string) {
  const line = prompt.split("\n").find((entry) => entry.startsWith(prefix)) ?? `${prefix}[]`;
  const entries = JSON.parse(line.slice(prefix.length)) as { key: string; label: string }[];
  return entries.find((entry) => entry.label === label)?.key ?? null;
}

function mappingReplies(reply: (key: (prefix: string, label: string) => string | null) => MappingReply | null) {
  const planReply = state.generate.getMockImplementation();
  state.generate.mockImplementation((args: { label: string; prompt: string; model: { modelId: string } }) => {
    if (args.label !== "Workspace setup column mapping") return planReply?.(args);
    const charge = { ...CHARGE, model: args.model.modelId };
    const output = reply((prefix, label) => promptKey(args.prompt, prefix, label));
    if (!output) return Promise.resolve({ output: null, charge, failure: "provider down", failureScope: "provider" });
    return Promise.resolve({
      output: {
        columns: output.columns.map((column) => ({ dateOrder: null, currency: null, namePart: null, ...column })),
        relationships: output.relationships,
        phoneCountryCode: null,
      },
      charge,
    });
  });
}

const CLIENTS_CSV = [
  "Full name,Email,Phone,Company,Job title",
  "Mary Ann Collins,mary.collins@example.net,+44 20 7946 0005,,Owner",
  "Priya Patel,keine,+44 20 7946 0003,Northgate Analytics,Head of People",
  "Jack Whitmore,jack.whitmore@example.com,+44 20 7946 0006,Northgate Analytics,CFO",
  "Lily Chen,lily.chen@example.com,+44 20 7946 0019,Brightwave Media,Account Director",
].join("\n");

async function spreadsheetSetup(ws: Workspace, csv: string) {
  const started = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({ websiteUrl: null }));
  if (!started.ok) throw new Error(JSON.stringify(started.error));
  const setupId = started.data.setupId;
  const uploaded = await ws.run(() =>
    di
      .getUploadWorkspaceSetupSpreadsheetInteractor()
      .invoke({ setupId, fileName: "clients.csv", bytes: new TextEncoder().encode(csv) }),
  );
  expect(uploaded).toMatchObject({ ok: true, data: { accepted: true } });
  const saved = await ws.run(() =>
    di.getSaveWorkspaceSetupAnswersInteractor().invoke({
      setupId,
      answers: {
        companyName: { format: "shortText", value: "Studio Example" },
        language: { format: "singleChoice", value: "en" },
        currency: { format: "singleChoice", value: "EUR" },
        existingData: { format: "singleChoice", value: "spreadsheet" },
      },
      followUpAnswers: [],
    }),
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved.error));
  const queued = await ws.run(() => di.getPlanWorkspaceSetupInteractor().invoke({ setupId }));
  if (!queued.ok) throw new Error(JSON.stringify(queued.error));
  expect(await draftPlan(ws, setupId)).toBe("planned");
  const confirmed = await ws.run(() =>
    di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision: queued.data.planRevision }),
  );
  expect(confirmed.ok).toBe(true);
  return setupId;
}

async function planned(ws: Workspace) {
  const started = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({ websiteUrl: null }));
  if (!started.ok) throw new Error(JSON.stringify(started.error));
  const setupId = started.data.setupId;
  const saved = await ws.run(() =>
    di.getSaveWorkspaceSetupAnswersInteractor().invoke({
      setupId,
      answers: {
        companyName: { format: "shortText", value: "Studio Example" },
        language: { format: "singleChoice", value: "en" },
        currency: { format: "singleChoice", value: "EUR" },
        existingData: { format: "singleChoice", value: "sampleData" },
      },
      followUpAnswers: [],
    }),
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved.error));
  const queued = await ws.run(() => di.getPlanWorkspaceSetupInteractor().invoke({ setupId }));
  if (!queued.ok) throw new Error(JSON.stringify(queued.error));
  const interview = di.getWorkspaceSetupInterviewService();
  expect(await ws.run(() => interview.followUps(setupId))).toBe("none");
  await draftPlan(ws, setupId);
  return { setupId, planRevision: queued.data.planRevision };
}

async function draftPlan(ws: Workspace, setupId: string) {
  const interview = di.getWorkspaceSetupInterviewService();
  const claim = await ws.run(() => interview.claimPlan(setupId));
  if (claim.status !== "claimed") throw new Error(`plan not claimed: ${claim.status}`);
  for (const part of ["model", "knowledge", "views"] as const) {
    for (let round = 0; round < 3; round += 1)
      if ((await ws.run(() => interview.planPart(setupId, claim.revision, part))) !== "retry") break;
  }
  return ws.run(() => interview.finishPlan(setupId, claim.revision, true));
}

async function references(ws: Workspace, setupId: string) {
  const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
  const ids = new Map((setup?.created.references ?? []).map((entry) => [entry.reference, entry.id]));
  return (reference: string) => ids.get(reference) ?? "";
}

async function build(ws: Workspace, setupId: string) {
  const service = di.getWorkspaceSetupBuildService();
  const results: Record<string, string> = {};
  for (const phase of ["knowledgeBase", "dataModel", "views", "records", "dashboard"] as const) {
    for (let round = 0; round < SETUP_BUILD_PHASE_ATTEMPTS + 1; round += 1) {
      results[phase] = await ws.run(() => service.runPhase(setupId, phase));
      if (results[phase] !== "wait") break;
    }
  }
  await ws.run(() => service.finish(setupId));
  return results;
}

async function status(ws: Workspace) {
  const result = await ws.run(() => di.getGetWorkspaceSetupStatusInteractor().invoke());
  if (!result.ok || !result.data.available || !result.data.setup) throw new Error("no setup");
  return result.data.setup;
}

async function liveRecords(companyId: string, ids: string[]) {
  return runWithoutTenant(() => prisma.crmRecord.count({ where: { companyId, id: { in: ids }, deletedAt: null } }));
}

describeDatabase("AI workspace setup against the record engine", { timeout: 120_000 }, () => {
  beforeEach(() => {
    state.plan = null;
    state.dispatch.mockClear();
    state.generate.mockReset();
    modelReplies();
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
  });

  it("designs the whole model of an empty workspace, builds views, samples and a dashboard, then removes samples", async () => {
    const ws = await workspace();
    expect(await ws.run(() => createTestRecordRepo().getModel())).toMatchObject({ revision: 0, types: [] });
    const { setupId, planRevision } = await planned(ws);
    expect(state.dispatch).toHaveBeenCalledWith("prepare-workspace-setup", { setupId, userId: ws.owner.id });
    expect(state.dispatch).toHaveBeenCalledWith("plan-workspace-setup", { setupId, userId: ws.owner.id });
    expect((await status(ws)).status).toBe("planned");

    const confirmed = await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    expect(confirmed).toEqual({ ok: true, data: { setupId } });
    expect(state.dispatch).toHaveBeenCalledWith("build-workspace-setup", { setupId, userId: ws.owner.id });

    expect(await build(ws, setupId)).toEqual({
      knowledgeBase: "settled",
      dataModel: "settled",
      views: "settled",
      records: "settled",
      dashboard: "settled",
    });
    const view = await status(ws);
    expect(view.status).toBe("completed");
    expect(view.phases.map((phase) => [phase.key, phase.status, phase.attempts])).toEqual([
      ["knowledgeBase", "skipped", 1],
      ["dataModel", "completed", 1],
      ["views", "completed", 1],
      ["records", "completed", 1],
      ["dashboard", "completed", 1],
    ]);
    expect(view.results.lists.map((list) => list.key)).toEqual([
      "contact",
      "organization",
      "deal",
      "service",
      "task",
      "project",
    ]);
    expect(view.results.lists.find((list) => list.key === "project")).toMatchObject({
      name: "Project",
      created: true,
      stages: ["Briefing", "Design", "Build", "Review", "Delivered"],
    });
    expect(view.results.lists.find((list) => list.key === "deal")?.stages).toEqual([
      "Lead",
      "Briefing",
      "Offer",
      "Won",
      "Lost",
    ]);
    expect(view.results.views.map((entry) => entry.name)).toEqual(["Pipeline", "Delivery", "People"]);
    expect(view.results.widgets).toHaveLength(5);
    expect(view.results.records.map((entry) => [entry.kind, entry.count])).toEqual([
      ["sample", 3],
      ["sample", 3],
      ["sample", 3],
      ["sample", 3],
      ["sample", 3],
    ]);
    expect(view.results.records[0].titles).toEqual(["Sample 1", "Sample 2", "Sample 3"]);
    expect(view.spend.usedMicrocents).toBeGreaterThan(0);
    expect(view.spend).toMatchObject({ heldMicrocents: 0, capMicrocents: WORKSPACE_SETUP_BUDGETS.build.capMicrocents });
    expect(view.canRemoveSampleData).toBe(true);

    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    if (!setup) throw new Error("setup missing");
    expect(setup.created.lists).toHaveLength(7);
    expect(setup.created.sampleRecords).toHaveLength(15);
    expect(
      await liveRecords(
        ws.companyId,
        setup.created.sampleRecords.map((ref) => ref.recordId),
      ),
    ).toBe(15);
    expect(await runWithoutTenant(() => prisma.recordTypeGrant.count({ where: { companyId: ws.companyId } }))).toBe(0);
    const model = await ws.run(() => createTestRecordRepo().getModel());
    const reference = await references(ws, setupId);
    expect(model.capabilities.map((binding) => [binding.kind, binding.typeId]).sort()).toEqual(
      [
        ["avatar", reference("$list.contact")],
        ["membershipAuthorization", reference("$list.task")],
      ].sort(),
    );
    const lineItems = () =>
      runWithoutTenant(() =>
        prisma.crmRecord.count({
          where: { companyId: ws.companyId, typeId: reference("$list.lineItem"), deletedAt: null },
        }),
      );
    expect(await lineItems()).toBe(3);
    const contacts = setup.created.sampleRecords.filter((ref) => ref.typeId === reference("$list.contact"));
    expect(contacts).toHaveLength(3);
    expect(
      await runWithoutTenant(() =>
        prisma.recordValue.count({
          where: {
            companyId: ws.companyId,
            fieldId: reference("$field.contact.avatar"),
            recordId: { in: contacts.map((ref) => ref.recordId) },
            NOT: { textValue: null },
          },
        }),
      ),
    ).toBe(0);
    expect(
      await runWithoutTenant(() =>
        prisma.recordIdentityLink.count({
          where: { companyId: ws.companyId, recordId: { in: contacts.map((ref) => ref.recordId) } },
        }),
      ),
    ).toBe(0);

    const service = di.getWorkspaceSetupBuildService();
    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        status: "building",
        phases: Object.fromEntries(
          Object.entries(current.phases).map(([key, phase]) => [key, { ...phase, status: "pending" }]),
        ),
      })),
    );
    await build(ws, setupId);
    const replayed = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(replayed?.status).toBe("completed");
    expect(replayed?.created).toEqual(setup.created);
    expect(
      await runWithoutTenant(() =>
        prisma.crmRecord.count({ where: { companyId: ws.companyId, deletedAt: null, protectedKind: null } }),
      ),
    ).toBe(18);
    expect(
      await runWithoutTenant(() => prisma.widget.count({ where: { companyId: ws.companyId, deletedAt: null } })),
    ).toBe(5);
    expect(await runWithoutTenant(() => prisma.dataView.count({ where: { companyId: ws.companyId } }))).toBe(3);
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("skip");

    const removed = await ws.run(() => di.getRemoveWorkspaceSetupSampleDataInteractor().invoke({ setupId }));
    expect(removed).toEqual({ ok: true, data: { removed: 15 } });
    expect(
      await liveRecords(
        ws.companyId,
        setup.created.sampleRecords.map((ref) => ref.recordId),
      ),
    ).toBe(0);
    expect(await lineItems()).toBe(0);
    expect((await status(ws)).canRemoveSampleData).toBe(false);
  });

  it("lets a member invited after the build wait for approval in the planned tasks list", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    expect(await ws.run(() => di.getWorkspaceSetupBuildService().runPhase(setupId, "dataModel"))).toBe("settled");
    const reference = await references(ws, setupId);
    const email = `${randomUUID()}@example.test`;
    const authUser = await runWithoutTenant(() =>
      prisma.authUser.create({ data: { id: randomUUID(), email, name: "Invited Member" } }),
    );
    try {
      const register = new RegisterUserInteractor(
        { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
        new PrismaUserRepo(new PermissionService()),
        di.getEventService(),
        {
          resolveAccountState: () =>
            Promise.resolve({ state: "unregistered", sessionUser: { id: authUser.id, email } }),
        } as never,
        new PrismaCompanyRepo(),
        createTestWorkspaceRegistration(),
      );
      expect(
        await register.invoke(
          { email, firstName: "Invited", lastName: "Member", country: "de", agreeToTerms: true, avatarUrl: null },
          { target: { type: "invitation", companyId: ws.companyId } },
        ),
      ).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });
      expect(
        await runWithoutTenant(() =>
          prisma.crmRecord.findMany({
            where: { companyId: ws.companyId, protectedKind: "membershipAuthorization" },
            select: { typeId: true },
          }),
        ),
      ).toEqual([{ typeId: reference("$list.task") }]);
    } finally {
      await runWithoutTenant(() => prisma.authUser.delete({ where: { id: authUser.id } }));
    }
  });

  it("retries a failed phase automatically three times, then on request with three more tries", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    state.generate.mockImplementation((args: { model: { modelId: string } }) =>
      Promise.resolve({
        output: null,
        charge: { ...CHARGE, model: args.model.modelId },
        failure: "boom",
        failureScope: "request",
      }),
    );
    const service = di.getWorkspaceSetupBuildService();
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("settled");
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("wait");
    expect((await status(ws)).phases.find((phase) => phase.key === "records")).toMatchObject({
      status: "pending",
      error: "generation",
      attempts: 1,
    });
    await build(ws, setupId);
    let view = await status(ws);
    expect(view.status).toBe("failed");
    expect(view.phases.find((phase) => phase.key === "records")).toMatchObject({
      status: "failed",
      error: "generation",
      attempts: SETUP_BUILD_PHASE_ATTEMPTS,
    });
    expect(view.phases.filter((phase) => phase.status === "completed").map((phase) => phase.key)).toEqual([
      "dataModel",
      "views",
      "dashboard",
    ]);

    const retried = await ws.run(() =>
      di.getRetryWorkspaceSetupPhaseInteractor().invoke({ setupId, phase: "records" }),
    );
    expect(retried).toEqual({ ok: true, data: { setupId } });
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("wait");
    modelReplies();
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("settled");
    await ws.run(() => service.finish(setupId));
    view = await status(ws);
    expect(view.status).toBe("completed");
    expect(view.phases.find((phase) => phase.key === "records")).toMatchObject({ status: "completed", attempts: 5 });
    expect(view.phases.find((phase) => phase.key === "dataModel")?.attempts).toBe(1);
  });

  it("shows a phase whose step died as failed once its claim is stale and lets Retry restart it", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const claimedAt = (age: number) => new Date(Date.now() - age).toISOString();
    const claim = (age: number) =>
      ws.run(() =>
        di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
          phases: {
            ...current.phases,
            dataModel: { ...emptySetupPhase(), status: "running", attempts: 1, claimedAt: claimedAt(age) },
          },
        })),
      );
    const retry = () =>
      ws.run(() => di.getRetryWorkspaceSetupPhaseInteractor().invoke({ setupId, phase: "dataModel" }));
    const service = di.getWorkspaceSetupBuildService();

    await claim(60_000);
    expect((await status(ws)).phases.find((phase) => phase.key === "dataModel")).toMatchObject({
      status: "running",
      error: null,
    });
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("busy");
    expect((await retry()).ok).toBe(false);

    await claim(SETUP_PHASE_STALE_MS + 60_000);
    expect((await status(ws)).phases.find((phase) => phase.key === "dataModel")).toMatchObject({
      status: "failed",
      error: "error",
    });
    state.dispatch.mockClear();
    expect(await retry()).toEqual({ ok: true, data: { setupId } });
    expect(state.dispatch).toHaveBeenCalledWith("build-workspace-setup", { setupId, userId: ws.owner.id });
    expect((await status(ws)).phases.find((phase) => phase.key === "dataModel")).toMatchObject({
      status: "pending",
      error: null,
    });
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("settled");
    expect((await status(ws)).phases.find((phase) => phase.key === "dataModel")?.status).toBe("completed");
  });

  it("keeps the setup retryable when the build or plan workflow cannot be started", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    state.dispatch.mockRejectedValueOnce(new Error("queue down"));
    await expect(
      ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision })),
    ).rejects.toThrow("queue down");
    expect((await status(ws)).status).toBe("planned");
    expect(await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }))).toEqual({
      ok: true,
      data: { setupId },
    });
    expect((await status(ws)).status).toBe("building");

    const service = di.getWorkspaceSetupBuildService();
    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        phases: { ...current.phases, records: { ...emptySetupPhase(), status: "failed", error: "error", attempts: 3 } },
      })),
    );
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("settled");
    state.dispatch.mockRejectedValueOnce(new Error("queue down"));
    await expect(
      ws.run(() => di.getRetryWorkspaceSetupPhaseInteractor().invoke({ setupId, phase: "records" })),
    ).rejects.toThrow("queue down");
    expect((await status(ws)).phases.find((phase) => phase.key === "records")).toMatchObject({
      status: "failed",
      error: "error",
      attempts: 3,
    });
    expect(
      await ws.run(() => di.getRetryWorkspaceSetupPhaseInteractor().invoke({ setupId, phase: "records" })),
    ).toEqual({ ok: true, data: { setupId } });

    const other = await workspace();
    const replanned = await planned(other);
    state.dispatch.mockRejectedValueOnce(new Error("queue down"));
    await expect(
      other.run(() => di.getPlanWorkspaceSetupInteractor().invoke({ setupId: replanned.setupId })),
    ).rejects.toThrow("queue down");
    expect((await status(other)).status).toBe("planned");
    expect((await status(other)).plan).toMatchObject({ status: "completed", revision: replanned.planRevision });
    const again = await other.run(() => di.getPlanWorkspaceSetupInteractor().invoke({ setupId: replanned.setupId }));
    expect(again).toEqual({ ok: true, data: { planRevision: replanned.planRevision + 1 } });
  });

  it("offers Try again for a plan whose run stopped and abandons a failed planning run", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const queued = await ws.run(() => di.getPlanWorkspaceSetupInteractor().invoke({ setupId }));
    expect(queued).toEqual({ ok: true, data: { planRevision: planRevision + 1 } });
    const claim = await ws.run(() => di.getWorkspaceSetupInterviewService().claimPlan(setupId));
    expect(claim).toEqual({ status: "claimed", revision: planRevision + 1 });
    expect(await status(ws)).toMatchObject({ status: "planning", plan: { status: "running" } });
    expect((await ws.run(() => di.getPlanWorkspaceSetupInteractor().invoke({ setupId }))).ok).toBe(false);

    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        interview: {
          ...current.interview,
          planClaimedAt: new Date(Date.now() - SETUP_GENERATION_STALE_MS - 60_000).toISOString(),
        },
      })),
    );
    expect(await status(ws)).toMatchObject({ status: "interview", plan: { status: "failed", error: "error" } });
    expect(await ws.run(() => di.getPlanWorkspaceSetupInteractor().invoke({ setupId }))).toEqual({
      ok: true,
      data: { planRevision: planRevision + 2 },
    });

    await ws.run(() => di.getWorkspaceSetupInterviewService().abandonPlan(setupId, planRevision + 1));
    expect((await status(ws)).status).toBe("planning");
    await ws.run(() => di.getWorkspaceSetupInterviewService().abandonPlan(setupId, null));
    expect(await status(ws)).toMatchObject({ status: "interview", plan: { status: "failed", error: "error" } });
  });

  it("releases the phases a failed build run left behind without touching live claims", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const service = di.getWorkspaceSetupBuildService();
    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        phases: {
          ...current.phases,
          knowledgeBase: {
            ...emptySetupPhase(),
            status: "running",
            attempts: 1,
            claimedAt: new Date().toISOString(),
          },
          dataModel: { ...emptySetupPhase(), status: "pending", error: "generation", attempts: 1 },
        },
      })),
    );
    await ws.run(() => service.abandon(setupId));
    let view = await status(ws);
    expect(view.status).toBe("building");
    expect(view.phases.map((phase) => [phase.key, phase.status, phase.error])).toEqual([
      ["knowledgeBase", "running", null],
      ["dataModel", "failed", "error"],
      ["views", "failed", "dependency"],
      ["records", "failed", "dependency"],
      ["dashboard", "failed", "dependency"],
    ]);
    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        phases: { ...current.phases, knowledgeBase: { ...emptySetupPhase(), status: "skipped", attempts: 1 } },
      })),
    );
    await ws.run(() => service.abandon(setupId));
    view = await status(ws);
    expect(view.status).toBe("failed");
    expect(
      await ws.run(() => di.getRetryWorkspaceSetupPhaseInteractor().invoke({ setupId, phase: "dataModel" })),
    ).toEqual({ ok: true, data: { setupId } });
    expect((await status(ws)).phases.map((phase) => phase.status)).toEqual([
      "skipped",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("charges planning and building to separate workspace budgets", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const usage = (purpose: string) =>
      runWithoutTenant(() =>
        prisma.hostedAiPlatformWorkspaceUsage.findUnique({
          where: { companyId_purpose: { companyId: ws.companyId, purpose } },
          select: { costMicrocents: true },
        }),
      );
    const plannedCost = await usage("workspaceSetup");
    expect(Number(plannedCost?.costMicrocents ?? 0)).toBeGreaterThan(0);
    expect(await usage("workspaceSetupBuild")).toBeNull();
    expect((await status(ws)).spend.capMicrocents).toBe(WORKSPACE_SETUP_BUDGETS.plan.capMicrocents);
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    await build(ws, setupId);
    expect(Number((await usage("workspaceSetupBuild"))?.costMicrocents ?? 0)).toBeGreaterThan(0);
    expect((await usage("workspaceSetup"))?.costMicrocents).toEqual(plannedCost?.costMicrocents);
  });

  it("stops paid phases at the workspace cap and keeps the free ones", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await runWithoutTenant(() =>
      prisma.hostedAiPlatformWorkspaceUsage.create({
        data: {
          companyId: ws.companyId,
          purpose: "workspaceSetupBuild",
          costMicrocents: BigInt(WORKSPACE_SETUP_BUDGETS.build.capMicrocents),
        },
      }),
    );
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    await build(ws, setupId);
    const view = await status(ws);
    expect(view.phases.find((phase) => phase.key === "records")).toMatchObject({
      status: "stopped",
      error: "spendCap",
    });
    expect(view.phases.find((phase) => phase.key === "dataModel")?.status).toBe("completed");
    expect(view.phases.find((phase) => phase.key === "dashboard")?.status).toBe("completed");
    expect(view.spend.capReached).toBe(true);
    expect(view.status).toBe("failed");
    expect(
      state.generate.mock.calls.filter(([args]) => (args as { label: string }).label.includes("sample")),
    ).toHaveLength(0);
  });

  it("waits for the website import and records the pages it wrote", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const created = await ws.run(() =>
      di.getCreateWikiPagesInteractor().invoke({
        requireEmpty: false,
        pages: [{ title: "About Studio Example", kind: "knowledge", markdown: "We design websites." }],
      }),
    );
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    const crawl = await runWithoutTenant(() =>
      prisma.wikiWebsiteCrawl.create({
        data: {
          companyId: ws.companyId,
          userId: ws.owner.id,
          clientRequestId: randomUUID(),
          homepageUrl: "https://studio.example/",
          registrableDomain: "studio.example",
          locale: "en",
          payer: "workspaceSetup",
          status: "synthesizing",
          targets: [{ url: "https://studio.example/", category: "about", status: "read" }],
          topics: [
            {
              title: "About Studio Example",
              role: "company_overview",
              sourceIds: [],
              status: "created",
              pageId: created.data[0].id,
            },
          ],
        },
      }),
    );
    await ws.run(() => di.getWorkspaceSetupRepo().mutate(setupId, () => ({ crawlId: crawl.id })));
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const service = di.getWorkspaceSetupBuildService();
    expect(await ws.run(() => service.runPhase(setupId, "knowledgeBase"))).toBe("wait");
    expect(await ws.run(() => service.runPhase(setupId, "knowledgeBase"))).toBe("wait");
    expect((await status(ws)).phases[0]).toMatchObject({ key: "knowledgeBase", status: "running", attempts: 1 });
    await runWithoutTenant(() =>
      prisma.wikiWebsiteCrawl.update({ where: { id: crawl.id }, data: { status: "completed" } }),
    );
    expect(await ws.run(() => service.runPhase(setupId, "knowledgeBase"))).toBe("settled");
    const view = await status(ws);
    expect(view.phases[0]).toMatchObject({ status: "completed", attempts: 1 });
    expect(view.results.pages).toEqual([{ id: created.data[0].id, title: "About Studio Example" }]);
    expect(view.knowledgeBase).toMatchObject({ crawlStatus: "completed", pagesPlanned: 1, pagesWritten: 1 });
  });

  it("writes the Knowledge Base in the confirmed interview language, not the interface language", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const crawl = await runWithoutTenant(() =>
      prisma.wikiWebsiteCrawl.create({
        data: {
          companyId: ws.companyId,
          userId: ws.owner.id,
          clientRequestId: randomUUID(),
          homepageUrl: "https://studio-example.de/",
          registrableDomain: "studio-example.de",
          locale: "de",
          payer: "workspaceSetup",
          status: "synthesizing",
          targets: [{ url: "https://studio-example.de/preise", category: "pricing", status: "read" }],
          sources: {
            create: {
              companyId: ws.companyId,
              url: "https://studio-example.de/preise",
              canonicalUrl: "https://studio-example.de/preise",
              category: "pricing",
              title: "Preise",
              text: "Websites ab 5.000 Euro.",
              contentHash: "pricing",
            },
          },
        },
      }),
    );
    await ws.run(() => di.getWorkspaceSetupRepo().mutate(setupId, () => ({ crawlId: crawl.id })));
    expect(await ws.run(() => di.getWorkspaceSetupRepo().crawlSources(crawl.id))).toEqual([
      expect.objectContaining({ category: "pricing", title: "Preise" }),
    ]);

    const confirmed = await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    expect(confirmed.ok).toBe(true);
    const stored = await runWithoutTenant(() =>
      prisma.wikiWebsiteCrawl.findUniqueOrThrow({ where: { id: crawl.id }, select: { locale: true } }),
    );
    expect(stored.locale).toBe("en");
  });

  it("plans the website import's pages from the confirmed plan, the chosen pages, tone and competitors", async () => {
    const ws = await workspace();
    const { setupId } = await planned(ws);
    const crawl = await runWithoutTenant(() =>
      prisma.wikiWebsiteCrawl.create({
        data: {
          companyId: ws.companyId,
          userId: ws.owner.id,
          clientRequestId: randomUUID(),
          homepageUrl: "https://studio-example.com/",
          registrableDomain: "studio-example.com",
          locale: "en",
          payer: "workspaceSetup",
          status: "synthesizing",
          targets: [{ url: "https://studio-example.com/", category: "about", status: "read" }],
          sources: {
            create: {
              companyId: ws.companyId,
              url: "https://studio-example.com/",
              canonicalUrl: "https://studio-example.com/",
              category: "about",
              title: "Studio Example",
              text: "Studio Example designs websites for marketing teams.",
              contentHash: "home",
            },
          },
        },
      }),
    );
    const adjusted = await ws.run(() =>
      di.getAdjustWorkspaceSetupInteractor().invoke({
        setupId,
        answers: {
          knowledgePages: { format: "multipleChoice", values: ["overview"], custom: [] },
          addressForm: { format: "singleChoice", value: "informal" },
          competitors: { format: "orderedList", items: [{ label: "Studio North" }] },
        },
        followUpAnswers: [],
      }),
    );
    if (!adjusted.ok) throw new Error(JSON.stringify(adjusted.error));
    await ws.run(() => di.getWorkspaceSetupRepo().mutate(setupId, () => ({ crawlId: crawl.id })));
    await draftPlan(ws, setupId);
    const synthesis = di.getWikiWebsiteSynthesisService();
    expect(await ws.run(() => synthesis.plan(crawl.id))).toBe("wait");

    const confirmed = await ws.run(() =>
      di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision: adjusted.data.planRevision }),
    );
    expect(confirmed.ok).toBe(true);
    state.generate.mockImplementationOnce((args: { model: { modelId: string }; prompt: string }) => {
      expect(args.prompt).toContain('"key":"competitorA"');
      return Promise.resolve({
        output: { topics: [{ key: "overview", title: "x", role: "company_overview", sources: ["s1"] }] },
        charge: { ...CHARGE, model: args.model.modelId },
      });
    });
    expect(await ws.run(() => synthesis.plan(crawl.id))).toBe(4);
    const stored = await runWithoutTenant(() =>
      prisma.wikiWebsiteCrawl.findUniqueOrThrow({ where: { id: crawl.id }, select: { topics: true } }),
    );
    expect(stored.topics).toEqual([
      expect.objectContaining({
        title: "About the agency",
        setupKey: "overview",
        outline: ["What we do", "How we work"],
      }),
      expect.objectContaining({ title: "Voice and tone", role: "voice_and_tone", addressForm: "informal" }),
      expect.objectContaining({ title: "Compared with Studio North", role: "competitor", competitor: "Studio North" }),
      expect.objectContaining({ title: "Operating Guide", role: "operating_guide", addressForm: "informal" }),
    ]);
  });

  it("withdraws a drafted plan when its answers or spreadsheet change, so the old plan cannot be built", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const confirm = (revision: number) =>
      ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision: revision }));
    const upload = (fileName: string) =>
      ws.run(() =>
        di
          .getUploadWorkspaceSetupSpreadsheetInteractor()
          .invoke({ setupId, fileName, bytes: new TextEncoder().encode("Name,Email\nAda Lovelace,ada@example.test") }),
      );

    const saved = await ws.run(() =>
      di.getSaveWorkspaceSetupAnswersInteractor().invoke({
        setupId,
        answers: { companyName: { format: "shortText", value: "Studio North" } },
        followUpAnswers: [],
      }),
    );
    expect(saved.ok).toBe(true);
    expect((await status(ws)).status).toBe("interview");
    expect(await confirm(planRevision)).toMatchObject({ ok: false });

    const replanned = await ws.run(() => di.getPlanWorkspaceSetupInteractor().invoke({ setupId }));
    if (!replanned.ok) throw new Error(JSON.stringify(replanned.error));
    expect(await draftPlan(ws, setupId)).toBe("planned");
    expect(await upload("contacts.xls")).toMatchObject({ ok: true, data: { accepted: false } });
    expect((await status(ws)).status).toBe("planned");
    expect(await upload("contacts.csv")).toMatchObject({ ok: true, data: { accepted: true } });
    expect((await status(ws)).status).toBe("interview");
    expect(await confirm(replanned.data.planRevision)).toMatchObject({ ok: false });
    expect(state.dispatch).not.toHaveBeenCalledWith("build-workspace-setup", expect.anything());
  });

  it("applies the confirmed country and language to the settings before the data model", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        answers: {
          ...current.answers,
          country: { source: "website", confidence: 0.9, value: { format: "singleChoice", value: "AT" } },
          language: { source: "user", confidence: 1, value: { format: "singleChoice", value: "de" } },
        },
      })),
    );
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const service = di.getWorkspaceSetupBuildService();
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("settled");
    const owner = () =>
      runWithoutTenant(() =>
        prisma.user.findUniqueOrThrow({
          where: { id: ws.owner.id },
          select: { country: true, formattingLocale: true },
        }),
      );
    expect(await owner()).toEqual({ country: "at", formattingLocale: "de" });
    expect((await status(ws)).phases.find((phase) => phase.key === "dataModel")?.status).toBe("completed");
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("settled");
    expect(await owner()).toEqual({ country: "at", formattingLocale: "de" });
  });

  it("stops the website import of a setup that starts over, so it spends nothing more", async () => {
    const ws = await workspace();
    const { setupId } = await planned(ws);
    const crawl = await runWithoutTenant(() =>
      prisma.wikiWebsiteCrawl.create({
        data: {
          companyId: ws.companyId,
          userId: ws.owner.id,
          clientRequestId: randomUUID(),
          homepageUrl: "https://studio-example.com/",
          registrableDomain: "studio-example.com",
          locale: "en",
          payer: "workspaceSetup",
          status: "fetching",
        },
      }),
    );
    await ws.run(() => di.getWorkspaceSetupRepo().mutate(setupId, () => ({ crawlId: crawl.id, status: "failed" })));
    const restarted = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({ websiteUrl: null }));
    expect(restarted).toEqual({ ok: true, data: { setupId } });
    expect(
      await runWithoutTenant(() =>
        prisma.wikiWebsiteCrawl.findUniqueOrThrow({
          where: { id: crawl.id },
          select: { status: true, failureReason: true },
        }),
      ),
    ).toEqual({ status: "failed", failureReason: "cancelled" });
  });

  it.each([
    ["sample services", ["service", "deal"], [5_000, 14_000, 9_000]],
    ["saved prices of the offerings", ["deal"], [5_000, 14_000, 8_500]],
  ])("gives sample deals a value from their line items and %s", async (_case, lists, values) => {
    state.plan = {
      ...agencyPlan,
      sampleData: { lists: lists.map((list) => ({ list, count: 3, kinds: [] })) },
    };
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        answers: {
          ...current.answers,
          dealSize: { source: "user", confidence: 1, value: { format: "range", min: 5_000, max: 20_000 } },
          offerings: {
            source: "user",
            confidence: 1,
            value: { format: "orderedList", items: [{ label: "Relaunch" }] },
          },
        },
      })),
    );
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const service = di.getWorkspaceSetupBuildService();
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("settled");
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("settled");
    expect((await status(ws)).phases.find((phase) => phase.key === "records")?.status).toBe("completed");
    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    const reference = await references(ws, setupId);
    const deals = (setup?.created.sampleRecords ?? []).filter((ref) => ref.typeId === reference("$list.deal"));
    const dealValues = () =>
      runWithoutTenant(() =>
        prisma.recordValue.findMany({
          where: {
            companyId: ws.companyId,
            fieldId: reference("$field.deal.value"),
            recordId: { in: deals.map((ref) => ref.recordId) },
          },
          select: { recordId: true, decimalValue: true, currency: true },
        }),
      );
    const valueOf = async () => {
      const rows = await dealValues();
      return deals.map((ref) => {
        const row = rows.find((entry) => entry.recordId === ref.recordId);
        return [Number(row?.decimalValue ?? 0), row?.currency ?? null];
      });
    };
    expect(await valueOf()).toEqual(values.map((value) => [value, "EUR"]));
    const lineItems = () =>
      runWithoutTenant(() =>
        prisma.crmRecord.count({
          where: { companyId: ws.companyId, typeId: reference("$list.lineItem"), deletedAt: null },
        }),
      );
    expect(await lineItems()).toBe(3);
    const names = await runWithoutTenant(() =>
      prisma.recordValue.findMany({
        where: { companyId: ws.companyId, fieldId: reference("$list.lineItem.name") },
        select: { textValue: true },
      }),
    );
    expect(names.map((name) => name.textValue).filter((name) => name === "Relaunch")).toEqual([]);
    const samplePrompts = state.generate.mock.calls
      .map(([args]) => args as { label: string; prompt: string })
      .filter((args) => args.label === "Workspace setup sample records")
      .map((args) => args.prompt);
    expect(samplePrompts.length).toBeGreaterThan(0);
    for (const prompt of samplePrompts) {
      expect(prompt).toContain("Company facts:");
      expect(prompt).not.toContain("Relaunch");
    }

    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        status: "building",
        phases: { ...current.phases, records: { ...emptySetupPhase(), attempts: 1 } },
      })),
    );
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("settled");
    expect(await lineItems()).toBe(3);

    const removed = await ws.run(() => di.getRemoveWorkspaceSetupSampleDataInteractor().invoke({ setupId }));
    expect(removed.ok, JSON.stringify(removed)).toBe(true);
    expect(await lineItems()).toBe(0);
  });

  it("imports every spreadsheet row with its whole name, email and phone channels and the organization it names", async () => {
    const ws = await workspace();
    state.plan = {
      ...structuredClone(agencyPlan),
      importMapping: {
        list: "contact",
        columns: [
          { column: "Full name", field: "contact.name" },
          { column: "Email", field: null },
          { column: "Company", field: null },
          { column: "Job title", field: "contact.jobTitle" },
        ],
      },
    };
    mappingReplies((key) => ({
      columns: [
        { column: "Full name", field: key("Fields: ", "Contact"), namePart: "first" },
        { column: "Job title", field: key("Fields: ", "Job title") },
      ],
      relationships: [{ column: "Company", relationship: key("Relationships: ", "Client") }],
    }));
    const setupId = await spreadsheetSetup(ws, CLIENTS_CSV);
    expect((await build(ws, setupId)).records).toBe("settled");

    const reference = await references(ws, setupId);
    const contacts = reference("$list.contact");
    const clients = reference("$list.organization");
    const model = await ws.run(() => createTestRecordRepo().getModel());
    const nameField = model.types.find((type) => type.id === contacts)?.primaryFieldId ?? "";
    const channels = model.fields.find((field) => field.typeId === contacts && field.valueType === "channels")?.id;
    const view = await status(ws);
    expect(view.results.records.map((entry) => [entry.listId, entry.kind, entry.count, entry.titles])).toEqual([
      [contacts, "imported", 4, ["Mary Ann Collins", "Priya Patel", "Jack Whitmore", "Lily Chen"]],
      [clients, "imported", 2, ["Northgate Analytics", "Brightwave Media"]],
    ]);
    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(setup?.created.importedRecords).toHaveLength(6);
    expect(setup?.artifacts.importMapping).toMatchObject({
      columns: [
        { column: "Full name", fieldId: nameField },
        { column: "Job title" },
        { column: "Email", fieldId: channels },
        { column: "Phone", fieldId: channels },
      ],
    });
    const names = await runWithoutTenant(() =>
      prisma.recordValue.findMany({
        where: { companyId: ws.companyId, fieldId: nameField },
        select: { textValue: true },
      }),
    );
    expect(names.map((row) => row.textValue).sort()).toEqual([
      "Jack Whitmore",
      "Lily Chen",
      "Mary Ann Collins",
      "Priya Patel",
    ]);
    const identities = await runWithoutTenant(() =>
      prisma.recordIdentity.findMany({ where: { companyId: ws.companyId }, select: { value: true } }),
    );
    expect(identities.map((row) => row.value).sort()).toEqual([
      "+442079460003",
      "+442079460005",
      "+442079460006",
      "+442079460019",
      "jack.whitmore@example.com",
      "lily.chen@example.com",
      "mary.collins@example.net",
    ]);
    expect(view.results.records[0].skippedRows).toBe(0);
    expect(
      await runWithoutTenant(() =>
        prisma.recordLink.count({
          where: { companyId: ws.companyId, sourceTypeId: contacts, targetTypeId: clients, deletedAt: null },
        }),
      ),
    ).toBe(3);
  });

  it("creates a client named in two link columns once, so every row that names it links", async () => {
    const ws = await workspace();
    const plan = structuredClone(agencyPlan);
    state.plan = {
      ...plan,
      recordModel: {
        ...plan.recordModel,
        relationships: [
          ...plan.recordModel.relationships,
          {
            key: "contactPartner",
            source: "contact",
            target: "organization",
            sourceLabel: "Partner",
            targetLabel: "Partner contacts",
            sourceCardinality: "one",
            targetCardinality: "many",
          },
        ],
      },
      importMapping: null,
    };
    mappingReplies((key) => ({
      columns: [{ column: "Full name", field: key("Fields: ", "Contact") }],
      relationships: [
        { column: "Client", relationship: key("Relationships: ", "Client") },
        { column: "Partner", relationship: key("Relationships: ", "Partner") },
      ],
    }));
    const setupId = await spreadsheetSetup(
      ws,
      [
        "Full name,Client,Partner",
        "Mary Ann Collins,Acme GmbH,Northgate Analytics",
        "Priya Patel,Brightwave Media,Acme GmbH",
        "Jack Whitmore,Acme GmbH,",
      ].join("\n"),
    );
    expect((await build(ws, setupId)).records).toBe("settled");
    const reference = await references(ws, setupId);
    const view = await status(ws);
    expect(view.results.records.map((entry) => [entry.listId, entry.count, entry.skippedRows])).toEqual([
      [reference("$list.contact"), 3, 0],
      [reference("$list.organization"), 3, 0],
    ]);
    const acme = await runWithoutTenant(() =>
      prisma.recordValue.count({
        where: { companyId: ws.companyId, fieldId: reference("$list.organization.name"), textValue: "Acme GmbH" },
      }),
    );
    expect(acme).toBe(1);
    expect(
      await runWithoutTenant(() =>
        prisma.recordLink.count({
          where: { companyId: ws.companyId, sourceTypeId: reference("$list.contact"), deletedAt: null },
        }),
      ),
    ).toBe(5);
  });

  it("maps the sheet again instead of storing a column mapping the import cannot use", async () => {
    const ws = await workspace();
    state.plan = { ...structuredClone(agencyPlan), importMapping: null };
    let reply: "down" | "unnamed" | "named" = "down";
    mappingReplies((key) =>
      reply === "down"
        ? null
        : {
            columns: [
              reply === "named"
                ? { column: "Full name", field: key("Fields: ", "Contact") }
                : { column: "Job title", field: key("Fields: ", "Job title") },
            ],
            relationships: [],
          },
    );
    const setupId = await spreadsheetSetup(ws, CLIENTS_CSV);
    const service = di.getWorkspaceSetupBuildService();
    const stored = async () => (await ws.run(() => di.getWorkspaceSetupRepo().get(setupId)))?.artifacts.importMapping;
    const records = async () => (await status(ws)).phases.find((phase) => phase.key === "records");
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("settled");

    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("wait");
    expect(await records()).toMatchObject({ status: "pending", error: "aiUnavailable" });
    expect(await stored()).toBeUndefined();

    reply = "unnamed";
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("wait");
    expect(await records()).toMatchObject({ status: "pending", error: "generation" });
    expect(await stored()).toBeUndefined();

    reply = "named";
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("settled");
    expect(await records()).toMatchObject({ status: "completed", attempts: 3 });
    expect((await status(ws)).results.records[0]).toMatchObject({ kind: "imported", count: 4, skippedRows: 0 });
  });

  it("drops a stored column mapping the import refuses and maps the sheet again", async () => {
    const ws = await workspace();
    state.plan = { ...structuredClone(agencyPlan), importMapping: null };
    mappingReplies((key) => ({
      columns: [{ column: "Full name", field: key("Fields: ", "Contact") }],
      relationships: [],
    }));
    const setupId = await spreadsheetSetup(ws, CLIENTS_CSV);
    const service = di.getWorkspaceSetupBuildService();
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("settled");
    const reference = await references(ws, setupId);
    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        artifacts: {
          ...current.artifacts,
          importMapping: {
            typeId: reference("$list.contact"),
            locale: "en",
            timeZone: "UTC",
            columns: [{ column: "Client name", fieldId: reference("$list.contact.name") }],
            relationships: [],
          },
        },
      })),
    );
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("wait");
    const cleared = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(cleared?.artifacts.importMapping).toBeUndefined();
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("settled");
    const imported = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(imported?.artifacts.importMapping).toMatchObject({
      columns: [
        { column: "Full name", fieldId: reference("$list.contact.name") },
        { column: "Email" },
        { column: "Phone" },
      ],
    });
    expect((await status(ws)).results.records[0]).toMatchObject({ kind: "imported", count: 4 });
  });

  it("keeps the fields of the imported list optional, so rows import without a column for a required field", async () => {
    const ws = await workspace();
    const plan = structuredClone(agencyPlan);
    state.plan = {
      ...plan,
      recordModel: {
        ...plan.recordModel,
        fields: plan.recordModel.fields.map((field) =>
          field.key.startsWith("contact.") || field.key === "project.budget" ? { ...field, required: true } : field,
        ),
      },
      importMapping: { list: "contact", columns: [{ column: "Full name", field: "contact.name" }] },
    };
    mappingReplies((key) => ({
      columns: [{ column: "Full name", field: key("Fields: ", "Contact") }],
      relationships: [],
    }));
    const setupId = await spreadsheetSetup(ws, CLIENTS_CSV);
    expect((await build(ws, setupId)).records).toBe("settled");
    expect((await status(ws)).results.records[0]).toMatchObject({ kind: "imported", count: 4, skippedRows: 0 });
    const reference = await references(ws, setupId);
    const model = await ws.run(() => createTestRecordRepo().getModel());
    const required = (ref: string) => model.fields.find((field) => field.id === reference(ref))?.required;
    expect(required("$field.contact.jobTitle")).toBe(false);
    expect(required("$field.contact.email")).toBe(false);
    expect(required("$list.contact.name")).toBe(true);
    expect(required("$field.project.budget")).toBe(true);
  });

  it("skips the setup for a workspace that already has lists and never started one", async () => {
    const ws = await workspace();
    await ws.run(() => initializeStarterRecordModel());
    expect(await ws.run(() => di.getGetWorkspaceSetupStatusInteractor().invoke())).toEqual({
      ok: true,
      data: { available: false, reason: "configured", setup: null },
    });
  });

  it("keeps each workspace's setup to its own tenant", async () => {
    const first = await workspace();
    const second = await workspace();
    const { setupId } = await planned(first);
    expect(await second.run(() => di.getWorkspaceSetupRepo().get(setupId))).toBeNull();
    const other = await second.run(() => di.getGetWorkspaceSetupStatusInteractor().invoke());
    expect(other).toEqual({ ok: true, data: { available: true, setup: null } });
    const confirm = await second.run(() =>
      di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision: 1 }),
    );
    expect(confirm.ok).toBe(false);
    expect(await second.run(() => di.getWorkspaceSetupBuildService().runPhase(setupId, "dataModel"))).toBe("skip");
  });
});
