import { action, makeObservable, observable, toJS } from "mobx";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";
import { ConfigurationChangeSchema } from "@/features/records/configuration.schema";

import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { applyRecordConfigurationAction, previewRecordConfigurationAction } from "../../../records/actions";

export abstract class ModelChangeStore<Form extends object> extends BaseModalStore<Form> {
  model: RecordModel;
  preview: ConfigurationPreview | null = null;
  pendingOperationId: string | null = null;
  private idempotencyKey: string | null = null;
  constructor(
    root: RootStore,
    initial: Form,
    model: RecordModel,
    private completed: (preview: ConfigurationPreview) => Promise<void>,
  ) {
    super(root, initial, undefined, { register: false });
    this.model = model;
    makeObservable(this, {
      model: observable.ref,
      preview: observable.ref,
      pendingOperationId: observable,
      resetModel: action,
      setPreview: action,
      setPendingOperation: action,
    });
  }
  abstract operations(): ConfigurationChange["operations"];
  protected immediateApply = false;
  resetModel = (model: RecordModel) => {
    this.model = model;
    this.preview = null;
    this.pendingOperationId = null;
    this.idempotencyKey = null;
  };
  setPreview = (preview: ConfigurationPreview | null) => {
    this.preview = preview;
  };
  setPendingOperation = (id: string | null) => {
    this.pendingOperationId = id;
  };
  get isReadOnly() {
    return this.pendingOperationId !== null;
  }
  operationCompleted = async () => {
    const preview = this.preview;
    this.setPendingOperation(null);
    this.onInitOrRefresh(toJS(this.form));
    this.close();
    await this.rootStore.recordWorkspaceStore.refreshNavigation();
    if (preview) await this.completed(preview);
  };
  operationStopped = () => {
    this.setPendingOperation(null);
    this.idempotencyKey = null;
    this.setPreview(null);
  };
  protected afterChange() {
    this.preview = null;
    this.idempotencyKey = null;
  }
  onSubmit = async () => {
    if (this.isLoading || this.pendingOperationId) return;
    this.setIsLoading(true);
    try {
      const change = ConfigurationChangeSchema.parse({
        expectedRevision: this.model.revision,
        idempotencyKey: (this.idempotencyKey ??= crypto.randomUUID()),
        operations: toJS(this.operations()),
      });
      let preview = this.preview;
      if (!preview) {
        const result = await previewRecordConfigurationAction(change);
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }
        preview = result.data;
        this.setPreview(preview);
        if (!this.immediateApply || !preview.valid) return;
      }
      if (!preview.valid) return;
      const result = await applyRecordConfigurationAction(change);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      if (result.data.status === "pending") {
        this.setPendingOperation(result.data.operationId);
        return;
      }
      this.onInitOrRefresh(toJS(this.form));
      this.close();
      await this.rootStore.recordWorkspaceStore.refreshNavigation();
      await this.completed(preview);
    } finally {
      this.setIsLoading(false);
    }
  };
}
