import { action, makeObservable, observable, runInAction, toJS } from "mobx";

import type { RootStore } from "@/core/stores/root.store";
import type {
  RecordDto,
  RecordField,
  RecordScalar,
  RecordRef,
  CalculatedValue,
} from "@/features/records/record-model.schema";
import type { RecordEditorContext } from "@/features/records/get-record-editor.interactor";
import type { RecordLinkChange } from "@/features/records/record-query.schema";
import type { RecordChoice } from "@/features/records/get-record-choices.interactor";
import type { RecordIdentityInput } from "@/features/records/record-identity.schema";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { recordInputValue } from "@/features/records/record-input-value";
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
function scalarDraft(value: RecordScalar | null): unknown {
  if (!value) return undefined;
  if (value.kind === "richText") return JSON.parse(value.documentJson);
  if (value.kind === "range") return `${value.start ?? ""},${value.end ?? ""}`;
  if (value.kind === "textList") return value.value.join("\n");
  return value.value;
}
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
      relatedRevision: observable,
      parentLink: observable.ref,
      edit: action,
      setPendingOperation: action,
      setRefreshRequired: action,
      toggleCapture: action,
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
  get isReadOnly() {
    if (this.pendingOperationId || this.refreshRequired || this.hasRelatedDraft) return true;
    return this.record !== null
      ? !this.presentation.permittedActions.includes("update")
      : !this.presentation.permittedActions.includes("create");
  }
  get fields() {
    return this.presentation.model.fields.filter(
      (field) => field.typeId === this.presentation.typeId && !field.archived,
    );
  }
  edit = (
    presentation: RecordEditorContext,
    record: RecordDto | null,
    parentLink: RecordEditorStore["parentLink"] = null,
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
    this.requestKey = null;
    this.onInitOrRefresh({
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
        this.fields.map((field) => {
          const result = record?.fields.find((value) => value.fieldId === field.id)?.result;
          return [
            field.id,
            scalarDraft(
              result?.state === "value"
                ? result.value
                : !record && field.behavior.kind === "input"
                  ? (field.behavior.defaultValue ?? null)
                  : null,
            ),
          ];
        }),
      ),
    });
    this.open();
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
  private scalar(field: RecordField): RecordScalar | null {
    return recordInputValue(
      toJS(this.form.values[field.id]),
      field,
      this.rootStore.companyStore.company?.currency ?? "EUR",
    );
  }
  previewValue = (field: RecordField): CalculatedValue => {
    if (field.behavior.kind !== "input" && !(field.behavior.kind === "snapshot" && field.behavior.allowManualOverride))
      return this.record?.fields.find((value) => value.fieldId === field.id)?.result ?? { state: "missing" };

    const value = this.scalar(field);
    if (value === null) return { state: "missing" };
    const parsed = RecordScalarSchema.safeParse(value);
    return parsed.success ? { state: "value", value: parsed.data } : { state: "error", code: "type_mismatch" };
  };
  onSubmit = async () => {
    if (!this.isOpen || this.isReadOnly || this.isLoading || this.pendingOperationId) return;
    const session = this.sessionGeneration;
    const isCurrent = () => session === this.sessionGeneration && this.isOpen;
    this.setIsLoading(true);
    try {
      const fields = this.fields
        .filter(
          (field) =>
            (field.behavior.kind === "input" ||
              (field.behavior.kind === "snapshot" && field.behavior.allowManualOverride)) &&
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
        if (isCurrent()) this.setError(result.error);
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
