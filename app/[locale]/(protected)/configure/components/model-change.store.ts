import { z } from "zod";
import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import { cloneDeep } from "lodash";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";
import { ConfigurationChangeSchema } from "@/features/records/configuration.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { rebaseModelChangeDraft } from "./model-change-rebase";

import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { BaseModalStore } from "@/core/base/base-modal.store";
import {
  applyRecordConfigurationAction,
  getRecordModelAction,
  previewRecordConfigurationAction,
} from "../../records/actions";

export abstract class ModelChangeStore<Form extends object> extends BaseModalStore<Form> {
  model: RecordModelView;
  preview: ConfigurationPreview | null = null;
  pendingOperationId: string | null = null;
  refreshRequired = false;
  refreshFailed = false;
  targetMissing = false;
  conflicts: string[] = [];
  private forcePreviewBeforeApply = false;
  canRenewSummaries = false;
  summaryRenewalCandidates: Array<{ fieldId: string; dependencyHash: string }> = [];
  summaryRenewalsApproved = false;
  private summaryPreviewPending = false;
  private idempotencyKey: string | null = null;
  private sessionGeneration = 0;
  private draftGeneration = 0;
  constructor(
    root: RootStore,
    initial: Form,
    model: RecordModelView,
    private completed: (preview: ConfigurationPreview, isCurrentSession?: () => boolean) => Promise<void>,
    canRenewSummaries = false,
    private onModelRefreshed?: (model: RecordModelView) => void,
  ) {
    super(root, initial, undefined, { register: false });
    this.model = model;
    this.canRenewSummaries = canRenewSummaries;
    makeObservable(this, {
      model: observable.ref,
      preview: observable.ref,
      pendingOperationId: observable,
      refreshRequired: observable,
      refreshFailed: observable,
      targetMissing: observable,
      conflicts: observable.ref,
      canRenewSummaries: observable,
      summaryRenewalCandidates: observable.ref,
      summaryRenewalsApproved: observable,
      setCanRenewSummaries: action,
      setSummaryRenewalsApproved: action,
      resetModel: action,
      setPreview: action,
      setPendingOperation: action,
      markRefreshRequired: action,
      resolveConflicts: action,
      rebaseDraft: action,
    });
  }
  abstract operations(): ConfigurationChange["operations"];
  protected abstract projectLatestModel(model: RecordModelView): Form | null;
  protected enrichPreviewChange(change: ConfigurationChange, _preview: ConfigurationPreview): ConfigurationChange {
    return change;
  }
  protected immediateApply = false;
  applyWithoutReview = false;
  private needsNoReview(preview: ConfigurationPreview) {
    return (
      this.applyWithoutReview &&
      preview.valid &&
      preview.issues.length === 0 &&
      preview.affectedRecords === 0 &&
      preview.execution === "synchronous" &&
      preview.dataValidation === "complete" &&
      this.summaryRenewalCandidates.length === 0
    );
  }
  protected override prepareToClose() {
    this.sessionGeneration += 1;
    return true;
  }
  resetModel = (model: RecordModelView) => {
    this.sessionGeneration += 1;
    this.model = model;
    this.preview = null;
    this.pendingOperationId = null;
    this.idempotencyKey = null;
    this.summaryRenewalCandidates = [];
    this.summaryRenewalsApproved = false;
    this.summaryPreviewPending = false;
    this.refreshRequired = false;
    this.refreshFailed = false;
    this.targetMissing = false;
    this.conflicts = [];
    this.forcePreviewBeforeApply = false;
  };
  setCanRenewSummaries = (allowed: boolean) => {
    if (this.canRenewSummaries === allowed) return;
    this.canRenewSummaries = allowed;
    if (!allowed) this.setPreview(null);
  };
  setSummaryRenewalsApproved = (approved: boolean) => {
    if (!this.canRenewSummaries || !this.summaryRenewalCandidates.length || this.isLoading || this.isReadOnly) return;
    if (approved === this.summaryRenewalsApproved) return;
    this.summaryRenewalsApproved = approved;
    this.summaryPreviewPending = true;
    this.draftGeneration += 1;
    this.idempotencyKey = null;
    if (this.preview) this.preview = { ...this.preview, valid: false };
  };
  get summaryRenewal() {
    if (!this.canRenewSummaries || !this.summaryRenewalCandidates.length) return undefined;
    return {
      fieldIds: this.summaryRenewalCandidates.map((candidate) => candidate.fieldId),
      approved: this.summaryRenewalsApproved,
      disabled: this.isLoading || this.isReadOnly,
      onChange: this.setSummaryRenewalsApproved,
    };
  }
  private withSummaryRenewals(change: ConfigurationChange): ConfigurationChange {
    if (!this.canRenewSummaries || !this.summaryRenewalsApproved) return change;
    const existing = new Set(
      change.operations
        .filter((operation) => operation.operation === "publishSummary")
        .map((operation) => operation.fieldId),
    );
    return {
      ...change,
      operations: [
        ...change.operations,
        ...this.summaryRenewalCandidates
          .filter((candidate) => !existing.has(candidate.fieldId))
          .map((candidate) => ({
            operation: "publishSummary" as const,
            fieldId: candidate.fieldId,
            published: true,
            dependencyHash: candidate.dependencyHash,
          })),
      ],
    };
  }
  setPreview = (preview: ConfigurationPreview | null) => {
    this.preview = preview;
    if (!preview) {
      this.draftGeneration += 1;
      this.idempotencyKey = null;
      this.summaryRenewalCandidates = [];
      this.summaryRenewalsApproved = false;
      this.summaryPreviewPending = false;
    } else {
      const candidates = preview.calculations.filter(
        (calculation) =>
          this.model.fields.some((field) => field.id === calculation.fieldId && field.publishedSummary) &&
          preview.issues.some(
            (issue) => issue.code === "summary_approval_required" && issue.fieldId === calculation.fieldId,
          ),
      );
      if (candidates.length || !this.summaryRenewalsApproved) this.summaryRenewalCandidates = candidates;
      this.summaryPreviewPending = false;
    }
  };
  setPendingOperation = (id: string | null) => {
    this.pendingOperationId = id;
  };
  get previewReady() {
    return Boolean(this.preview?.valid && !this.summaryPreviewPending);
  }
  get isReadOnly() {
    return this.pendingOperationId !== null || this.refreshRequired || this.targetMissing || this.conflicts.length > 0;
  }
  markRefreshRequired = () => {
    this.setPreview(null);
    this.refreshRequired = true;
    this.refreshFailed = false;
    this.conflicts = [];
    this.forcePreviewBeforeApply = true;
  };
  private handleConfigurationFailure(result: {
    error: unknown;
    failure?: { issues: Array<{ customCode?: CustomErrorCode }> };
  }) {
    if (result.failure?.issues.some((issue) => issue.customCode === CustomErrorCode.recordSchemaChanged))
      this.markRefreshRequired();
    toastZodErrorTree(result.error);
  }
  resolveConflicts = (choice: "draft" | "latest") => {
    if (choice === "latest") {
      const form = cloneDeep(toJS(this.form));
      const saved = toJS(this.savedState);
      for (const key of this.conflicts)
        (form as Record<string, unknown>)[key] = cloneDeep((saved as Record<string, unknown>)[key]);

      this.form = form;
    }
    this.conflicts = [];
    this.setPreview(null);
  };
  private adoptLatest(latest: RecordModelView) {
    const projected = this.projectLatestModel(latest);
    this.model = latest;
    this.setPreview(null);
    if (!projected) {
      this.targetMissing = true;
      this.refreshRequired = true;
      this.conflicts = [];
      return;
    }
    const merged = rebaseModelChangeDraft(toJS(this.savedState), toJS(this.form), projected);
    this.form = merged.form;
    this.savedState = merged.savedState;
    this.conflicts = merged.conflicts;
    this.targetMissing = false;
    this.refreshRequired = false;
  }
  rebaseDraft = (latest: RecordModelView) => {
    if (latest.revision <= this.model.revision || this.isLoading || this.pendingOperationId) return;
    this.adoptLatest(latest);
  };
  refreshModel = async () => {
    if (!this.isOpen || this.isLoading || this.pendingOperationId) return;
    const session = this.sessionGeneration;
    this.setIsLoading(true);
    runInAction(() => {
      this.refreshFailed = false;
    });
    try {
      const latest = await getRecordModelAction();
      if (session !== this.sessionGeneration || !this.isOpen) return;
      if (latest.revision < this.model.revision) throw new Error("Data model refresh returned an older revision");
      runInAction(() => {
        this.adoptLatest(latest);
        this.onModelRefreshed?.(latest);
      });
    } catch (error) {
      if (session === this.sessionGeneration && this.isOpen) {
        runInAction(() => {
          this.refreshFailed = true;
        });
        reportApplicationError(error);
      }
    } finally {
      if (session === this.sessionGeneration) this.setIsLoading(false);
    }
  };
  operationCompleted = async () => {
    const preview = this.preview;
    this.setPendingOperation(null);
    this.onInitOrRefresh(toJS(this.form));
    this.close();
    const completedSession = this.sessionGeneration;
    await this.refreshNavigation();
    if (preview) await this.completed(preview, () => completedSession === this.sessionGeneration && !this.isOpen);
  };
  operationStopped = () => {
    this.setPendingOperation(null);
    this.idempotencyKey = null;
    this.setPreview(null);
  };
  private refreshNavigation = async () => {
    try {
      await this.rootStore.recordWorkspaceStore.refreshNavigation();
    } catch (error) {
      reportApplicationError(error);
    }
  };
  protected afterChange() {
    this.setPreview(null);
  }
  onSubmit = async () => {
    if (!this.isOpen || this.isLoading || this.pendingOperationId || this.isReadOnly) return;
    const session = this.sessionGeneration;
    const draft = this.draftGeneration;
    const submittedForm = toJS(this.form);
    const isCurrent = () => session === this.sessionGeneration && draft === this.draftGeneration && this.isOpen;
    this.setIsLoading(true);
    try {
      const parsedChange = ConfigurationChangeSchema.safeParse({
        expectedRevision: this.model.revision,
        idempotencyKey: (this.idempotencyKey ??= crypto.randomUUID()),
        operations: toJS(this.operations()),
      });
      if (!parsedChange.success) {
        toastZodErrorTree(z.treeifyError(parsedChange.error));
        return;
      }
      const originalChange = parsedChange.data;
      let change = this.withSummaryRenewals(originalChange);
      let preview = this.summaryPreviewPending ? null : this.preview;
      if (!preview) {
        const result = await previewRecordConfigurationAction(change);
        if (!isCurrent()) return;
        if (!result.ok) {
          this.handleConfigurationFailure(result);
          return;
        }
        preview = result.data;
        const enriched = this.withSummaryRenewals(this.enrichPreviewChange(originalChange, preview));
        if (JSON.stringify(enriched.operations) !== JSON.stringify(change.operations)) {
          change = ConfigurationChangeSchema.parse(enriched);
          const approved = await previewRecordConfigurationAction(change);
          if (!isCurrent()) return;
          if (!approved.ok) {
            this.handleConfigurationFailure(approved);
            return;
          }
          preview = approved.data;
        }
        this.setPreview(preview);
        if (this.forcePreviewBeforeApply) {
          this.forcePreviewBeforeApply = false;
          return;
        }
        if (!preview.valid || !(this.immediateApply || this.needsNoReview(preview))) return;
      }
      if (!preview.valid) return;
      const result = await applyRecordConfigurationAction(change);
      if (!result.ok) {
        if (isCurrent()) this.handleConfigurationFailure(result);
        return;
      }
      if (result.data.status === "pending") {
        if (isCurrent()) this.setPendingOperation(result.data.operationId);
        return;
      }
      let completedSession: number | null = null;
      if (isCurrent()) {
        this.onInitOrRefresh(submittedForm);
        this.close();
        completedSession = this.sessionGeneration;
      }
      await this.refreshNavigation();
      await this.completed(
        preview,
        () => completedSession !== null && completedSession === this.sessionGeneration && !this.isOpen,
      );
    } finally {
      if (session === this.sessionGeneration) this.setIsLoading(false);
    }
  };
}
