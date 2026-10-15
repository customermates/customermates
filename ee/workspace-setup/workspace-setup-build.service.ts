import type { z } from "zod";
import type { ApplyRecordConfigurationInteractor } from "@/features/records/configure-records.interactor";
import type { PreviewRecordConfigurationInteractor } from "@/features/records/preview-record-configuration.interactor";
import type { RecordModel, RecordRef } from "@/features/records/record-model.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type { ImportSpreadsheetInteractor } from "@/features/data-transfer/spreadsheet/import-spreadsheet.interactor";
import type { SpreadsheetMapping } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import type { UpsertDataViewInteractor } from "@/features/data-view/upsert-data-view.interactor";
import type { UpsertRecordWidgetInteractor } from "@/features/widget/record-widget.interactor";
import type { UpdateUserDetailsInteractor } from "@/features/user/upsert/update-user-details.interactor";
import type { MutateRecordInteractor } from "@/features/records/mutate-record.interactor";
import type { RecordScalar } from "@/features/records/record-model.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { BrandFetch } from "./workspace-setup-brand";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type {
  BrandMapping,
  StoredSetupPhase,
  StoredSetupPhases,
  StoredSetupResults,
  WorkspaceSetupFailure,
  WorkspaceSetupPatch,
  WorkspaceSetupPhase,
  WorkspaceSetupRecord,
} from "./workspace-setup.schema";
import type { WorkspaceSetupModelService } from "./workspace-setup-model.service";
import type { GeneratedSampleList, SampleListSpec } from "./workspace-setup-samples";

import { UserAccessor } from "@/core/base/user-accessor";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { PublicConfigurationChangeSchema } from "@/features/records/configuration.schema";
import {
  ImportSpreadsheetSchema,
  SpreadsheetMappingSchema,
} from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import { spreadsheetRecordId } from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";
import {
  SETUP_LINE_ITEM_DEAL,
  SETUP_LINE_ITEM_LIST,
  SETUP_LINE_ITEM_OFFERING,
  setupLineItemField,
  setupLineItems,
  setupRoleList,
} from "@/features/workspace-setup/setup-anchors";
import { compileSetupDashboard } from "@/features/workspace-setup/setup-dashboard-compiler";
import {
  compileSetupImportMapping,
  setupImportList,
  withOptionalImportFields,
} from "@/features/workspace-setup/setup-import-compiler";
import { compileSetupRecordModel } from "@/features/workspace-setup/setup-model-compiler";
import {
  createSetupResolver,
  setupFieldReference,
  setupIdempotencyKey,
  setupListReference,
  setupNameReference,
  setupRelationshipReference,
} from "@/features/workspace-setup/setup-references";
import { compileSetupListDefaults } from "@/features/workspace-setup/setup-view-compiler";
import { untrustedText } from "@/features/mcp-tools/untrusted-record-content";

import {
  BrandMappingSchema,
  WORKSPACE_SETUP_PHASES,
  WORKSPACE_SETUP_PHASE_DEPENDENCIES,
} from "./workspace-setup.schema";
import { readWebsiteBrand } from "./workspace-setup-brand";
import {
  loadSetupSpreadsheet,
  setupCompanySettings,
  setupCurrency,
  setupDataChoice,
  setupLanguage,
} from "./workspace-setup-inputs";
import { MappingWireSchema, sampleRecordsWireSchema } from "./workspace-setup-wire";
import {
  SETUP_MAPPING_INSTRUCTION,
  SETUP_SAMPLE_RECORDS_INSTRUCTION,
  encodePromptJson,
  setupInterviewCatalog,
  setupLanguageName,
  setupSampleFacts,
} from "./workspace-setup-prompts";
import { setupModelLabels } from "./workspace-setup-labels";
import { generatedSampleList, sampleListSpecs } from "./workspace-setup-samples";
import { sampleLineItemPlans } from "./workspace-setup-line-items";
import { settleSetupImportMapping, setupLinkTargetImports, usableSetupImportMapping } from "./workspace-setup-import";
import { phaseFailure, phaseFailureOf } from "./workspace-setup-phase-failure";
import { retriesAutomatically } from "./workspace-setup-attempts";
import {
  SetupReferencesSchema,
  SetupSamplesSchema,
  SetupViewDraftsSchema,
  SetupWidgetInputsSchema,
  createdIdsOf,
  setupResultLists,
} from "./workspace-setup-artifacts";

export const SETUP_PHASE_STALE_MS = 20 * 60 * 1_000;
const OPERATION_POLL_MS = 2_000;
const OPERATION_WAIT_MS = 4 * 60 * 1_000;
const CRAWL_ACTIVE = new Set(["queued", "discovering", "fetching", "importing", "synthesizing"]);
const SETTLED: ReadonlySet<StoredSetupPhase["status"]> = new Set(["completed", "failed", "skipped", "stopped"]);

export type SetupPhaseResult = "settled" | "wait" | "busy" | "skip";
type PhaseOutcome =
  | { status: "completed" | "skipped"; patch?: (setup: WorkspaceSetupRecord) => WorkspaceSetupPatch }
  | {
      status: "failed" | "stopped";
      error: WorkspaceSetupFailure;
      patch?: (setup: WorkspaceSetupRecord) => WorkspaceSetupPatch;
    }
  | { status: "wait" };

export function emptySetupPhase(): StoredSetupPhase {
  return {
    status: "pending",
    error: null,
    attempts: 0,
    retryFrom: 0,
    claimedAt: null,
    startedAt: null,
    finishedAt: null,
  };
}

export function setupPhaseStalled(state: StoredSetupPhase, now: Date): boolean {
  return (
    state.status === "running" &&
    (!state.claimedAt || new Date(state.claimedAt).getTime() <= now.getTime() - SETUP_PHASE_STALE_MS)
  );
}

function settledSetupStatus(phases: StoredSetupPhases): "completed" | "failed" | null {
  const states = WORKSPACE_SETUP_PHASES.map((phase) => phases[phase]?.status ?? "pending");
  if (!states.every((state) => SETTLED.has(state))) return null;
  return states.every((state) => state === "completed" || state === "skipped") ? "completed" : "failed";
}

export function abandonedSetupPatch(
  setup: WorkspaceSetupRecord,
  now: Date,
  only: readonly WorkspaceSetupPhase[] = WORKSPACE_SETUP_PHASES,
): WorkspaceSetupPatch | null {
  if (setup.status !== "building") return null;
  const phases: StoredSetupPhases = { ...setup.phases };
  let changed = false;
  for (const phase of WORKSPACE_SETUP_PHASES.filter((candidate) => only.includes(candidate))) {
    const state = phases[phase] ?? emptySetupPhase();
    if (SETTLED.has(state.status) || (state.status === "running" && !setupPhaseStalled(state, now))) continue;
    const dependencies = WORKSPACE_SETUP_PHASE_DEPENDENCIES[phase].map(
      (dependency) => phases[dependency]?.status ?? "pending",
    );
    if (dependencies.some((status) => !SETTLED.has(status))) continue;
    phases[phase] = {
      ...state,
      status: "failed",
      error: dependencies.every((status) => status === "completed") ? "error" : "dependency",
      claimedAt: null,
      finishedAt: now.toISOString(),
    };
    changed = true;
  }
  const status = settledSetupStatus(phases);
  if (!changed && !status) return null;
  return { phases, ...(status ? { status, finishedAt: now } : {}) };
}

function failureOf(error: z.ZodError): WorkspaceSetupFailure {
  const codes = interactorFailureCodes(error);
  if (codes.includes(CustomErrorCode.permissionDenied)) return "permission";
  if (codes.some((code) => code === CustomErrorCode.recordSchemaChanged || code === CustomErrorCode.recordWritePaused))
    return "schemaChanged";
  return "error";
}

function artifact<T>(setup: WorkspaceSetupRecord, key: string, schema: z.ZodType<T>): T | undefined {
  if (!(key in setup.artifacts)) return undefined;
  const parsed = schema.safeParse(setup.artifacts[key]);
  return parsed.success ? parsed.data : undefined;
}

export class WorkspaceSetupBuildService extends UserAccessor {
  private readonly warnings: string[] = [];

  constructor(
    private repo: WorkspaceSetupRepo,
    private models: Pick<WorkspaceSetupModelService, "generate" | "drainWarnings">,
    private records: Pick<RecordRepo, "getModel" | "getOperation">,
    private previewConfiguration: Pick<PreviewRecordConfigurationInteractor, "invoke">,
    private applyConfiguration: Pick<ApplyRecordConfigurationInteractor, "invoke">,
    private upsertView: Pick<UpsertDataViewInteractor, "invoke">,
    private upsertWidget: Pick<UpsertRecordWidgetInteractor, "invoke">,
    private importSpreadsheet: Pick<ImportSpreadsheetInteractor, "invoke">,
    private brandFetch: (scope: { registrableDomain: string }) => BrandFetch,
    private settings: Pick<UpdateUserDetailsInteractor, "invoke">,
    private mutateRecord: Pick<MutateRecordInteractor, "invoke">,
  ) {
    super();
  }

  drainWarnings(): string[] {
    return [...this.warnings.splice(0), ...this.models.drainWarnings()];
  }

  async runPhase(setupId: string, phase: WorkspaceSetupPhase, giveUp = false): Promise<SetupPhaseResult> {
    const before = await this.repo.get(setupId);
    if (!before || before.status !== "building") return "skip";
    const current = before.phases[phase] ?? emptySetupPhase();
    if (SETTLED.has(current.status)) return "settled";
    const blocked = WORKSPACE_SETUP_PHASE_DEPENDENCIES[phase].find(
      (dependency) => (before.phases[dependency]?.status ?? "pending") !== "completed",
    );
    if (blocked) {
      const dependency = before.phases[blocked]?.status ?? "pending";
      if (!SETTLED.has(dependency)) return "busy";
      await this.settle(setupId, phase, { status: "failed", error: "dependency" });
      return "settled";
    }
    const now = new Date();
    const claimed = await this.repo.mutate(setupId, (setup) => {
      const state = setup.phases[phase] ?? emptySetupPhase();
      if (setup.status !== "building") return null;
      const stalled = setupPhaseStalled(state, now);
      if (state.status !== "pending" && !(state.status === "running" && (stalled || phase === "knowledgeBase")))
        return null;
      if (state.status === "running" && phase === "knowledgeBase" && !stalled && !giveUp && state.attempts > 0)
        return { phases: { ...setup.phases, [phase]: { ...state, claimedAt: now.toISOString() } } };

      return {
        phases: {
          ...setup.phases,
          [phase]: {
            ...state,
            status: "running",
            error: null,
            attempts: state.status === "pending" ? state.attempts + 1 : state.attempts,
            claimedAt: now.toISOString(),
            startedAt: state.startedAt ?? now.toISOString(),
          },
        },
      };
    });
    if (!claimed?.changed) return "busy";
    let outcome: PhaseOutcome;
    let thrown: { error: unknown } | null = null;
    try {
      outcome = await this.work(claimed.setup, phase, giveUp);
    } catch (error) {
      const failure = phaseFailureOf(error);
      outcome = failure
        ? { status: failure.stop ? "stopped" : "failed", error: failure.failure }
        : { status: "failed", error: "error" };
      if (!failure) thrown = { error };
    }
    if (outcome.status === "wait") return "wait";
    const state = claimed.setup.phases[phase] ?? emptySetupPhase();
    if (outcome.status === "failed" && !giveUp && retriesAutomatically(phase, outcome.error, state)) {
      if (thrown)
        this.warnings.push(`${phase}: ${thrown.error instanceof Error ? thrown.error.message : String(thrown.error)}`);
      await this.requeue(setupId, phase, outcome.error);
      return "wait";
    }
    await this.settle(setupId, phase, outcome);
    if (thrown) throw thrown.error;
    return "settled";
  }

  private async requeue(setupId: string, phase: WorkspaceSetupPhase, error: WorkspaceSetupFailure) {
    await this.repo.mutate(setupId, (setup) => {
      const state = setup.phases[phase] ?? emptySetupPhase();
      if (state.status !== "running") return null;
      return { phases: { ...setup.phases, [phase]: { ...state, status: "pending", error, claimedAt: null } } };
    });
  }

  private async settle(
    setupId: string,
    phase: WorkspaceSetupPhase,
    outcome: Exclude<PhaseOutcome, { status: "wait" }>,
  ) {
    await this.repo.mutate(setupId, (setup) => {
      const state = setup.phases[phase] ?? emptySetupPhase();
      if (SETTLED.has(state.status)) return null;
      return {
        ...(outcome.patch?.(setup) ?? {}),
        phases: {
          ...setup.phases,
          [phase]: {
            ...state,
            status: outcome.status,
            error: "error" in outcome ? outcome.error : null,
            claimedAt: null,
            finishedAt: new Date().toISOString(),
          },
        },
      };
    });
  }

  async finish(setupId: string): Promise<void> {
    await this.repo.mutate(setupId, (setup) => {
      if (setup.status !== "building") return null;
      const status = settledSetupStatus(setup.phases);
      return status ? { status, finishedAt: new Date() } : null;
    });
  }

  async abandon(setupId: string): Promise<void> {
    await this.repo.mutate(setupId, (setup) => abandonedSetupPatch(setup, new Date()));
  }

  private work(setup: WorkspaceSetupRecord, phase: WorkspaceSetupPhase, giveUp: boolean): Promise<PhaseOutcome> {
    const plan = setup.plan;
    if (!plan) throw phaseFailure("invalidPlan");
    switch (phase) {
      case "knowledgeBase":
        return this.knowledgeBase(setup, giveUp);
      case "dataModel":
        return this.dataModel(setup, plan);
      case "views":
        return this.views(setup, plan);
      case "records":
        return this.recordsPhase(setup, plan);
      case "dashboard":
        return this.dashboard(setup, plan);
    }
  }

  private async storeArtifact<T>(setupId: string, key: string, value: T, schema: z.ZodType<T>): Promise<T> {
    const stored = await this.repo.mutate(setupId, (setup) =>
      key in setup.artifacts ? null : { artifacts: { ...setup.artifacts, [key]: value } },
    );
    if (!stored) throw phaseFailure("error");
    const kept = artifact(stored.setup, key, schema);
    if (kept === undefined) throw phaseFailure("error");
    return kept;
  }

  private async clearArtifact(setupId: string, key: string) {
    await this.repo.mutate(setupId, (setup) => {
      if (!(key in setup.artifacts)) return null;
      return { artifacts: Object.fromEntries(Object.entries(setup.artifacts).filter(([name]) => name !== key)) };
    });
  }

  private async knowledgeBase(setup: WorkspaceSetupRecord, giveUp: boolean): Promise<PhaseOutcome> {
    if (!setup.crawlId) return { status: "skipped" };
    let crawl = await this.repo.crawlState(setup.crawlId);
    if (!crawl) return { status: "failed", error: "crawlFailed" };
    if (CRAWL_ACTIVE.has(crawl.status)) {
      if (!giveUp) return { status: "wait" };
      await this.repo.stopCrawl(setup.crawlId);
      crawl = (await this.repo.crawlState(setup.crawlId)) ?? crawl;
    }
    const pages = await this.repo.knowledgeBasePages(setup.crawlId);
    const patch = (current: WorkspaceSetupRecord): WorkspaceSetupPatch => ({
      created: { ...current.created, pages: pages.map((page) => page.id) },
      results: { ...current.results, pages: pages.map((page) => ({ id: page.id, title: page.title })) },
    });
    if (crawl.status === "completed") return { status: "completed", patch };
    if (crawl.failureReason === "credits") return { status: "stopped", error: "spendCap", patch };
    if (crawl.failureReason === "aiUnavailable") return { status: "failed", error: "aiUnavailable", patch };
    return { status: "failed", error: "crawlFailed", patch };
  }

  private async brand(setup: WorkspaceSetupRecord): Promise<BrandMapping | null> {
    const stored = artifact(setup, "brand", BrandMappingSchema.nullable());
    if (stored !== undefined) return stored;
    let mapping: BrandMapping | null = null;
    const crawl = setup.crawlId ? await this.repo.crawlState(setup.crawlId) : null;
    if (crawl) {
      try {
        mapping = await readWebsiteBrand(
          crawl.homepageUrl,
          this.brandFetch({ registrableDomain: crawl.registrableDomain }),
        );
      } catch {
        mapping = null;
      }
    }
    return this.storeArtifact(setup.id, "brand", mapping, BrandMappingSchema.nullable());
  }

  private async companySettings(setup: WorkspaceSetupRecord) {
    const settings = setupCompanySettings(setup.answers);
    if (settings.country === undefined && settings.formattingLocale === undefined) return;
    const updated = await this.settings.invoke(settings);
    if (!updated.ok) throw phaseFailure(failureOf(updated.error));
  }

  private async dataModel(setup: WorkspaceSetupRecord, plan: SetupPlan): Promise<PhaseOutcome> {
    await this.companySettings(setup);
    const brand = await this.brand(setup);
    let bundle = artifact(setup, "bundle", PublicConfigurationChangeSchema);
    let references = artifact(setup, "references", SetupReferencesSchema);
    if (!bundle || !references) {
      const model = await this.records.getModel();
      const planned = setupDataChoice(setup.answers) === "spreadsheet" ? withOptionalImportFields(plan) : plan;
      const compiled = compileSetupRecordModel(planned, {
        setupId: setup.id,
        model,
        labels: await setupModelLabels(setupLanguage(setup.answers)),
        brandChip: brand?.chip ?? null,
      });
      if (!compiled.ok) throw phaseFailure("invalidPlan");
      const previewed = await this.previewConfiguration.invoke(compiled.data);
      if (!previewed.ok) throw phaseFailure(failureOf(previewed.error));
      if (!previewed.data.valid) throw phaseFailure("invalidPlan");
      references = await this.storeArtifact(setup.id, "references", previewed.data.references, SetupReferencesSchema);
      bundle = await this.storeArtifact(setup.id, "bundle", compiled.data, PublicConfigurationChangeSchema);
    }
    const applied = await this.applyConfiguration.invoke(bundle);
    if (!applied.ok) {
      const failure = failureOf(applied.error);
      if (failure === "schemaChanged" || failure === "error") {
        await this.clearArtifact(setup.id, "bundle");
        await this.clearArtifact(setup.id, "references");
      }
      throw phaseFailure(failure);
    }
    if (applied.data.status === "pending") await this.waitForOperation(applied.data.operationId);
    const model = await this.records.getModel();
    const known = references;
    return {
      status: "completed",
      patch: (current) => ({
        created: {
          ...current.created,
          references: known,
          lists: createdIdsOf(known, model, "list"),
          fields: createdIdsOf(known, model, "field"),
          relationships: createdIdsOf(known, model, "relationship"),
        },
        results: { ...current.results, colors: brand, lists: setupResultLists(plan, model, known) },
      }),
    };
  }

  private async waitForOperation(operationId: string) {
    const deadline = Date.now() + OPERATION_WAIT_MS;
    while (Date.now() < deadline) {
      const operation = await this.records.getOperation(operationId);
      if (operation?.state === "completed") return;
      if (!operation || operation.state === "failed" || operation.state === "cancelled") throw phaseFailure("error");
      await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_MS));
    }
    throw phaseFailure("error");
  }

  private async resolver(setup: WorkspaceSetupRecord, plan: SetupPlan) {
    const model = await this.records.getModel();
    return {
      model,
      resolver: createSetupResolver(plan, { model, references: setup.created.references }),
    };
  }

  private async views(setup: WorkspaceSetupRecord, plan: SetupPlan): Promise<PhaseOutcome> {
    if (plan.listDefaults.length === 0) return { status: "skipped" };
    let drafts = artifact(setup, "views", SetupViewDraftsSchema);
    if (!drafts) {
      const { model, resolver } = await this.resolver(setup, plan);
      const compiled = compileSetupListDefaults(plan, resolver, model);
      if (!compiled.ok) throw phaseFailure("invalidPlan");
      drafts = await this.storeArtifact(setup.id, "views", compiled.data, SetupViewDraftsSchema);
    }
    const views: StoredSetupResults["views"] = [];
    for (const [index, draft] of drafts.entries()) {
      let id = await this.repo.findOwnedView(draft.surfaceKey, draft.name);
      if (!id) {
        const created = await this.upsertView.invoke({
          surfaceKey: draft.surfaceKey,
          name: draft.name,
          state: draft.state,
        });
        if (!created.ok) throw phaseFailure(failureOf(created.error));
        id = created.data.id;
      }
      views.push({
        id,
        listId: draft.surfaceKey.slice("records:".length),
        name: draft.name,
        layout: plan.listDefaults[index]?.layout ?? "table",
      });
    }
    return {
      status: "completed",
      patch: (current) => ({
        created: { ...current.created, views: views.map((view) => view.id) },
        results: { ...current.results, views },
      }),
    };
  }

  private async dashboard(setup: WorkspaceSetupRecord, plan: SetupPlan): Promise<PhaseOutcome> {
    if (plan.dashboard.widgets.length === 0) return { status: "skipped" };
    let widgets = artifact(setup, "widgets", SetupWidgetInputsSchema);
    if (!widgets) {
      const { model, resolver } = await this.resolver(setup, plan);
      const brand = artifact(setup, "brand", BrandMappingSchema.nullable()) ?? null;
      const compiled = compileSetupDashboard(plan, resolver, model, {
        setupId: setup.id,
        expectedRevision: model.revision,
        brandChart: brand?.chart ?? null,
        occupied: await this.repo.ownedWidgetLayouts(),
      });
      if (!compiled.ok) throw phaseFailure("invalidPlan");
      widgets = await this.storeArtifact(setup.id, "widgets", compiled.data, SetupWidgetInputsSchema);
    }
    const created: StoredSetupResults["widgets"] = [];
    for (const widget of widgets) {
      const saved = await this.upsertWidget.invoke(widget);
      if (!saved.ok) {
        const failure = failureOf(saved.error);
        if (failure === "schemaChanged") await this.clearArtifact(setup.id, "widgets");
        throw phaseFailure(failure);
      }
      created.push({
        id: saved.data.id,
        title: saved.data.name,
        display: plan.dashboard.widgets[created.length].display,
      });
    }
    return {
      status: "completed",
      patch: (current) => ({
        created: { ...current.created, widgets: created.map((widget) => widget.id) },
        results: { ...current.results, widgets: created },
      }),
    };
  }

  private async recordsPhase(setup: WorkspaceSetupRecord, plan: SetupPlan): Promise<PhaseOutcome> {
    const choice = setupDataChoice(setup.answers);
    if (choice === "empty") return { status: "skipped" };
    if (choice === "spreadsheet") return this.importRecords(setup, plan);
    return this.sampleRecords(setup, plan);
  }

  private async sampleRecords(setup: WorkspaceSetupRecord, plan: SetupPlan): Promise<PhaseOutcome> {
    if (plan.sampleData.lists.length === 0) return { status: "skipped" };
    let samples = artifact(setup, "samples", SetupSamplesSchema);
    let capped = false;
    if (!samples) {
      const { model, resolver } = await this.resolver(setup, plan);
      const entries = plan.sampleData.lists.flatMap((entry) => {
        const typeId = resolver.list(entry.list);
        return typeId ? [{ list: entry.list, typeId, count: entry.count, kinds: entry.kinds }] : [];
      });
      const people = setupRoleList(plan, "people");
      const anchors = new Set(
        (people ? [`${people}.channels`, `${people}.avatar`] : []).flatMap((ref) => resolver.field(ref) ?? []),
      );
      const facts = setupSampleFacts(setup.answers, await setupInterviewCatalog());
      const generated: GeneratedSampleList[] = [];
      const titles = new Map<string, string[]>();
      for (const level of sampleListSpecs(entries, model, anchors)) {
        const results = await Promise.all(level.map((spec) => this.generateSamples(setup, spec, titles, facts)));
        for (const result of results) {
          if (result === "spendCap") capped = true;
          else if (result) {
            generated.push(result);
            titles.set(result.list, result.titles);
          }
        }
      }
      if (generated.length === 0) throw phaseFailure(capped ? "spendCap" : "generation", capped);
      samples = await this.storeArtifact(setup.id, "samples", generated, SetupSamplesSchema);
    }
    const refs: RecordRef[] = [];
    const results: StoredSetupResults["records"] = [];
    for (const sample of samples) {
      const idempotencyKey = setupIdempotencyKey(setup.id, `sample:${sample.list}`);
      const imported = await this.importSpreadsheet.invoke(
        ImportSpreadsheetSchema.parse({ table: sample.table, mapping: sample.mapping, idempotencyKey }),
      );
      if (!imported.ok) throw phaseFailure(failureOf(imported.error));
      refs.push(...imported.data.records);
      const kept = new Set(imported.data.records.map((ref) => ref.recordId));
      results.push({
        listId: sample.typeId,
        kind: "sample",
        count: imported.data.created,
        titles: sample.table.rows
          .filter((row) => kept.has(spreadsheetRecordId(idempotencyKey, `record:${row.rowNumber}`)))
          .map((row) => sample.titles[row.rowNumber - 2] ?? "")
          .filter(Boolean)
          .slice(0, 10),
        skippedRows: imported.data.errorCount,
      });
    }
    await this.sampleLineItems(setup, plan, samples, refs);
    const patch = (current: WorkspaceSetupRecord): WorkspaceSetupPatch => ({
      created: { ...current.created, sampleRecords: refs },
      results: { ...current.results, records: results },
    });
    return capped ? { status: "stopped", error: "spendCap", patch } : { status: "completed", patch };
  }

  private async sampleLineItems(
    setup: WorkspaceSetupRecord,
    plan: SetupPlan,
    samples: GeneratedSampleList[],
    refs: RecordRef[],
  ) {
    const lineItems = setupLineItems(plan);
    if (!lineItems) return;
    const { model, resolver } = await this.resolver(setup, plan);
    const references = new Map(setup.created.references.map((entry) => [entry.reference, entry.id]));
    const live = <T extends { id: string; archived: boolean }>(items: T[], reference: string) => {
      const id = references.get(reference);
      return id && items.some((item) => item.id === id && !item.archived) ? id : undefined;
    };
    const lineItemType = live(model.types, setupListReference(SETUP_LINE_ITEM_LIST));
    const dealRelation = live(model.relationships, setupRelationshipReference(SETUP_LINE_ITEM_DEAL));
    const offeringRelation = live(model.relationships, setupRelationshipReference(SETUP_LINE_ITEM_OFFERING));
    const field = (name: Parameters<typeof setupLineItemField>[0]) =>
      live(model.fields, setupFieldReference(setupLineItemField(name)));
    const [quantity, pricingMode, savedPrice] = [field("quantity"), field("pricingMode"), field("savedPrice")];
    const lineName = live(model.fields, setupNameReference(SETUP_LINE_ITEM_LIST));
    const deals = resolver.list(lineItems.deals);
    const offerings = resolver.list(lineItems.offerings);
    const price = resolver.field(`${lineItems.offerings}.price`);
    if (!lineItemType || !dealRelation || !offeringRelation || !quantity || !deals || !offerings || !price) return;
    const items = sampleLineItemPlans({
      setupId: setup.id,
      samples,
      imported: new Set(refs.map((ref) => ref.recordId)),
      answers: setup.answers,
      deals,
      offerings: { typeId: offerings, priceFieldId: price, nameFieldId: resolver.field(`${lineItems.offerings}.name`) },
    });
    for (const item of items) {
      if (item.unitPrice && !(pricingMode && savedPrice)) continue;
      const fields: Array<{ fieldId: string; value: RecordScalar }> = [
        { fieldId: quantity, value: { kind: "decimal", value: String(item.quantity), currency: null } },
        ...(item.name && lineName ? [{ fieldId: lineName, value: { kind: "text" as const, value: item.name } }] : []),
        ...(item.unitPrice && pricingMode && savedPrice
          ? [
              { fieldId: pricingMode, value: { kind: "select" as const, value: "saved" } },
              {
                fieldId: savedPrice,
                value: { kind: "decimal" as const, value: item.unitPrice, currency: plan.workspace.currency },
              },
            ]
          : []),
      ];
      const created = await this.mutateRecord.invoke({
        expectedRevision: model.revision,
        idempotencyKey: setupIdempotencyKey(setup.id, `lineItem:${item.deal.recordId}`),
        mutation: {
          action: "create",
          typeId: lineItemType,
          fields,
          links: [
            { relationId: dealRelation, direction: "outgoing", record: item.deal },
            ...(item.offering
              ? [{ relationId: offeringRelation, direction: "outgoing" as const, record: item.offering }]
              : []),
          ],
        },
      });
      if (created.ok || interactorFailureCodes(created.error).includes(CustomErrorCode.recordIdempotencyConflict))
        continue;
      throw phaseFailure(failureOf(created.error));
    }
  }

  private async generateSamples(
    setup: WorkspaceSetupRecord,
    spec: SampleListSpec,
    titles: ReadonlyMap<string, string[]>,
    facts: unknown,
  ): Promise<GeneratedSampleList | "spendCap" | null> {
    const headers = [...spec.columns.map((column) => column.column), ...spec.links.map((link) => link.column)];
    const result = await this.models.generate({
      label: "Workspace setup sample records",
      purpose: "setupDrafting",
      schema: sampleRecordsWireSchema(headers),
      system: SETUP_SAMPLE_RECORDS_INSTRUCTION,
      prompt: [
        `Workspace language: ${setupLanguageName(setupLanguage(setup.answers))}. Currency: ${setupCurrency(setup.answers) ?? "EUR"}.`,
        `List: ${spec.label}. Write ${spec.count} records${spec.kinds.length ? ` covering: ${spec.kinds.join(", ")}` : ""}.`,
        `Columns: ${encodePromptJson(spec.columns.map(({ column, label, valueType, multiple, options, required }) => ({ column, label, valueType, multiple, required, ...(options.length ? { options } : {}) })))}`,
        ...spec.links.map(
          (link) =>
            `Link column ${link.column} (${link.label}, ${link.many ? "several names separated by ;" : "one name"}${link.unique ? ", each name in at most one record" : ""}): ${encodePromptJson(titles.get(link.targetList) ?? [])}`,
        ),
        "Company facts:",
        untrustedText(encodePromptJson(facts)),
      ].join("\n"),
    });
    if (!result.ok) return result.failure === "spendCap" ? "spendCap" : null;
    const rows = result.value.records;
    return generatedSampleList(spec, rows, titles, plan(setup).workspace.currency);
  }

  private async importRecords(setup: WorkspaceSetupRecord, plan: SetupPlan): Promise<PhaseOutcome> {
    const sheet = await loadSetupSpreadsheet(await this.repo.readSpreadsheet(setup.id), setupLanguage(setup.answers));
    if (!sheet) throw phaseFailure("spreadsheet");
    const { model, resolver } = await this.resolver(setup, plan);
    let mapping = artifact(setup, "importMapping", SpreadsheetMappingSchema);
    if (!mapping) {
      const compiled = compileSetupImportMapping(plan, resolver, model);
      const typeId = compiled.ok && compiled.data ? compiled.data.typeId : resolver.list(setupImportList(plan) ?? "");
      if (!typeId) throw phaseFailure("invalidPlan");
      const proposed = await this.proposeMapping(setup, sheet, model, typeId, compiled.ok ? compiled.data : null);
      mapping = await this.storeArtifact(setup.id, "importMapping", proposed, SpreadsheetMappingSchema);
    }
    const refused = async (error: z.ZodError) => {
      if (error.issues.some((issue) => issue.path[0] === "mapping"))
        await this.clearArtifact(setup.id, "importMapping");
      return phaseFailure(failureOf(error));
    };
    const links = setupLinkTargetImports(sheet.table, mapping, model);
    const linked: RecordRef[] = [];
    const linkResults: StoredSetupResults["records"] = [];
    for (const target of links.targets) {
      const created = await this.importSpreadsheet.invoke(
        ImportSpreadsheetSchema.parse({
          table: target.table,
          mapping: target.mapping,
          idempotencyKey: setupIdempotencyKey(setup.id, `import:${target.relationId}`),
        }),
      );
      if (!created.ok) throw await refused(created.error);
      linked.push(...created.data.records);
      linkResults.push({
        listId: target.typeId,
        kind: "imported",
        count: created.data.created,
        titles: target.table.rows.slice(0, 10).map((row) => String(row.cells[0] ?? "")),
        skippedRows: created.data.errorCount,
      });
    }
    const idempotencyKey = setupIdempotencyKey(setup.id, "import");
    const imported = await this.importSpreadsheet.invoke(
      ImportSpreadsheetSchema.parse({ table: sheet.table, mapping: links.mapping, idempotencyKey }),
    );
    if (!imported.ok) throw await refused(imported.error);
    const primary = model.types.find((type) => type.id === mapping.typeId)?.primaryFieldId;
    const titleColumn =
      mapping.columns.find((column) => column.fieldId === primary)?.column ?? mapping.columns[0]?.column;
    const titleIndex = titleColumn ? sheet.table.headers.indexOf(titleColumn) : -1;
    const kept = new Set(imported.data.records.map((ref) => ref.recordId));
    const results: StoredSetupResults["records"] = [
      {
        listId: mapping.typeId,
        kind: "imported",
        count: imported.data.created,
        titles: sheet.table.rows
          .filter((row) => kept.has(spreadsheetRecordId(idempotencyKey, `record:${row.rowNumber}`)))
          .slice(0, 10)
          .map((row) => (titleIndex >= 0 ? String(row.cells[titleIndex] ?? "") : ""))
          .filter(Boolean),
        skippedRows: imported.data.errorCount,
      },
      ...linkResults,
    ];
    return {
      status: "completed",
      patch: (current) => ({
        created: { ...current.created, importedRecords: [...linked, ...imported.data.records] },
        results: { ...current.results, records: results },
      }),
    };
  }

  private async proposeMapping(
    setup: WorkspaceSetupRecord,
    sheet: NonNullable<Awaited<ReturnType<typeof loadSetupSpreadsheet>>>,
    model: RecordModel,
    typeId: string,
    planned: { columns: Array<{ column: string; fieldId: string | null }> } | null,
  ): Promise<SpreadsheetMapping> {
    const fields = model.fields.filter(
      (field) => field.typeId === typeId && !field.archived && field.behavior.kind === "input",
    );
    const keys = new Map(fields.map((field, index) => [`f${index + 1}`, field.id]));
    const relations = model.relationships.filter((relation) => !relation.archived && relation.sourceTypeId === typeId);
    const relationKeys = new Map(relations.map((relation, index) => [`l${index + 1}`, relation.id]));
    const locale = setupLanguage(setup.answers);
    const fallback: SpreadsheetMapping = {
      typeId,
      locale,
      timeZone: "UTC",
      columns: (planned?.columns ?? []).flatMap((column) =>
        column.fieldId ? [{ column: column.column, fieldId: column.fieldId }] : [],
      ),
      relationships: [],
    };
    const result = await this.models.generate({
      label: "Workspace setup column mapping",
      purpose: "setupDrafting",
      schema: MappingWireSchema,
      system: SETUP_MAPPING_INSTRUCTION,
      prompt: [
        `Workspace currency: ${setupCurrency(setup.answers) ?? plan(setup).workspace.currency}.`,
        `Fields: ${encodePromptJson(fields.map((field, index) => ({ key: `f${index + 1}`, label: field.label, valueType: field.valueType, required: field.required, options: field.options.map((option) => option.label) })))}`,
        `Relationships: ${encodePromptJson(relations.map((relation, index) => ({ key: `l${index + 1}`, label: relation.sourceLabel })))}`,
        `Suggested mapping: ${encodePromptJson((planned?.columns ?? []).map((column) => ({ column: column.column, field: [...keys].find(([, id]) => id === column.fieldId)?.[0] ?? null })))}`,
        "Spreadsheet:",
        untrustedText(encodePromptJson({ profile: sheet.profile, preview: sheet.preview })),
      ].join("\n"),
    });
    if (!result.ok) throw phaseFailure(result.failure, result.failure === "spendCap");
    const used = new Set<string>();
    const proposal: SpreadsheetMapping = {
      typeId,
      locale,
      timeZone: "UTC",
      ...(result.value.phoneCountryCode && /^[1-9]\d{0,2}$/.test(result.value.phoneCountryCode)
        ? { phoneCountryCode: result.value.phoneCountryCode }
        : {}),
      columns: result.value.columns.flatMap((entry) => {
        const fieldId = entry.field ? keys.get(entry.field) : undefined;
        if (!fieldId || used.has(fieldId) || !sheet.table.headers.includes(entry.column)) return [];
        used.add(fieldId);
        return [
          {
            column: entry.column,
            fieldId,
            ...(entry.dateOrder ? { dateOrder: entry.dateOrder } : {}),
            ...(entry.currency && /^[A-Z]{3}$/.test(entry.currency) ? { currency: entry.currency } : {}),
            ...(entry.namePart ? { namePart: entry.namePart } : {}),
          },
        ];
      }),
      relationships: result.value.relationships.flatMap((entry) => {
        const relationId = relationKeys.get(entry.relationship);
        return relationId && sheet.table.headers.includes(entry.column) ? [{ column: entry.column, relationId }] : [];
      }),
    };
    const parsed = SpreadsheetMappingSchema.safeParse(proposal);
    for (const candidate of parsed.success ? [parsed.data, fallback] : [fallback]) {
      const settled = settleSetupImportMapping(candidate, sheet.profile, model);
      if (usableSetupImportMapping(settled, sheet, model)) return settled;
    }
    throw phaseFailure("generation");
  }
}

function plan(setup: WorkspaceSetupRecord): SetupPlan {
  if (!setup.plan) throw phaseFailure("invalidPlan");
  return setup.plan;
}
