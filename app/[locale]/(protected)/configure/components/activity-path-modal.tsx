"use client";

import { action, makeObservable, observable, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSwitch } from "@/components/forms/form-switch";
import { RelationshipPathInput } from "@/components/records/relationship-path-input";
import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { ModelChangeStore } from "./model-change.store";
import { ModelChangeRecovery } from "./model-change-recovery";
import { ModelChangeSheet } from "./model-change-sheet";

type ActivityPath = RecordModelView["activityPaths"][number];
const empty = () => ({
  id: undefined as string | undefined,
  label: "",
  path: [] as ActivityPath["path"],
  includeMessages: true,
  includeAudit: true,
  archived: false,
});
export class ActivityPathModalStore extends ModelChangeStore<ReturnType<typeof empty>> {
  typeId = "";
  constructor(
    root: RootStore,
    model: RecordModelView,
    completed: (preview: ConfigurationPreview) => Promise<void>,
    canRenewSummaries = false,
    onModelRefreshed?: (model: RecordModelView) => void,
  ) {
    super(root, empty(), model, completed, canRenewSummaries, onModelRefreshed);
    makeObservable(this, { typeId: observable, edit: action });
  }
  edit = (model: RecordModelView, typeId: string, definition?: ActivityPath) => {
    this.resetModel(model);
    this.typeId = typeId;
    this.onInitOrRefresh(definition ? { ...empty(), ...definition } : empty());
    this.open();
  };
  protected projectLatestModel(model: RecordModelView) {
    if (!model.types.some((type) => type.id === this.typeId)) return null;
    if (!this.form.id) return toJS(this.savedState);
    const latest = model.activityPaths.find((path) => path.id === this.form.id);
    if (!latest) return null;
    const projected = new ActivityPathModalStore(this.rootStore, model, async () => {});
    projected.edit(model, latest.typeId, latest);
    this.typeId = latest.typeId;
    return toJS(projected.form);
  }
  operations(): ConfigurationChange["operations"] {
    return [
      {
        operation: "putActivityPath",
        activityPath: { ...this.form, id: this.form.id ?? "$activityPath", typeId: this.typeId },
      },
    ];
  }
}
export const ActivityPathModal = observer(function ActivityPathModal({ store }: { store: ActivityPathModalStore }) {
  const t = useTranslations();
  return (
    <ModelChangeSheet store={store} title={t("RecordModel.activityConnections")}>
      <AppForm store={store}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("RecordModel.activityConnectionsHelp")}</p>

          <ModelChangeRecovery store={store} />

          {store.pendingOperationId && (
            <RecordOperationProgress
              operationId={store.pendingOperationId}
              onCompleted={store.operationCompleted}
              onStopped={store.operationStopped}
            />
          )}

          <FormInput required id="label" label={t("RecordModel.name")} />

          <RelationshipPathInput
            disabled={store.isDisabled}
            model={store.model}
            typeId={store.typeId}
            value={store.form.path}
            onChange={(path) => store.onChange("path", path)}
          />

          <FormSwitch id="includeMessages" label={t("RecordModel.includeMessages")} />

          <FormSwitch id="includeAudit" label={t("RecordModel.includeAudit")} />

          {store.form.id && <FormSwitch id="archived" label={t("RecordModel.archiveActivityPath")} />}

          {store.preview && (
            <RecordConfigurationPreview model={store.model} preview={store.preview} renewal={store.summaryRenewal} />
          )}
        </div>
      </AppForm>
    </ModelChangeSheet>
  );
});
