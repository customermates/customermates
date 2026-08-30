import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ImportPlan, PlanRow, RelationIndex } from "@/features/data-transfer/import/import-plan";
import type { ImportRowIssue } from "@/features/data-transfer/import/import-issues";
import type { MappingTarget } from "@/features/data-transfer/import/import-mapping";
import type { ParsedWorkbook } from "@/features/data-transfer/import/read-workbook-file";
import type { RootStore } from "@/core/stores/root.store";

import { makeObservable, observable, action, computed } from "mobx";
import { EntityType } from "@/generated/prisma";

import {
  commitImportChunkAction,
  dryRunImportChunkAction,
  getCustomColumnsByEntityTypeAction,
  getImportRelationIndexAction,
} from "@/app/actions";
import { IMPORT_CHUNK_SIZE, type ImportMode } from "@/features/data-transfer/data-transfer.schema";
import { IMPORT_ENTITIES } from "@/features/data-transfer/import/import-entity.registry";
import { ImportFileError, readWorkbookFile } from "@/features/data-transfer/import/read-workbook-file";
import { autoMatchColumns, mappingFromSchemaSheet } from "@/features/data-transfer/import/import-mapping";
import { buildPlan, chunkRows } from "@/features/data-transfer/import/import-plan";
import { dedupeIssues, mapFailureToRows, planIssueToRowIssue } from "@/features/data-transfer/import/import-issues";
import { BaseModalStore } from "@/core/base/base-modal.store";

export type ImportStep = "file" | "mapping" | "preview" | "result";

export type ImportSummary = {
  created: number;
  updated: number;
  notAttempted: number;
  stoppedAtSheetRow: number | null;
};

const RELATION_TARGETS: Record<string, EntityType> = {
  contact: EntityType.contact,
  deal: EntityType.deal,
  organization: EntityType.organization,
  service: EntityType.service,
  task: EntityType.task,
};

export class ImportWizardStore extends BaseModalStore {
  entityType: EntityType = EntityType.contact;
  step: ImportStep = "file";
  fileName = "";
  parsed?: ParsedWorkbook;
  mapping: MappingTarget[] = [];
  customColumns: CustomColumnDto[] = [];
  relationIndex: RelationIndex = {};
  plan?: ImportPlan;
  issues: ImportRowIssue[] = [];
  summary?: ImportSummary;
  isBusy = false;
  progressDone = 0;
  progressTotal = 0;
  fileError: string | null = null;
  private onComplete?: () => Promise<void> | void;

  constructor(rootStore: RootStore) {
    super(rootStore, {});

    makeObservable(this, {
      entityType: observable,
      step: observable,
      fileName: observable,
      parsed: observable.ref,
      mapping: observable,
      customColumns: observable.ref,
      relationIndex: observable.ref,
      plan: observable.ref,
      issues: observable.ref,
      summary: observable.ref,
      isBusy: observable,
      progressDone: observable,
      progressTotal: observable,
      fileError: observable,

      descriptor: computed,
      hasBlockingIssues: computed,

      openForEntity: action,
      reset: action,
      setStep: action,
      setTarget: action,
    });
  }

  get descriptor() {
    return IMPORT_ENTITIES[this.entityType];
  }

  get hasBlockingIssues(): boolean {
    return this.issues.length > 0;
  }

  reset = () => {
    this.step = "file";
    this.fileName = "";
    this.parsed = undefined;
    this.mapping = [];
    this.plan = undefined;
    this.issues = [];
    this.summary = undefined;
    this.isBusy = false;
    this.progressDone = 0;
    this.progressTotal = 0;
    this.fileError = null;
  };

  setStep = (step: ImportStep) => {
    this.step = step;
  };

  setTarget = (index: number, target: MappingTarget) => {
    this.mapping = this.mapping.map((current, position) => (position === index ? target : current));
  };

  protected override prepareToClose(): boolean {
    if (this.isBusy) return false;

    this.reset();
    return true;
  }

  openForEntity = (entityType: EntityType, onComplete?: () => Promise<void> | void) => {
    this.reset();
    this.entityType = entityType;
    this.onComplete = onComplete;
    this.open();
  };

  selectFile = async (file: File) => {
    this.setBusy(true);
    this.setFileError(null);

    try {
      const parsed = await readWorkbookFile(file);
      const customColumns = await getCustomColumnsByEntityTypeAction({ entityType: this.entityType });

      const relationTypes = [
        ...new Set(
          this.descriptor.fields.flatMap((field) => {
            const target = field.relationTarget;
            if (!target || target === "user") return [];

            return [RELATION_TARGETS[target]];
          }),
        ),
      ];

      const relations = await getImportRelationIndexAction({ entityTypes: relationTypes });
      const relationIndex: RelationIndex = {};

      for (const [key, entries] of Object.entries(relations.index)) {
        if (key.endsWith(":truncated")) continue;

        const map = new Map<string, string[]>();
        for (const [label, id] of entries) map.set(label, [...(map.get(label) ?? []), id]);
        relationIndex[key] = map;
      }

      const fromSchema = mappingFromSchemaSheet(parsed.sources, parsed.schemaRows, this.descriptor, customColumns);

      this.applyParsed(
        file.name,
        parsed,
        customColumns,
        relationIndex,
        fromSchema ?? autoMatchColumns(parsed.sources, this.descriptor, customColumns),
      );
    } catch (error) {
      this.setFileError(error instanceof ImportFileError ? error.reason : "unreadable");
    } finally {
      this.setBusy(false);
    }
  };

  runDryRun = async () => {
    if (!this.parsed) return;

    const plan = buildPlan({
      rows: this.parsed.rows,
      sources: this.parsed.sources,
      mapping: this.mapping,
      descriptor: this.descriptor,
      customColumns: this.customColumns,
      relationIndex: this.relationIndex,
    });

    const planIssues = plan.issues.map(planIssueToRowIssue);
    const updateChunks = chunkRows(plan.update, IMPORT_CHUNK_SIZE);
    const createChunks = chunkRows(plan.create, IMPORT_CHUNK_SIZE);

    this.setBusy(true);
    this.setProgress(0, updateChunks.length + createChunks.length);

    const found: ImportRowIssue[] = [...planIssues];

    try {
      for (const [mode, chunks] of [
        ["update", updateChunks],
        ["create", createChunks],
      ] as Array<[ImportMode, PlanRow[][]]>) {
        for (const chunk of chunks) {
          const result = await dryRunImportChunkAction({
            entityType: this.entityType,
            mode,
            rows: chunk.map((row) => row.payload),
          });

          if (!result.ok) found.push(...mapFailureToRows(result.failure, chunk, this.descriptor.collectionKey));

          this.setProgress(this.progressDone + 1, this.progressTotal);
        }
      }

      this.applyPlan(plan, dedupeIssues(found));
    } finally {
      this.setBusy(false);
    }
  };

  commit = async () => {
    const plan = this.plan;
    if (!plan) return;

    const updateChunks = chunkRows(plan.update, IMPORT_CHUNK_SIZE);
    const createChunks = chunkRows(plan.create, IMPORT_CHUNK_SIZE);
    const total = plan.update.length + plan.create.length;

    this.setBusy(true);
    this.setProgress(0, updateChunks.length + createChunks.length);

    let created = 0;
    let updated = 0;
    let stoppedAtSheetRow: number | null = null;
    const failures: ImportRowIssue[] = [];

    try {
      for (const [mode, chunks] of [
        ["update", updateChunks],
        ["create", createChunks],
      ] as Array<[ImportMode, PlanRow[][]]>) {
        for (const chunk of chunks) {
          if (stoppedAtSheetRow !== null) break;

          const result = await commitImportChunkAction({
            entityType: this.entityType,
            mode,
            rows: chunk.map((row) => row.payload),
          });

          if (!result.ok) {
            failures.push(...mapFailureToRows(result.failure, chunk, this.descriptor.collectionKey));
            stoppedAtSheetRow = chunk[0]?.sheetRow ?? null;
            break;
          }

          if (mode === "create") created += result.ids.length;
          else updated += chunk.length;

          this.setProgress(this.progressDone + 1, this.progressTotal);
        }
      }

      this.applySummary(
        { created, updated, notAttempted: total - created - updated, stoppedAtSheetRow },
        dedupeIssues(failures),
      );
    } finally {
      this.setBusy(false);
      await this.onComplete?.();
    }
  };

  private setBusy = action((value: boolean) => {
    this.isBusy = value;
  });

  private setFileError = action((value: string | null) => {
    this.fileError = value;
  });

  private setProgress = action((done: number, total: number) => {
    this.progressDone = done;
    this.progressTotal = total;
  });

  private applyParsed = action(
    (
      fileName: string,
      parsed: ParsedWorkbook,
      customColumns: CustomColumnDto[],
      relationIndex: RelationIndex,
      mapping: MappingTarget[],
    ) => {
      this.fileName = fileName;
      this.parsed = parsed;
      this.customColumns = customColumns;
      this.relationIndex = relationIndex;
      this.mapping = mapping;
      this.step = "mapping";
    },
  );

  private applyPlan = action((plan: ImportPlan, issues: ImportRowIssue[]) => {
    this.plan = plan;
    this.issues = issues;
    this.step = "preview";
  });

  private applySummary = action((summary: ImportSummary, issues: ImportRowIssue[]) => {
    this.summary = summary;
    this.issues = issues;
    this.step = "result";
  });
}
