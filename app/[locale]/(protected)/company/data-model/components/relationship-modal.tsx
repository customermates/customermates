"use client";

import { action, makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { Save } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordModel, RecordRelationship } from "@/features/records/record-model.schema";
import type { RecordRelationshipPath, RecordPathStep } from "@/features/records/record-relationship-path.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";

import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { ModelChangeStore } from "./model-change.store";
import { RelationshipPathInput } from "@/components/records/relationship-path-input";
import { recordInvariant } from "@/features/records/record-invariant";

const empty = () => ({
  mode: "direct" as "direct" | "path",
  path: [] as RecordPathStep[],
  id: undefined as string | undefined,
  targetTypeId: "",
  sourceLabel: "",
  targetLabel: "",
  sourceCardinality: "many" as "one" | "many",
  targetCardinality: "many" as "one" | "many",
  onSourceDelete: "unlink" as "unlink" | "restrict" | "cascade",
  onTargetDelete: "unlink" as "unlink" | "restrict" | "cascade",
  archived: false,
});
export class RelationshipModalStore extends ModelChangeStore<ReturnType<typeof empty>> {
  sourceTypeId = "";
  constructor(root: RootStore, model: RecordModel, completed: (preview: ConfigurationPreview) => Promise<void>) {
    super(root, empty(), model, completed);
    makeObservable(this, { sourceTypeId: observable, edit: action, editPath: action });
  }
  edit = (model: RecordModel, typeId: string, relationship?: RecordRelationship) => {
    this.resetModel(model);
    this.sourceTypeId = relationship?.sourceTypeId ?? typeId;
    this.onInitOrRefresh(relationship ? { ...empty(), ...relationship } : empty());
    this.open();
  };
  editPath = (model: RecordModel, typeId: string, path: RecordRelationshipPath) => {
    this.resetModel(model);
    this.sourceTypeId = typeId;
    this.onInitOrRefresh({
      ...empty(),
      mode: "path",
      id: path.id,
      sourceLabel: path.label,
      path: path.path,
      archived: path.archived,
    });
    this.open();
  };
  operations(): ConfigurationChange["operations"] {
    const { mode, path, ...relationship } = this.form;
    if (mode === "path") {
      const type = recordInvariant(this.model.types.find((type) => type.id === this.sourceTypeId));
      const definition = {
        id: this.form.id ?? "$relationshipPath",
        label: this.form.sourceLabel,
        path,
        archived: this.form.archived,
      };
      return [
        {
          operation: "putType",
          type: {
            ...type,
            relationshipPaths: [
              ...(type.relationshipPaths ?? []).filter((path) => path.id !== definition.id),
              definition,
            ],
          },
        },
      ];
    }
    return [
      {
        operation: "putRelationship",
        relationship: {
          ...relationship,
          id: this.form.id ?? "$relationship",
          sourceTypeId: this.sourceTypeId,
        },
      },
    ];
  }
}
export const RelationshipModal = observer(function RelationshipModal({ store }: { store: RelationshipModalStore }) {
  const t = useTranslations();
  return (
    <AppModal
      actions={[
        {
          id: "save-relationship",
          icon: Save,
          label: store.preview?.valid ? t("RecordModel.apply") : t("RecordModel.preview"),
          onClick: store.onSubmit,
          busy: store.isLoading,
          disabled: Boolean(store.pendingOperationId),
        },
      ]}
      store={store}
      title={t("RecordModel.relationship")}
    >
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-lg font-semibold">{t("RecordModel.relationship")}</h2>
          </AppCardHeader>

          <AppCardBody>
            {store.pendingOperationId && (
              <RecordOperationProgress
                operationId={store.pendingOperationId}
                onCompleted={store.operationCompleted}
                onStopped={store.operationStopped}
              />
            )}

            <div className="space-y-4">
              <FormSelect
                disabled={Boolean(store.form.id)}
                id="mode"
                items={[
                  { value: "direct", label: t("RecordModel.directRelationship") },
                  { value: "path", label: t("RecordModel.relationshipPath") },
                ]}
                label={t("RecordModel.connectionType")}
              />

              {store.form.mode === "path" ? (
                <>
                  <p className="text-sm text-muted-foreground">{t("RecordModel.relationshipPathHelp")}</p>

                  <FormInput required id="sourceLabel" label={t("RecordModel.name")} />

                  <RelationshipPathInput
                    disabled={store.isLoading || Boolean(store.pendingOperationId)}
                    model={store.model}
                    typeId={store.sourceTypeId}
                    value={store.form.path}
                    onChange={(path) => store.onChange("path", path)}
                  />

                  {store.form.id && <FormSwitch id="archived" label={t("RecordModel.archiveRelationshipPath")} />}
                </>
              ) : (
                <>
                  <FormSelect
                    id="targetTypeId"
                    items={store.model.types
                      .filter((type) => !type.archived)
                      .map((type) => ({ value: type.id, label: type.pluralLabel }))}
                    label={t("RecordModel.linkedType")}
                  />

                  <FormInput required id="sourceLabel" label={t("RecordModel.relationshipLabel")} />

                  <FormInput required id="targetLabel" label={t("RecordModel.oppositeLabel")} />

                  <FormSelect
                    id="sourceCardinality"
                    items={[
                      { value: "one", label: t("RecordModel.one") },
                      { value: "many", label: t("RecordModel.many") },
                    ]}
                    label={t("RecordModel.linkedCount")}
                  />

                  <FormSelect
                    id="targetCardinality"
                    items={[
                      { value: "one", label: t("RecordModel.one") },
                      { value: "many", label: t("RecordModel.many") },
                    ]}
                    label={t("RecordModel.oppositeCount")}
                  />

                  <FormSelect
                    id="onSourceDelete"
                    items={["unlink", "restrict", "cascade"].map((value) => ({
                      value,
                      label: t(`RecordModel.deletion.${value}`),
                    }))}
                    label={t("RecordModel.onSourceDelete")}
                  />

                  <FormSelect
                    id="onTargetDelete"
                    items={["unlink", "restrict", "cascade"].map((value) => ({
                      value,
                      label: t(`RecordModel.deletion.${value}`),
                    }))}
                    label={t("RecordModel.onTargetDelete")}
                  />

                  {store.form.id && <FormSwitch id="archived" label={t("RecordModel.archiveRelationship")} />}
                </>
              )}

              {store.preview && <RecordConfigurationPreview model={store.model} preview={store.preview} />}
            </div>
          </AppCardBody>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
