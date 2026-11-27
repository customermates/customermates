import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantUser } from "@/features/user/user.schema";
import type * as StructuredModelCall from "@/ee/agent-chat/structured-model-call";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { extractWikiLinkTargets } from "@/features/wiki/wiki-link-targets";

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
const { PrismaBillingUsageRepo } = await import("@/features/billing-usage/prisma-billing-usage.repository");
const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
const { RegisterUserInteractor } = await import("@/features/user/register/register-user.interactor");
const { agencyDashboardPlan, agencyPlan } = await import("@/features/workspace-setup/__tests__/setup-plan-fixtures");
const { planPartFor } = await import("./setup-wire-fixtures");
const { WORKSPACE_SETUP_BUDGETS } = await import("../workspace-setup-spend");
const { SETUP_BUILD_PHASE_ATTEMPTS } = await import("../workspace-setup-attempts");
const { SETUP_PHASE_STALE_MS, emptySetupPhase } = await import("../workspace-setup-phases");
const { SETUP_GENERATION_STALE_MS } = await import("../workspace-setup-interview.service");
const { StartAgentWorkspaceSetupInteractor: AgentSetup } = await import("../start-agent-workspace-setup.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const RUN_ID = "workspace-setup-run";
const CHARGE = { inputTokens: 1_000, costMicrocents: 25_000, costSource: "measured" as const };

type Workspace = { companyId: string; owner: TenantUser; run: <T>(fn: () => Promise<T>) => Promise<T> };

async function workspace(): Promise<Workspace> {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    await prisma.subscription.create({ data: { companyId: company.id, status: "active", plan: "business" } });
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
    case "address":
      return `Hauptstraße ${index + 1}, 10115 Berlin`;
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
      if (args.label === "Workspace setup Knowledge Base page") {
        const quote = args.prompt.split("\n").find((line) => line.startsWith("- ")) ?? "";
        const sections = args.prompt.includes("Page title: About the agency")
          ? [{ heading: "Who we are", evidence: [{ source: "answers", quote }], content: "Studio Example." }]
          : [];
        return Promise.resolve({ output: { whenToUse: "", sections, gaps: [] }, charge });
      }
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

async function planned(ws: Workspace) {
  const started = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({}));
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
  if (claim.status === "planned") return "planned" as const;
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
  for (const phase of ["dataModel", "views", "records", "dashboard", "knowledgeBase"] as const) {
    for (let round = 0; round < SETUP_BUILD_PHASE_ATTEMPTS + 1; round += 1) {
      results[phase] = await ws.run(() => service.runPhase(setupId, phase, false, RUN_ID));
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

  it("designs the whole model of an empty workspace, builds views, samples and a dashboard", async () => {
    const ws = await workspace();
    expect(await ws.run(() => createTestRecordRepo().getModel())).toMatchObject({ revision: 0, types: [] });
    const { setupId, planRevision } = await planned(ws);
    expect(state.dispatch).not.toHaveBeenCalledWith("prepare-workspace-setup", expect.anything());
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
      ["knowledgeBase", "completed", 1],
      ["dataModel", "completed", 1],
      ["views", "completed", 1],
      ["records", "completed", 1],
      ["dashboard", "completed", 1],
    ]);
    expect(view.results.pages.map((page) => page.title)).toEqual(["About the agency", "Operating Guide"]);
    expect(view.knowledgeBase).toEqual({ pagesPlanned: 4, pagesWritten: 2 });
    const [about, guide] = await runWithoutTenant(() =>
      Promise.all(view.results.pages.map((page) => prisma.wikiPage.findUniqueOrThrow({ where: { id: page.id } }))),
    );
    expect(about).toMatchObject({ kind: "knowledge" });
    expect(JSON.stringify(about)).toContain("Answers given during the workspace setup");
    expect(guide).toMatchObject({ kind: "guide" });
    const linkTargets = (page: { id: string; markdown: string }) =>
      extractWikiLinkTargets(page.markdown, { baseUrl: "http://localhost:4000", workspaceSlug: null, pageId: page.id });
    const listIds = view.results.lists.map((list) => list.id).sort();
    expect(linkTargets(guide).pages).toEqual([about.id]);
    expect(linkTargets(guide).lists.sort()).toEqual(listIds);
    expect(linkTargets(about).pages).toEqual([guide.id]);
    expect(linkTargets(about).lists.every((id) => listIds.includes(id))).toBe(true);
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
    expect(model.capabilities.map((binding) => [binding.kind, binding.typeId])).toEqual([
      ["avatar", reference("$list.contact")],
    ]);
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

    const planner = await runWithoutTenant(() =>
      prisma.p13n.findMany({ where: { companyId: ws.companyId, p13nId: "combined-calendar" } }),
    );
    expect(planner.map((entry) => entry.userId)).toEqual([ws.owner.id]);
    expect((planner[0].settings as { sources: unknown[] }).sources).toMatchObject([
      {
        typeId: reference("$list.project"),
        calendar: {
          dateFieldId: reference("$field.project.startDate"),
          endDateFieldId: reference("$field.project.dueDate"),
        },
        color: "info",
      },
      {
        typeId: reference("$list.deal"),
        calendar: { dateFieldId: reference("$field.deal.closeDate") },
        color: "success",
      },
    ]);

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
      await runWithoutTenant(() => prisma.crmRecord.count({ where: { companyId: ws.companyId, deletedAt: null } })),
    ).toBe(18);
    expect(
      await runWithoutTenant(() => prisma.widget.count({ where: { companyId: ws.companyId, deletedAt: null } })),
    ).toBe(5);
    expect(await runWithoutTenant(() => prisma.dataView.count({ where: { companyId: ws.companyId } }))).toBe(3);
    expect(
      await runWithoutTenant(() =>
        prisma.dataView.count({ where: { companyId: ws.companyId, visibility: "workspace" } }),
      ),
    ).toBe(3);
    expect(await ws.run(() => service.runPhase(setupId, "records", false, RUN_ID))).toBe("skip");
  });

  it("plans from the chosen template without the model and builds its record model", async () => {
    const { loadTemplate } = await import("@/core/templates/template-registry");
    const ws = await workspace();
    const started = await ws.run(() =>
      di.getStartWorkspaceSetupInteractor().invoke({ templateSlug: "sales-pipeline" }),
    );
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    const setupId = started.data.setupId;
    expect((await ws.run(() => di.getWorkspaceSetupRepo().get(setupId)))?.interview.templateSlug).toBe(
      "sales-pipeline",
    );
    const again = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({ templateSlug: "sales-pipeline" }));
    expect(again).toEqual({ ok: true, data: { setupId } });
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
    expect(await ws.run(() => di.getWorkspaceSetupInterviewService().followUps(setupId))).toBe("none");
    expect(await draftPlan(ws, setupId)).toBe("planned");
    expect(state.generate).not.toHaveBeenCalled();
    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(setup?.plan?.recordModel.lists.map((list) => list.label)).toContain(
      (await loadTemplate("sales-pipeline", "en")).text.lists.opportunities.label,
    );

    const confirmed = await ws.run(() =>
      di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision: queued.data.planRevision }),
    );
    expect(confirmed).toEqual({ ok: true, data: { setupId } });
    await build(ws, setupId);
    const model = await ws.run(() => createTestRecordRepo().getModel());
    expect(model.types.map((type) => type.label)).toContain(
      (await loadTemplate("sales-pipeline", "en")).text.lists.opportunities.label,
    );
  });

  it("restarts a setup that was started with another template", async () => {
    const ws = await workspace();
    const first = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({ templateSlug: "sales-pipeline" }));
    if (!first.ok) throw new Error(JSON.stringify(first.error));
    const second = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({ templateSlug: "client-tracker" }));
    expect(second).toEqual({ ok: true, data: { setupId: first.data.setupId } });
    expect((await ws.run(() => di.getWorkspaceSetupRepo().get(first.data.setupId)))?.interview.templateSlug).toBe(
      "client-tracker",
    );
    const none = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({}));
    expect(none).toEqual({ ok: true, data: { setupId: first.data.setupId } });
    expect((await ws.run(() => di.getWorkspaceSetupRepo().get(first.data.setupId)))?.interview.templateSlug).toBeNull();
  });

  it("puts a dashboard widget into the next free spot when its planned spot is taken", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const { UpsertRecordWidgetInteractor } = await import("@/features/widget/record-widget.interactor");
    const { fail } = await import("@/core/validation/interactor-failure-server");
    const { CustomErrorCode } = await import("@/core/validation/validation.types");
    const spy = vi
      .spyOn(UpsertRecordWidgetInteractor.prototype, "invoke")
      .mockImplementationOnce(() => Promise.resolve(fail(CustomErrorCode.widgetLayoutOverlap, ["layout"])));
    try {
      expect(await build(ws, setupId)).toMatchObject({ dashboard: "settled" });
      const requested = spy.mock.calls.map(([input]) => input.layout);
      expect(requested[0]).toEqual({ x: 0, y: 0, w: 6, h: 2 });
      expect(requested[1]).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
    const view = await status(ws);
    expect(view.phases.find((phase) => phase.key === "dashboard")?.status).toBe("completed");
    expect(view.results.widgets).toHaveLength(agencyPlan.dashboard.widgets.length);
  });

  it("lets a member invited after the build wait for approval without adding a record", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    expect(await ws.run(() => di.getWorkspaceSetupBuildService().runPhase(setupId, "dataModel", false, RUN_ID))).toBe(
      "settled",
    );
    const records = () => runWithoutTenant(() => prisma.crmRecord.count({ where: { companyId: ws.companyId } }));
    const before = await records();
    const email = `${randomUUID()}@example.test`;
    const authUser = await runWithoutTenant(() =>
      prisma.authUser.create({ data: { id: randomUUID(), email, name: "Invited Member" } }),
    );
    try {
      const register = new RegisterUserInteractor(
        { sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined) } as never,
        new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo()),
        di.getEventService(),
        {
          resolveAccountState: () =>
            Promise.resolve({ state: "unregistered", sessionUser: { id: authUser.id, email } }),
        } as never,
        new PrismaCompanyRepo(new PrismaBillingUsageRepo()),
        createTestWorkspaceRegistration(),
      );
      expect(
        await register.invoke(
          { email, firstName: "Invited", lastName: "Member", agreeToTerms: true, avatarUrl: null },
          { target: { type: "invitation", companyId: ws.companyId } },
        ),
      ).toEqual({ ok: true, data: { redirectTo: "/auth/pending" } });
      expect(await records()).toBe(before);
      expect(
        await runWithoutTenant(() =>
          prisma.user.count({ where: { companyId: ws.companyId, email, status: "pendingAuthorization" } }),
        ),
      ).toBe(1);
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
    expect(await ws.run(() => service.runPhase(setupId, "dataModel", false, RUN_ID))).toBe("settled");
    expect(await ws.run(() => service.runPhase(setupId, "records", false, RUN_ID))).toBe("wait");
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
    expect(await ws.run(() => service.runPhase(setupId, "records", false, RUN_ID))).toBe("wait");
    modelReplies();
    expect(await ws.run(() => service.runPhase(setupId, "records", false, RUN_ID))).toBe("settled");
    expect(view.phases.find((phase) => phase.key === "knowledgeBase")).toMatchObject({
      status: "failed",
      error: "generation",
    });
    expect(
      await ws.run(() => di.getRetryWorkspaceSetupPhaseInteractor().invoke({ setupId, phase: "knowledgeBase" })),
    ).toEqual({ ok: true, data: { setupId } });
    expect(await ws.run(() => service.runPhase(setupId, "knowledgeBase", false, RUN_ID))).toBe("settled");
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
    expect(await ws.run(() => service.runPhase(setupId, "dataModel", false, RUN_ID))).toBe("busy");
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
    expect(await ws.run(() => service.runPhase(setupId, "dataModel", false, RUN_ID))).toBe("settled");
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
    expect(await ws.run(() => service.runPhase(setupId, "dataModel", false, RUN_ID))).toBe("settled");
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
    expect(await status(ws)).toMatchObject({
      status: "planning",
      plan: { status: "running", parts: { model: "running", knowledge: "running", views: "waiting" } },
    });
    const queuedSetup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(queuedSetup?.interview.planQueuedAt).toEqual(expect.any(String));
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
    await ws.run(() => service.abandon(setupId, RUN_ID));
    const view = await status(ws);
    expect(view.status).toBe("failed");
    expect(view.phases.map((phase) => [phase.key, phase.status, phase.error])).toEqual([
      ["knowledgeBase", "running", null],
      ["dataModel", "failed", "error"],
      ["views", "failed", "dependency"],
      ["records", "failed", "dependency"],
      ["dashboard", "failed", "dependency"],
    ]);
    expect(
      await ws.run(() => di.getRetryWorkspaceSetupPhaseInteractor().invoke({ setupId, phase: "dataModel" })),
    ).toEqual({ ok: true, data: { setupId } });
    const retried = await status(ws);
    expect(retried.status).toBe("building");
    expect(retried.phases.map((phase) => phase.status)).toEqual([
      "running",
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

  it("drafts the sample records of a list again when the model's first answer could not be read", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const replies = state.generate.getMockImplementation();
    const failedOnce = new Set<string>();
    state.generate.mockImplementation((args: { label: string; prompt: string; model: { modelId: string } }) => {
      const list = args.prompt.split("\n").find((line) => line.startsWith("List: ")) ?? "";
      if (args.label === "Workspace setup sample records" && !failedOnce.has(list)) {
        failedOnce.add(list);
        return Promise.resolve({
          output: null,
          charge: { ...CHARGE, model: args.model.modelId },
          failure: "AI_NoObjectGeneratedError",
          failureScope: "request",
          rejection: "The answer did not match the required structure: records: expected array.",
        });
      }
      return replies?.(args) as never;
    });
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    await build(ws, setupId);

    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(setup?.results.records.map((entry) => [entry.kind, entry.count])).toEqual(
      Array(failedOnce.size).fill(["sample", 3]),
    );
    const retried = state.generate.mock.calls
      .map(([args]) => args as { label: string; prompt: string })
      .filter((args) => args.label === "Workspace setup sample records" && args.prompt.includes("was rejected"));
    expect(retried).toHaveLength(failedOnce.size);
    expect(retried[0]?.prompt).toContain("records: expected array");
  });

  it("drafts the sample records of a list again when the model answered without records", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const replies = state.generate.getMockImplementation();
    const emptyOnce = new Set<string>();
    state.generate.mockImplementation((args: { label: string; prompt: string; model: { modelId: string } }) => {
      const list = args.prompt.split("\n").find((line) => line.startsWith("List: ")) ?? "";
      if (args.label === "Workspace setup sample records" && !emptyOnce.has(list)) {
        emptyOnce.add(list);
        return Promise.resolve({ output: { records: [] }, charge: { ...CHARGE, model: args.model.modelId } });
      }
      return replies?.(args) as never;
    });
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    await build(ws, setupId);

    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(setup?.results.records.map((entry) => [entry.kind, entry.count])).toEqual(
      Array(emptyOnce.size).fill(["sample", 3]),
    );
    const retried = state.generate.mock.calls
      .map(([args]) => args as { label: string; prompt: string })
      .filter((args) => args.label === "Workspace setup sample records" && args.prompt.includes("no records"));
    expect(retried).toHaveLength(emptyOnce.size);
  });

  it("fails the records phase instead of finishing without records when no answer holds any", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const replies = state.generate.getMockImplementation();
    state.generate.mockImplementation((args: { label: string; prompt: string; model: { modelId: string } }) =>
      args.label === "Workspace setup sample records"
        ? Promise.resolve({ output: { records: [] }, charge: { ...CHARGE, model: args.model.modelId } })
        : (replies?.(args) as never),
    );
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    await build(ws, setupId);

    const view = await status(ws);
    expect(view.phases.find((phase) => phase.key === "records")).toMatchObject({
      status: "failed",
      error: "generation",
    });
    expect(view.status).toBe("failed");
  });

  it("fails the records phase when the import skips every drafted record", async () => {
    state.plan = { ...agencyPlan, sampleData: { lists: [{ list: "organization", count: 3, kinds: [] }] } };
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const replies = state.generate.getMockImplementation();
    state.generate.mockImplementation(async (args: { label: string }) => {
      const reply = await (replies?.(args) as Promise<{ output: { records?: Array<Record<string, string | null>> } }>);
      if (args.label !== "Workspace setup sample records") return reply;
      const records = (reply.output.records ?? []).map((row) =>
        Object.fromEntries(Object.keys(row).map((column) => [column, column === "c1" ? "" : "Industry"])),
      );
      return { ...reply, output: { records } };
    });
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    await build(ws, setupId);

    expect((await status(ws)).phases.find((phase) => phase.key === "records")).toMatchObject({
      status: "failed",
      error: "generation",
    });
    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(setup?.created.sampleRecords).toEqual([]);
  });

  it("withdraws a drafted plan when its answers change, so the old plan cannot be built", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const confirm = (revision: number) =>
      ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision: revision }));

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
    expect(state.dispatch).not.toHaveBeenCalledWith("build-workspace-setup", expect.anything());
  });

  it("applies the confirmed language to the formatting settings and stores no country on the owner", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        answers: {
          ...current.answers,
          country: { source: "user", confidence: 1, value: { format: "singleChoice", value: "AT" } },
          language: { source: "user", confidence: 1, value: { format: "singleChoice", value: "de" } },
        },
      })),
    );
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const service = di.getWorkspaceSetupBuildService();
    expect(await ws.run(() => service.runPhase(setupId, "dataModel", false, RUN_ID))).toBe("settled");
    const owner = () =>
      runWithoutTenant(() =>
        prisma.user.findUniqueOrThrow({
          where: { id: ws.owner.id },
          select: { formattingLocale: true },
        }),
      );
    expect(await owner()).toEqual({ formattingLocale: "de" });
    expect((await status(ws)).phases.find((phase) => phase.key === "dataModel")?.status).toBe("completed");
    expect(await ws.run(() => service.runPhase(setupId, "dataModel", false, RUN_ID))).toBe("settled");
    expect(await owner()).toEqual({ formattingLocale: "de" });
  });

  it("starts with the answers the profile gave and reads no website", async () => {
    const ws = await workspace();
    state.dispatch.mockClear();
    const started = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({ locale: "de" }));
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(started.data.setupId));
    expect(setup?.status).toBe("interview");
    expect(setup?.answers).toMatchObject({
      language: { source: "user", value: { format: "singleChoice", value: "de" } },
      currency: { source: "user", value: { format: "singleChoice", value: "EUR" } },
      country: { source: "user", value: { format: "singleChoice", value: "DE" } },
    });
    expect(state.dispatch).not.toHaveBeenCalled();
  });

  it("gives sample deals a value from their line items of sample services", async () => {
    state.plan = {
      ...agencyPlan,
      sampleData: { lists: ["service", "deal"].map((list) => ({ list, count: 3, kinds: [] })) },
    };
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        answers: {
          ...current.answers,
          mainSteps: {
            source: "user",
            confidence: 1,
            value: { format: "orderedList", items: [{ label: "Relaunch" }] },
          },
        },
      })),
    );
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const service = di.getWorkspaceSetupBuildService();
    expect(await ws.run(() => service.runPhase(setupId, "dataModel", false, RUN_ID))).toBe("settled");
    expect(await ws.run(() => service.runPhase(setupId, "records", false, RUN_ID))).toBe("settled");
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
    const values = await valueOf();
    expect(values).toHaveLength(3);
    expect(values.every(([value, currency]) => Number(value) > 0 && currency === "EUR")).toBe(true);
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
      expect(prompt).toContain("Workspace facts:");
      expect(prompt).not.toContain("Relaunch");
    }

    await ws.run(() =>
      di.getWorkspaceSetupRepo().mutate(setupId, (current) => ({
        status: "building",
        phases: { ...current.phases, records: { ...emptySetupPhase(), attempts: 1 } },
      })),
    );
    expect(await ws.run(() => service.runPhase(setupId, "records", false, RUN_ID))).toBe("settled");
    expect(await lineItems()).toBe(3);
  });

  it("writes the planned address of every sample record", async () => {
    state.plan = {
      ...agencyDashboardPlan,
      sampleData: { lists: [{ list: "organization", count: 3, kinds: [] }] },
    };
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const service = di.getWorkspaceSetupBuildService();
    expect(await ws.run(() => service.runPhase(setupId, "dataModel", false, RUN_ID))).toBe("settled");
    expect(await ws.run(() => service.runPhase(setupId, "records", false, RUN_ID))).toBe("settled");
    expect((await status(ws)).phases.find((phase) => phase.key === "records")?.status).toBe("completed");
    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(setup?.results.records).toEqual([expect.objectContaining({ kind: "sample", count: 3, skippedRows: 0 })]);
    const reference = await references(ws, setupId);
    const addresses = await runWithoutTenant(() =>
      prisma.recordValue.count({
        where: { companyId: ws.companyId, fieldId: reference("$field.organization.address") },
      }),
    );
    expect(addresses).toBe(3);
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
    expect(
      await second.run(() => di.getWorkspaceSetupBuildService().runPhase(setupId, "dataModel", false, RUN_ID)),
    ).toBe("skip");
  });

  function agentSetup(ws: Workspace) {
    return new AgentSetup(
      { getAccountSession: () => Promise.resolve({ user: { email: ws.owner.email } } as never) },
      { findMembershipUnscoped: () => Promise.resolve(ws.owner) },
      di.getWorkspaceSetupRepo(),
      di.getStartWorkspaceSetupInteractor(),
      di.getPlanWorkspaceSetupInteractor(),
    );
  }

  it("plans from the description an agent gave without follow-up questions and builds on the server once the plan is ready", async () => {
    const ws = await workspace();
    const description = "We design brand identities and websites for small hotels in the Alps.";

    const started = await agentSetup(ws).invoke({
      companyId: ws.companyId,
      description,
      locale: "en",
      teamSize: "small",
      workWith: "clients",
      purpose: ["deals", "projects"],
      mainSteps: ["Briefing", "Design", "Build"],
      pricing: "fixedPrice",
      exampleRecords: true,
    });
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    const { setupId } = started.data;
    expect(started.data.status).toBe("planning");
    expect(state.dispatch).toHaveBeenCalledWith("plan-workspace-setup", { setupId, userId: ws.owner.id });

    const interview = di.getWorkspaceSetupInterviewService();
    expect(await ws.run(() => interview.followUps(setupId))).toBe("none");
    const seeded = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(seeded?.answers).toMatchObject({
      workWith: { value: { format: "singleChoice", value: "clients" } },
      purpose: { value: { format: "multipleChoice", values: ["deals", "projects"], custom: [] } },
      pricing: { value: { format: "singleChoice", value: "fixedPrice" } },
      teamSize: { value: { format: "singleChoice", value: "small" } },
    });
    expect(seeded?.interview.followUpAnswers).toEqual([
      { id: "followUp1", value: { format: "shortText", value: description } },
    ]);

    expect(await draftPlan(ws, setupId)).toBe("planned");
    expect(state.generate.mock.calls.some(([args]) => JSON.stringify(args).includes("small hotels in the Alps"))).toBe(
      true,
    );

    const autoBuild = di.getBuildAgentWorkspaceSetupInteractor();
    expect(await ws.run(() => autoBuild.invoke({ setupId }))).toEqual({ ok: true, data: { building: true } });
    expect((await status(ws)).status).toBe("building");
    expect(await ws.run(() => autoBuild.invoke({ setupId }))).toEqual({ ok: true, data: { building: true } });
    const builds = () => state.dispatch.mock.calls.filter(([name]) => name === "build-workspace-setup");
    expect(builds()).toEqual([["build-workspace-setup", { setupId, userId: ws.owner.id }]]);

    expect(await build(ws, setupId)).toMatchObject({ dataModel: "settled", records: "settled" });
    expect((await status(ws)).status).toBe("completed");
  });

  it("leaves a plan the owner started in the app waiting for the owner, and a status read starts nothing", async () => {
    const ws = await workspace();
    const { setupId } = await planned(ws);

    expect(await ws.run(() => di.getBuildAgentWorkspaceSetupInteractor().invoke({ setupId }))).toEqual({
      ok: true,
      data: { building: false },
    });
    expect((await status(ws)).status).toBe("planned");
    expect((await status(ws)).status).toBe("planned");
    expect(state.dispatch).not.toHaveBeenCalledWith("build-workspace-setup", expect.anything());
  });

  it("starts nothing when an agent reads the status of its planned setup", async () => {
    const ws = await workspace();
    const started = await agentSetup(ws).invoke({ companyId: ws.companyId, description: "A bakery in Vienna." });
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    const { setupId } = started.data;
    expect(await ws.run(() => di.getWorkspaceSetupInterviewService().followUps(setupId))).toBe("none");
    expect(await draftPlan(ws, setupId)).toBe("planned");

    expect((await status(ws)).status).toBe("planned");
    expect(state.dispatch).not.toHaveBeenCalledWith("build-workspace-setup", expect.anything());
  });

  it("refuses an agent setup for a workspace the login does not belong to and an invalid answer", async () => {
    const ws = await workspace();
    const outsider = new AgentSetup(
      { getAccountSession: () => Promise.resolve({ user: { email: "someone@example.test" } } as never) },
      { findMembershipUnscoped: () => Promise.resolve(null) },
      di.getWorkspaceSetupRepo(),
      di.getStartWorkspaceSetupInteractor(),
      di.getPlanWorkspaceSetupInteractor(),
    );

    expect((await outsider.invoke({ companyId: ws.companyId, description: "Bakery" })).ok).toBe(false);
    expect(
      (await agentSetup(ws).invoke({ companyId: ws.companyId, description: "Bakery", mainSteps: ["x".repeat(81)] })).ok,
    ).toBe(false);
    expect(state.dispatch).not.toHaveBeenCalled();
  });
});
