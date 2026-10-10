import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import { cloneDeep, omit } from "lodash";

import type { RootStore } from "@/core/stores/root.store";
import type {
  RecordDto,
  RecordFieldView,
  RecordScalar,
  RecordRef,
  CalculatedValue,
} from "@/features/records/record-model.schema";
import type { RecordEditorContext, RecordEditorResult } from "@/features/records/get-record-editor.interactor";
import type { RecordLinkChange } from "@/features/records/record-query.schema";
import type { RecordChoice } from "@/features/records/get-record-choices.interactor";
import type { RecordIdentityInput } from "@/features/records/record-identity.schema";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { rebaseModelChangeDraft } from "@/app/[locale]/(protected)/configure/components/model-change-rebase";
import { isRecordFieldWritable, recordDraftValue, recordInputValue } from "@/features/records/record-input-value";
import { RecordScalarSchema } from "@/features/records/record-model.schema";
import { mutateRecordAction, getRecordEditorAction } from "../../actions";

export type RecordDraft = {
  id: string | undefined;
  values: Record<string, unknown>;
  assignedUserIds: string[];
  linkChanges: Array<RecordLinkChange & { title: RecordChoice["title"] }>;
  identities: RecordIdentityInput[];
  captureFieldIds: string[];
};
function editableFields(presentation: RecordEditorContext) {
  return presentation.model.fields.filter((field) => field.typeId === presentation.typeId && !field.archived);
}
const STALE_WRITE_CODES: ReadonlySet<string> = new Set([
  CustomErrorCode.recordVersionChanged,
  CustomErrorCode.recordSchemaChanged,
]);
export class RecordEditorStore extends BaseModalStore<RecordDraft> {
  record: RecordDto | null = null;
  presentation: RecordEditorContext;
  parentLink: {
    relationId: string;
    record: RecordRef;
    title: CalculatedValue;
  } | null = null;
  pendingOperationId: string | null = null;
  refreshRequired = false;
  staleChange = false;
  conflicts: string[] = [];
  relatedRevision = 0;
  private requestKey: string | null = null;
  private refreshGeneration = 0;
  private sessionGeneration = 0;
  private readonly instanceKey = crypto.randomUUID();
  private pendingDeletion = false;
  private refreshNotificationPending = false;
  constructor(
    root: RootStore,
    presentation: RecordEditorContext,
    private readonly onSaved: () => Promise<void>,
    private readonly keepOpenOnSave = false,
    private readonly onDeleted?: () => Promise<void>,
  ) {
    super(
      root,
      {
        id: undefined,
        values: {},
        assignedUserIds: [],
        linkChanges: [],
        identities: [],
        captureFieldIds: [],
      },
      undefined,
      {
        register: false,
      },
    );
    this.presentation = presentation;
    makeObservable(this, {
      record: observable.ref,
      presentation: observable.ref,
      pendingOperationId: observable,
      refreshRequired: observable,
      staleChange: observable,
      conflicts: observable.ref,
      relatedRevision: observable,
      parentLink: observable.ref,
      edit: action,
      setPendingOperation: action,
      setRefreshRequired: action,
      markStale: action,
      toggleCapture: action,
      rebase: action,
      restoreDraft: action,
      resolveConflicts: action,
    });
  }
  get sessionKey() {
    return this.sessionGeneration;
  }
  get channelComposeKey() {
    return `${this.instanceKey}:${this.presentation.typeId}:${this.form.id ?? "new"}:${this.sessionKey}`;
  }
  get hasRelatedDraft() {
    const compose = this.rootStore.threadComposeStore;
    return compose?.sourceContextKey === this.channelComposeKey && (compose.hasUnsavedChanges || compose.isLoading);
  }
  captureSession = () => {
    const session = this.sessionGeneration;
    return () => this.isOpen && session === this.sessionGeneration;
  };
  runAfterChannelDraft = (next: () => void) => {
    const compose = this.rootStore.threadComposeStore;
    if (compose?.sourceContextKey !== this.channelComposeKey) {
      next();
      return;
    }
    if (compose.isLoading) return;
    const isCurrentRecord = this.captureSession();
    const isCurrentCompose = compose.captureContext();
    const proceed = () => {
      if (!isCurrentRecord() || !isCurrentCompose() || compose.isLoading) return;
      compose.discardNewThread();
      next();
    };
    if (compose.hasUnsavedChanges) this.rootStore.navigationGuard.tryNavigate(proceed);
    else proceed();
  };
  protected override prepareToClose() {
    this.sessionGeneration += 1;
    this.refreshGeneration += 1;
    return true;
  }
  get isTransactionBusy() {
    return this.isLoading || Boolean(this.pendingOperationId) || this.refreshRequired;
  }
  get isBusy() {
    return this.isTransactionBusy || this.hasRelatedDraft || this.hasUnsavedChanges;
  }
  get isReadOnly() {
    if (this.pendingOperationId || this.refreshRequired || this.conflicts.length || this.hasRelatedDraft) return true;
    return this.record !== null
      ? !this.presentation.permittedActions.includes("update")
      : !this.presentation.permittedActions.includes("create");
  }
  get fields() {
    return editableFields(this.presentation);
  }
  get titleText(): string | null {
    const type = this.presentation.model.types.find((candidate) => candidate.id === this.presentation.typeId);
    const title = this.record?.fields.find((field) => field.fieldId === type?.primaryFieldId)?.result;
    return title?.state === "value" && title.value.kind === "text" ? title.value.value : null;
  }
  edit = (
    presentation: RecordEditorContext,
    record: RecordDto | null,
    parentLink: RecordEditorStore["parentLink"] = null,
    seed: Record<string, RecordScalar> = {},
  ) => {
    this.sessionGeneration += 1;
    this.refreshGeneration += 1;
    this.presentation = presentation;
    this.record = record;
    this.parentLink = parentLink;
    this.pendingOperationId = null;
    this.pendingDeletion = false;
    this.refreshNotificationPending = false;
    this.refreshRequired = false;
    this.staleChange = false;
    this.conflicts = [];
    this.requestKey = null;
    this.onInitOrRefresh(this.draftFor(presentation, record, parentLink, seed));
    this.open();
  };
  private draftFor(
    presentation: RecordEditorContext,
    record: RecordDto | null,
    parentLink: RecordEditorStore["parentLink"],
    seed: Record<string, RecordScalar> = {},
  ): RecordDraft {
    return {
      id: record?.ref.recordId,
      captureFieldIds: [],
      assignedUserIds:
        record?.assignedUserIds ?? (this.rootStore.userStore.user ? [this.rootStore.userStore.user.id] : []),
      identities: (record?.identities ?? []).map(({ provider, value, messagingId, displayName, profileUrl }) => ({
        provider,
        value,
        messagingId,
        displayName,
        profileUrl,
      })),
      linkChanges:
        !record && parentLink
          ? [
              {
                action: "link",
                relationId: parentLink.relationId,
                direction: "outgoing",
                record: parentLink.record,
                title: parentLink.title,
              },
            ]
          : [],
      values: Object.fromEntries(
        editableFields(presentation).map((field) => {
          const result = record?.fields.find((value) => value.fieldId === field.id)?.result;
          return [
            field.id,
            recordDraftValue(
              result?.state === "value"
                ? result.value
                : !record && field.behavior.kind === "input"
                  ? (seed[field.id] ?? field.behavior.defaultValue ?? null)
                  : null,
            ),
          ];
        }),
      ),
    };
  }
  receiveLatest = (latest: RecordEditorResult) => {
    if (
      latest.model.revision < this.presentation.model.revision ||
      (latest.record?.version ?? 0) < (this.record?.version ?? 0)
    )
      return;
    const newer =
      latest.model.revision > this.presentation.model.revision ||
      (latest.record?.version ?? 0) > (this.record?.version ?? 0);
    if (this.hasRelatedDraft) {
      this.setRefreshRequired(true);
      return;
    }
    if (this.hasUnsavedChanges) {
      if (newer) this.markStale();
      return;
    }
    this.edit(latest, latest.record);
  };
  reloadKeepingChanges = async () => {
    if (this.isLoading || this.pendingOperationId) return;
    if (!this.record) {
      await this.reloadCreateContext();
      return;
    }
    if (!this.hasUnsavedChanges) {
      await this.refreshRecord();
      return;
    }
    if (this.hasRelatedDraft) {
      this.setRefreshRequired(true);
      return;
    }
    const generation = ++this.refreshGeneration;
    const ref = toJS(this.record.ref);
    this.setIsLoading(true);
    try {
      const result = await getRecordEditorAction(ref);
      if (
        generation !== this.refreshGeneration ||
        this.record?.ref.typeId !== ref.typeId ||
        this.record?.ref.recordId !== ref.recordId
      )
        return;
      if (!result.ok) {
        this.setError(result.error);
        return;
      }
      if (
        !result.data.record ||
        result.data.model.revision < this.presentation.model.revision ||
        result.data.record.version < this.record.version
      )
        return;
      this.rebase(result.data, result.data.record);
    } finally {
      if (generation === this.refreshGeneration) this.setIsLoading(false);
    }
  };
  private reloadCreateContext = async () => {
    const generation = ++this.refreshGeneration;
    const typeId = this.presentation.typeId;
    this.setIsLoading(true);
    try {
      const result = await getRecordEditorAction({ typeId });
      if (generation !== this.refreshGeneration || this.record || this.presentation.typeId !== typeId) return;
      if (!result.ok) {
        this.setError(result.error);
        return;
      }
      this.rebase(result.data, null);
    } finally {
      if (generation === this.refreshGeneration) this.setIsLoading(false);
    }
  };
  rebase = (presentation: RecordEditorContext, record: RecordDto | null) => {
    const saved = toJS(this.savedState);
    const draft = toJS(this.form);
    const latest = this.draftFor(presentation, record, this.parentLink);
    const values = rebaseModelChangeDraft(saved.values, draft.values, latest.values);
    const rest = rebaseModelChangeDraft(omit(saved, "values"), omit(draft, "values"), omit(latest, "values"));
    this.presentation = presentation;
    this.record = record;
    this.form = { ...rest.form, values: values.form };
    this.savedState = { ...rest.savedState, values: values.savedState };
    this.conflicts = [...values.conflicts, ...rest.conflicts];
    this.error = undefined;
    this.requestKey = null;
    this.refreshRequired = false;
    this.staleChange = false;
    this.relatedRevision += 1;
  };
  restoreDraft = (
    draft: { presentation: RecordEditorContext; record: RecordDto; savedState: RecordDraft; form: RecordDraft },
    latest: RecordEditorContext,
    latestRecord: RecordDto,
  ) => {
    this.presentation = draft.presentation;
    this.record = draft.record;
    this.savedState = cloneDeep(draft.savedState);
    this.form = cloneDeep(draft.form);
    this.rebase(latest, latestRecord);
  };
  resolveConflicts = (choice: "draft" | "latest") => {
    if (choice === "latest") {
      const saved = toJS(this.savedState);
      const form = toJS(this.form);
      for (const key of this.conflicts) {
        if (key in saved.values) form.values[key] = saved.values[key];
        else if (key in saved) (form as Record<string, unknown>)[key] = (saved as Record<string, unknown>)[key];
      }
      this.form = form;
    }
    this.conflicts = [];
    this.requestKey = null;
  };
  reloadAfterNestedChange = async () => {
    if (!this.record || this.hasUnsavedChanges) return;
    this.refreshNotificationPending = true;
    this.setRefreshRequired(true);
    await this.refreshRecord();
  };
  setPendingOperation = (id: string | null, deletion = false) => {
    this.pendingOperationId = id;
    this.pendingDeletion = deletion;
  };
  setRefreshRequired = (required: boolean) => {
    this.refreshRequired = required;
  };
  markStale = () => {
    this.staleChange = true;
    this.refreshRequired = true;
  };
  refreshRecord = async () => {
    if (!this.record || this.hasUnsavedChanges) return;
    if (this.hasRelatedDraft) {
      this.setRefreshRequired(true);
      return;
    }
    const generation = ++this.refreshGeneration;
    const ref = toJS(this.record.ref);
    const result = await getRecordEditorAction(ref);
    if (
      generation !== this.refreshGeneration ||
      this.record?.ref.typeId !== ref.typeId ||
      this.record?.ref.recordId !== ref.recordId ||
      this.hasUnsavedChanges
    )
      return;
    if (this.hasRelatedDraft) {
      this.setRefreshRequired(true);
      return;
    }
    if (result.ok) {
      if (
        result.data.model.revision < this.presentation.model.revision ||
        (result.data.record?.version ?? 0) < (this.record?.version ?? 0)
      )
        return;
      const notify = this.refreshNotificationPending;
      this.edit(result.data, result.data.record, this.parentLink);
      runInAction(() => {
        this.relatedRevision += 1;
      });
      if (notify) await this.onSaved();
    } else this.setError(result.error);
  };
  operationCompleted = async () => {
    const deletion = this.pendingDeletion;
    this.setPendingOperation(null);
    if (deletion) {
      await this.deletionCompleted();
      return;
    }
    this.onInitOrRefresh(toJS(this.form));
    this.requestKey = null;
    if (this.keepOpenOnSave && this.record) {
      this.refreshNotificationPending = true;
      this.setRefreshRequired(true);
      await this.refreshRecord();
    } else {
      this.close();
      await this.onSaved();
    }
  };
  deletionCompleted = async () => {
    this.resetForm();
    this.close();
    await (this.onDeleted ?? this.onSaved)();
  };
  operationStopped = () => {
    this.setPendingOperation(null);
    this.requestKey = null;
  };
  protected afterChange() {
    this.requestKey = null;
  }
  toggleCapture = (fieldId: string) => {
    const field = this.fields.find((field) => field.id === fieldId);
    if (!this.record || this.isDisabled || field?.behavior.kind !== "snapshot" || field.behavior.capture !== "explicit")
      return;
    const current = this.form.captureFieldIds;
    this.onChange(
      "captureFieldIds",
      current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId],
    );
  };
  stageLink = (change: RecordLinkChange, title: RecordChoice["title"]) => {
    const current = this.form.linkChanges;
    const existing = current.find(
      (entry) =>
        entry.relationId === change.relationId &&
        entry.direction === change.direction &&
        entry.record.typeId === change.record.typeId &&
        entry.record.recordId === change.record.recordId,
    );
    if (existing?.action === change.action) return;
    this.onChange(
      "linkChanges",
      existing ? current.filter((entry) => entry !== existing) : [...current, { ...change, title }],
    );
  };
  private scalar(field: RecordFieldView): RecordScalar | null {
    return recordInputValue(toJS(this.form.values[field.id]), field);
  }
  previewValue = (field: RecordFieldView): CalculatedValue => {
    const stored = this.record?.fields.find((value) => value.fieldId === field.id)?.result;
    if (stored?.state === "restricted") return stored;
    if (!isRecordFieldWritable(field)) return stored ?? { state: "missing" };

    const value = this.scalar(field);
    if (value === null) return { state: "missing" };
    const parsed = RecordScalarSchema.safeParse(value);
    return parsed.success ? { state: "value", value: parsed.data } : { state: "error", code: "type_mismatch" };
  };
  onSubmit = async () => {
    if (!this.isOpen || this.isReadOnly || this.isLoading || this.pendingOperationId) return;
    const missing = this.fields.filter((field) => {
      if (!field.required || field.behavior.kind !== "input" || this.record?.protectedKind) return false;
      if (this.record?.fields.find((value) => value.fieldId === field.id)?.result.state === "restricted") return false;
      if (
        this.record &&
        JSON.stringify(this.form.values[field.id]) === JSON.stringify(this.savedState.values[field.id])
      )
        return false;
      const value = this.scalar(field);
      return value === null || (value.kind === "text" && !value.value.trim());
    });
    if (missing.length) {
      const required = this.rootStore.localeStore.getTranslation("RecordModel.required");
      this.setError({
        errors: [],
        properties: {
          values: {
            errors: [],
            properties: Object.fromEntries(missing.map((field) => [field.id, { errors: [required] }])),
          },
        },
      } as Parameters<typeof this.setError>[0]);
      return;
    }
    const session = this.sessionGeneration;
    const isCurrent = () => session === this.sessionGeneration && this.isOpen;
    this.setIsLoading(true);
    try {
      const fields = this.fields
        .filter(
          (field) =>
            isRecordFieldWritable(field) &&
            !this.form.captureFieldIds.includes(field.id) &&
            (field.behavior.kind !== "snapshot" || this.form.values[field.id] !== undefined) &&
            (!this.record ||
              JSON.stringify(this.form.values[field.id]) !== JSON.stringify(this.savedState.values[field.id])),
        )
        .map((field) => ({ fieldId: field.id, value: this.scalar(field) }));
      const identities =
        this.presentation.model.capabilities.some(
          (binding) =>
            binding.kind === "channels" && binding.enabled !== false && binding.typeId === this.presentation.typeId,
        ) &&
        (!this.record || JSON.stringify(this.form.identities) !== JSON.stringify(this.savedState.identities))
          ? { identities: toJS(this.form.identities) }
          : {};
      const result = await mutateRecordAction({
        expectedRevision: this.presentation.model.revision,
        idempotencyKey: (this.requestKey ??= crypto.randomUUID()),
        mutation: this.record
          ? {
              action: "update",
              ref: toJS(this.record.ref),
              expectedVersion: this.record.version,
              fields,
              ...identities,
              ...(this.form.captureFieldIds.length ? { captureFieldIds: toJS(this.form.captureFieldIds) } : {}),
              linkChanges: toJS(this.form.linkChanges).map(({ action, relationId, direction, record }) => ({
                action,
                relationId,
                direction,
                record,
              })),
              ...(JSON.stringify(this.form.assignedUserIds) !== JSON.stringify(this.savedState.assignedUserIds)
                ? { assignedUserIds: toJS(this.form.assignedUserIds) }
                : {}),
            }
          : {
              action: "create",
              typeId: this.presentation.typeId,
              fields,
              ...identities,
              ...(!this.presentation.model.types.find((type) => type.id === this.presentation.typeId)?.embedded
                ? { assignedUserIds: toJS(this.form.assignedUserIds) }
                : {}),
              links: toJS(this.form.linkChanges)
                .filter((change) => change.action === "link")
                .map(({ relationId, direction, record }) => ({
                  relationId,
                  direction,
                  record,
                })),
            },
      });
      if (!result.ok) {
        if (!isCurrent()) return;
        if (result.failure?.issues.some((issue) => issue.customCode && STALE_WRITE_CODES.has(issue.customCode)))
          this.markStale();
        this.setError(result.error);
        return;
      }
      if (result.data.status === "pending") {
        if (isCurrent()) this.setPendingOperation(result.data.operationId);
        return;
      }
      if (isCurrent()) await this.operationCompleted();
      else await this.onSaved();
    } finally {
      if (session === this.sessionGeneration) this.setIsLoading(false);
    }
  };
}
