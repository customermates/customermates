"use client";

import { action, makeObservable, observable, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSwitch } from "@/components/forms/form-switch";
import { RelationshipPathInput } from "@/components/records/relationship-path-input";
import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { ModelChangeStore } from "./model-change.store";
import { ModelChangeRecovery } from "./model-change-recovery";

type ActivityPath = RecordModel["activityPaths"][number];
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
    model: RecordModel,
    completed: (preview: ConfigurationPreview) => Promise<void>,
    canRenewSummaries = false,
    onModelRefreshed?: (model: RecordModel) => void,
  ) {
    super(root, empty(), model, completed, canRenewSummaries, onModelRefreshed);
    makeObservable(this, { typeId: observable, edit: action });
  }
  edit = (model: RecordModel, typeId: string, definition?: ActivityPath) => {
    this.resetModel(model);
    this.typeId = typeId;
    this.onInitOrRefresh(definition ? { ...empty(), ...definition } : empty());
    this.open();
  };
  protected projectLatestModel(model: RecordModel) {
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
    <AppModal
      actions={[
        {
          id: "save-activity-path",
          icon: Save,
          label: store.previewReady ? t("RecordModel.apply") : t("RecordModel.preview"),
          onClick: store.onSubmit,
          busy: store.isLoading,
          disabled: store.isReadOnly,
        },
      ]}
      size="lg"
      store={store}
      title={t("RecordModel.activityConnections")}
    >
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-base font-semibold">{t("RecordModel.activityConnections")}</h2>
          </AppCardHeader>

          <AppCardBody>
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
          </AppCardBody>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
