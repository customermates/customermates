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
import { filterScalar } from "@/features/records/record-presentation";
import { RecordScalarSchema } from "@/features/records/record-model.schema";
import { mutateRecordAction, getRecordEditorAction } from "../../actions";

export type RecordDraft = {
  id: string | undefined;
  values: Record<string, unknown>;
  assignedUserIds: string[];
  linkChanges: Array<RecordLinkChange & { title: RecordChoice["title"] }>;
  identities: RecordIdentityInput[];
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
  parentLink: { relationId: string; record: RecordRef; title: CalculatedValue } | null = null;
  pendingOperationId: string | null = null;
  refreshRequired = false;
  relatedRevision = 0;
  private requestKey: string | null = null;
  private pendingDeletion = false;
  constructor(
    root: RootStore,
    presentation: RecordEditorContext,
    private readonly onSaved: () => Promise<void>,
    private readonly keepOpenOnSave = false,
    private readonly onDeleted?: () => Promise<void>,
  ) {
    super(root, { id: undefined, values: {}, assignedUserIds: [], linkChanges: [], identities: [] }, undefined, {
      register: false,
    });
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
    });
  }
  get isReadOnly() {
    if (this.pendingOperationId || this.refreshRequired) return true;
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
    this.presentation = presentation;
    this.record = record;
    this.parentLink = parentLink;
    this.pendingOperationId = null;
    this.pendingDeletion = false;
    this.refreshRequired = false;
    this.requestKey = null;
    this.onInitOrRefresh({
      id: record?.ref.recordId,
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
    const ref = { typeId: this.record.ref.typeId, recordId: this.record.ref.recordId };
    const result = await getRecordEditorAction(ref);
    if (!result.ok) {
      this.setError(result.error);
      return;
    }
    if (this.hasUnsavedChanges || this.record?.ref.typeId !== ref.typeId || this.record.ref.recordId !== ref.recordId)
      return;
    this.edit(result.data, result.data.record, this.parentLink);
    runInAction(() => {
      this.relatedRevision += 1;
    });
    await this.onSaved();
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
    const ref = toJS(this.record.ref);
    const result = await getRecordEditorAction(ref);
    if (this.record?.ref.typeId !== ref.typeId || this.record?.ref.recordId !== ref.recordId || this.hasUnsavedChanges)
      return;
    if (result.ok) this.edit(result.data, result.data.record, this.parentLink);
    else this.setError(result.error);
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
      this.setRefreshRequired(true);
      await this.refreshRecord();
    } else this.close();
    await this.onSaved();
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
    const raw = this.form.values[field.id];
    if (raw === undefined || raw === null || raw === "") return null;
    if (field.valueType === "richText") return { kind: "richText", documentJson: JSON.stringify(toJS(raw)) };
    if (field.valueType === "boolean") return { kind: "boolean", value: Boolean(raw) };
    if (field.multiple) return { kind: "textList", value: String(raw).split("\n") };
    if (field.valueType === "dateRange" || field.valueType === "dateTimeRange") {
      const [start, end] = String(raw).split(",");
      return { kind: "range", start: start || null, end: end || null };
    }
    return filterScalar(String(raw), field, this.rootStore.companyStore.company?.currency ?? "EUR");
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
    if (this.isReadOnly || this.isLoading || this.pendingOperationId) return;
    this.setIsLoading(true);
    try {
      const fields = this.fields
        .filter(
          (field) =>
            (field.behavior.kind === "input" ||
              (field.behavior.kind === "snapshot" && field.behavior.allowManualOverride)) &&
            (field.behavior.kind !== "snapshot" || this.form.values[field.id] !== undefined) &&
            (!this.record ||
              JSON.stringify(this.form.values[field.id]) !== JSON.stringify(this.savedState.values[field.id])),
        )
        .map((field) => ({ fieldId: field.id, value: this.scalar(field) }));
      const identities =
        this.presentation.model.capabilities.some(
          (binding) => binding.kind === "personIdentity" && binding.typeId === this.presentation.typeId,
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
                .map(({ relationId, direction, record }) => ({ relationId, direction, record })),
            },
      });
      if (!result.ok) {
        this.setError(result.error);
        return;
      }
      if (result.data.status === "pending") {
        this.setPendingOperation(result.data.operationId);
        return;
      }
      await this.operationCompleted();
    } finally {
      this.setIsLoading(false);
    }
  };
}
