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
const { InitializeRecordModelService } = await import("@/features/records/initialize-record-model.service");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { presetId } = await import("@/features/records/crm-preset");
const { agencyPlan } = await import("@/features/workspace-setup/__tests__/setup-plan-fixtures");
const { planPartFor } = await import("./setup-wire-fixtures");
const { WORKSPACE_SETUP_SPEND_CAP_MICROCENTS } = await import("../workspace-setup-spend");
const { emptySetupPhase } = await import("../workspace-setup-build.service");

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
  await run(() => new InitializeRecordModelService(createTestRecordRepo()).initialize());
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
  await ws.run(() => interview.plan(setupId));
  return { setupId, planRevision: queued.data.planRevision };
}

async function build(ws: Workspace, setupId: string) {
  const service = di.getWorkspaceSetupBuildService();
  const results: Record<string, string> = {};
  for (const phase of ["knowledgeBase", "dataModel", "views", "records", "dashboard"] as const)
    results[phase] = await ws.run(() => service.runPhase(setupId, phase));
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

  it("plans, applies, builds views, samples and a dashboard, then removes samples and rolls back", async () => {
    const ws = await workspace();
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
    expect(view.results.views.map((entry) => entry.name)).toEqual(["Pipeline", "Delivery"]);
    expect(view.results.widgets).toHaveLength(5);
    expect(view.results.records.map((entry) => [entry.kind, entry.count])).toEqual([
      ["sample", 3],
      ["sample", 3],
      ["sample", 3],
    ]);
    expect(view.results.records[0].titles).toEqual(["Sample 1", "Sample 2", "Sample 3"]);
    expect(view.spend.usedMicrocents).toBeGreaterThan(0);
    expect(view.spend).toMatchObject({ heldMicrocents: 0, capMicrocents: WORKSPACE_SETUP_SPEND_CAP_MICROCENTS });
    expect(view.canRemoveSampleData).toBe(true);
    expect(view.canUseStandardSetup).toBe(false);

    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    if (!setup) throw new Error("setup missing");
    expect(setup.created.lists).toHaveLength(1);
    expect(setup.created.sampleRecords).toHaveLength(9);
    expect(
      await liveRecords(
        ws.companyId,
        setup.created.sampleRecords.map((ref) => ref.recordId),
      ),
    ).toBe(9);
    const grants = await runWithoutTenant(() =>
      prisma.recordTypeGrant.findMany({ where: { companyId: ws.companyId, typeId: setup.created.lists[0] } }),
    );
    const dealGrants = await runWithoutTenant(() =>
      prisma.recordTypeGrant.findMany({ where: { companyId: ws.companyId, typeId: presetId(ws.companyId, "deal") } }),
    );
    expect(grants.map((grant) => grant.roleId).sort()).toEqual(dealGrants.map((grant) => grant.roleId).sort());

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
    ).toBe(9);
    expect(
      await runWithoutTenant(() => prisma.widget.count({ where: { companyId: ws.companyId, deletedAt: null } })),
    ).toBe(5);
    expect(await runWithoutTenant(() => prisma.dataView.count({ where: { companyId: ws.companyId } }))).toBe(2);
    expect(await ws.run(() => service.runPhase(setupId, "records"))).toBe("skip");

    const removed = await ws.run(() => di.getRemoveWorkspaceSetupSampleDataInteractor().invoke({ setupId }));
    expect(removed).toEqual({ ok: true, data: { removed: 9 } });
    expect(
      await liveRecords(
        ws.companyId,
        setup.created.sampleRecords.map((ref) => ref.recordId),
      ),
    ).toBe(0);
    expect((await status(ws)).canRemoveSampleData).toBe(false);

    const rolledBack = await ws.run(() => di.getRollBackWorkspaceSetupInteractor().invoke({ setupId }));
    expect(rolledBack.ok, JSON.stringify(rolledBack)).toBe(true);
    expect((await status(ws)).status).toBe("rolledBack");
    expect(
      await runWithoutTenant(() => prisma.widget.count({ where: { companyId: ws.companyId, deletedAt: null } })),
    ).toBe(0);
    expect(
      await runWithoutTenant(() => prisma.dataView.count({ where: { companyId: ws.companyId, deletedAt: null } })),
    ).toBe(0);
    const model = await ws.run(() => createTestRecordRepo().getModel());
    expect(model.types.find((type) => type.id === setup.created.lists[0])?.archived ?? true).toBe(true);
  });

  it("retries one failed phase alone and keeps the finished ones", async () => {
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
    await build(ws, setupId);
    let view = await status(ws);
    expect(view.status).toBe("failed");
    expect(view.phases.find((phase) => phase.key === "records")).toMatchObject({
      status: "failed",
      error: "generation",
    });
    expect(view.phases.filter((phase) => phase.status === "completed").map((phase) => phase.key)).toEqual([
      "dataModel",
      "views",
      "dashboard",
    ]);

    modelReplies();
    const retried = await ws.run(() =>
      di.getRetryWorkspaceSetupPhaseInteractor().invoke({ setupId, phase: "records" }),
    );
    expect(retried).toEqual({ ok: true, data: { setupId } });
    expect(await ws.run(() => di.getWorkspaceSetupBuildService().runPhase(setupId, "dataModel"))).toBe("settled");
    expect(await ws.run(() => di.getWorkspaceSetupBuildService().runPhase(setupId, "records"))).toBe("settled");
    await ws.run(() => di.getWorkspaceSetupBuildService().finish(setupId));
    view = await status(ws);
    expect(view.status).toBe("completed");
    expect(view.phases.find((phase) => phase.key === "records")).toMatchObject({ status: "completed", attempts: 2 });
    expect(view.phases.find((phase) => phase.key === "dataModel")?.attempts).toBe(1);
  });

  it("stops paid phases at the workspace cap and keeps the free ones", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    await runWithoutTenant(() =>
      prisma.hostedAiPlatformWorkspaceUsage.update({
        where: { companyId_purpose: { companyId: ws.companyId, purpose: "workspaceSetup" } },
        data: { costMicrocents: BigInt(WORKSPACE_SETUP_SPEND_CAP_MICROCENTS) },
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
    await ws.run(() => di.getWorkspaceSetupInterviewService().plan(setupId));
    await ws.run(() => di.getWorkspaceSetupRepo().mutate(setupId, () => ({ crawlId: crawl.id })));
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

  it("switches to the standard setup before the data model is applied and keeps the pages already written", async () => {
    const ws = await workspace();
    const { setupId, planRevision } = await planned(ws);
    const page = await ws.run(() =>
      di.getCreateWikiPagesInteractor().invoke({
        requireEmpty: false,
        pages: [{ title: "About Studio Example", kind: "knowledge", markdown: "We design websites." }],
      }),
    );
    if (!page.ok) throw new Error(JSON.stringify(page.error));
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
          topics: [
            {
              title: "About Studio Example",
              role: "company_overview",
              sourceIds: [],
              status: "created",
              pageId: page.data[0].id,
            },
            { title: "Pricing", role: "offering", sourceIds: [], status: "pending" },
          ],
        },
      }),
    );
    await ws.run(() => di.getWorkspaceSetupRepo().mutate(setupId, () => ({ crawlId: crawl.id })));
    await ws.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId, planRevision }));
    const service = di.getWorkspaceSetupBuildService();
    expect(await ws.run(() => service.runPhase(setupId, "knowledgeBase"))).toBe("wait");
    const before = await ws.run(() => createTestRecordRepo().getModel());

    const useStandard = () => ws.run(() => di.getUseStandardWorkspaceSetupInteractor().invoke({ setupId }));
    expect(await useStandard()).toEqual({ ok: true, data: { setupId } });
    const view = await status(ws);
    expect(view).toMatchObject({ status: "completed", canUseStandardSetup: false });
    expect(view.results).toMatchObject({
      standard: true,
      pages: [{ id: page.data[0].id, title: "About Studio Example" }],
    });
    expect(view.phases.map((phase) => [phase.key, phase.status])).toEqual([
      ["knowledgeBase", "stopped"],
      ["dataModel", "stopped"],
      ["views", "stopped"],
      ["records", "stopped"],
      ["dashboard", "stopped"],
    ]);
    expect(
      await runWithoutTenant(() =>
        prisma.wikiWebsiteCrawl.findUniqueOrThrow({ where: { id: crawl.id }, select: { status: true } }),
      ),
    ).toEqual({ status: "completed" });
    expect(await ws.run(() => service.runPhase(setupId, "dataModel"))).toBe("skip");
    expect((await ws.run(() => createTestRecordRepo().getModel())).revision).toBe(before.revision);
    expect(await useStandard()).toEqual({ ok: true, data: { setupId } });
    const setup = await ws.run(() => di.getWorkspaceSetupRepo().get(setupId));
    expect(setup?.created.pages).toEqual([page.data[0].id]);
  });

  it("stops a plan still being written and refuses the standard setup once the data model is applied", async () => {
    const ws = await workspace();
    const started = await ws.run(() => di.getStartWorkspaceSetupInteractor().invoke({ websiteUrl: null }));
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    const setupId = started.data.setupId;
    await ws.run(() => di.getPlanWorkspaceSetupInteractor().invoke({ setupId }));
    expect(await ws.run(() => di.getUseStandardWorkspaceSetupInteractor().invoke({ setupId }))).toEqual({
      ok: true,
      data: { setupId },
    });
    await ws.run(() => di.getWorkspaceSetupInterviewService().plan(setupId));
    const view = await status(ws);
    expect(view).toMatchObject({ status: "completed", plan: { status: "idle", plan: null } });
    expect(state.generate).not.toHaveBeenCalled();

    const other = await workspace();
    const { setupId: appliedId, planRevision } = await planned(other);
    await other.run(() => di.getConfirmWorkspaceSetupInteractor().invoke({ setupId: appliedId, planRevision }));
    await other.run(() => di.getWorkspaceSetupBuildService().runPhase(appliedId, "dataModel"));
    const refused = await other.run(() => di.getUseStandardWorkspaceSetupInteractor().invoke({ setupId: appliedId }));
    expect(refused.ok).toBe(false);
    expect((await status(other)).status).toBe("building");
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
    const deals = (setup?.created.sampleRecords ?? []).filter((ref) => ref.typeId === presetId(ws.companyId, "deal"));
    const dealValues = () =>
      runWithoutTenant(() =>
        prisma.recordValue.findMany({
          where: {
            companyId: ws.companyId,
            fieldId: presetId(ws.companyId, "deal.totalValue"),
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
          where: { companyId: ws.companyId, typeId: presetId(ws.companyId, "lineItem"), deletedAt: null },
        }),
      );
    expect(await lineItems()).toBe(3);

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
