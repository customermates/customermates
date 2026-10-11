"use client";

import { action, makeObservable, observable, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordModelView, RecordType } from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";

import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { ModelChangeStore } from "./model-change.store";
import { ModelChangeRecovery } from "./model-change-recovery";
import { FormRecordTypeIcon } from "@/components/records/form-record-type-icon";
import { configureFieldOrder, moveConfigureField, reorderFieldOperations, typeDefinition } from "./configure-model";
import { ModelChangeSheet } from "./model-change-sheet";
import { suggestListPlural } from "./list-plural";
import { SublistSentence } from "./sublist-sentence";

const initialType = () => ({
  name: "",
  pluralName: "",
  description: "",
  icon: "folder",
  accessPresetId: "private",
  navigationVisible: true,
  fieldOrder: [] as string[],
});
export class TypeModalStore extends ModelChangeStore<ReturnType<typeof initialType>> {
  original: RecordType | null = null;
  parentTypeId: string | null = null;
  constructor(
    root: RootStore,
    model: RecordModelView,
    completed: (preview: ConfigurationPreview, isCurrentSession?: () => boolean) => Promise<void>,
    canRenewSummaries = false,
    onModelRefreshed?: (model: RecordModelView) => void,
  ) {
    super(root, initialType(), model, completed, canRenewSummaries, onModelRefreshed);
    makeObservable(this, {
      original: observable.ref,
      parentTypeId: observable,
      editSublist: action,
      renameList: action,
      edit: action,
      moveField: action,
    });
  }
  edit = (model: RecordModelView, type: RecordType | null) => {
    this.resetModel(model);
    this.original = type;
    this.parentTypeId = null;
    this.immediateApply = !type;
    this.onInitOrRefresh(
      type
        ? {
            ...initialType(),
            name: type.label,
            pluralName: type.pluralLabel,
            description: type.description,
            icon: type.icon,
            navigationVisible: type.navigationVisible,
            fieldOrder: configureFieldOrder(model, type.id),
          }
        : initialType(),
    );
    this.open();
  };
  editSublist = (model: RecordModelView, parentTypeId: string) => {
    this.edit(model, null);
    this.parentTypeId = parentTypeId;
  };
  get parentType() {
    return this.model.types.find((type) => type.id === this.parentTypeId);
  }
  protected projectLatestModel(model: RecordModelView) {
    if (!this.original) return toJS(this.savedState);
    const latest = model.types.find((type) => type.id === this.original?.id);
    if (!latest) return null;
    const projected = new TypeModalStore(this.rootStore, model, async () => {});
    projected.edit(model, latest);
    this.original = latest;
    return toJS(projected.form);
  }
  private suggestPlural(name: string) {
    return suggestListPlural(name, this.rootStore.localeStore.locale);
  }
  renameList = (name: string) => {
    const plural = this.form.pluralName.trim();
    const following = !plural || plural === this.suggestPlural(this.form.name);
    this.onChange("name", name);
    if (following) this.onChange("pluralName", this.suggestPlural(name));
  };
  moveField = (activeId: string, overId: string) => {
    this.onChange("fieldOrder", moveConfigureField(this.form.fieldOrder, activeId, overId));
  };
  operations(): ConfigurationChange["operations"] {
    if (this.original) {
      return [
        {
          operation: "putType",
          type: {
            ...typeDefinition(this.original),
            label: this.form.name,
            pluralLabel: this.form.pluralName.trim() || this.suggestPlural(this.form.name),
            description: this.form.description,
            icon: this.form.icon,
            navigationVisible: this.form.navigationVisible,
          },
        },
        ...reorderFieldOperations(this.model, this.original.id, this.form.fieldOrder),
      ];
    }
    const pluralLabel = this.form.pluralName.trim() || this.suggestPlural(this.form.name);
    const parent = this.parentType;
    if (parent) {
      return [
        {
          operation: "createType",
          reference: "$type",
          label: this.form.name,
          pluralLabel,
          description: this.form.description,
          icon: this.form.icon,
          embedded: true,
          navigationVisible: false,
          accessPresetId: null,
        },
        {
          operation: "putRelationship",
          relationship: {
            id: "$parentRelationship",
            sourceTypeId: "$type",
            targetTypeId: parent.id,
            sourceLabel: parent.label,
            targetLabel: pluralLabel,
            sourceCardinality: "one",
            targetCardinality: "many",
            onSourceDelete: "unlink",
            onTargetDelete: "cascade",
            messagesOnSource: false,
            messagesOnTarget: false,
            archived: false,
          },
        },
        {
          operation: "putType",
          type: {
            id: "$type",
            label: this.form.name,
            pluralLabel,
            description: this.form.description,
            icon: this.form.icon,
            primaryFieldId: "$type.name",
            parentRelationshipId: "$parentRelationship",
            embedded: true,
            navigationVisible: false,
            archived: false,
            position: Math.max(-1, ...this.model.types.map((type) => type.position)) + 1,
          },
        },
      ];
    }
    return [
      {
        operation: "createType",
        reference: "$type",
        label: this.form.name,
        pluralLabel: this.form.pluralName.trim() || this.suggestPlural(this.form.name),
        description: this.form.description,
        icon: this.form.icon,
        embedded: false,
        accessPresetId: this.form.accessPresetId === "private" ? null : this.form.accessPresetId,
      },
    ];
  }
}
export const TypeSettingsFields = observer(function TypeSettingsFields({
  store,
  idPrefix,
}: {
  store: TypeModalStore;
  idPrefix?: string;
}) {
  const t = useTranslations();
  const inputId = (id: string) => (idPrefix ? `${idPrefix}-${id}` : undefined);
  return (
    <>
      <div className="space-y-3">
        <FormInput
          required
          id="name"
          inputId={inputId("name")}
          label={t("RecordModel.name")}
          onValueChange={store.renameList}
        />

        <FormInput
          containerClassName="sm:max-w-xs"
          description={t("RecordModel.pluralDescription")}
          id="pluralName"
          inputId={inputId("pluralName")}
          label={t("RecordModel.pluralName")}
        />
      </div>

      <FormTextarea id="description" inputId={inputId("description")} label={t("RecordModel.description")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormRecordTypeIcon id="icon" inputId={inputId("icon")} label={t("RecordModel.icon")} />

        {!store.original && !store.parentTypeId && (
          <FormSelect
            description={t("RecordModel.accessDescription")}
            id="accessPresetId"
            inputId={inputId("accessPresetId")}
            items={[
              { value: "private", label: t("RecordModel.privateAccess") },
              ...store.model.accessPresets
                .filter((preset) => !preset.archived)
                .map((preset) => ({ value: preset.id, label: preset.label })),
            ]}
            label={t("RecordModel.access")}
          />
        )}
      </div>

      {store.original && !store.original.embedded && (
        <FormSwitch
          id="navigationVisible"
          inputId={inputId("navigationVisible")}
          label={t("RecordModel.showInNavigation")}
        />
      )}
    </>
  );
});

export const TypeModal = observer(function TypeModal({ store }: { store: TypeModalStore }) {
  const t = useTranslations();
  const title = !store.original
    ? store.parentType
      ? t("RecordModel.createSublist", { list: store.parentType.pluralLabel })
      : t("RecordModel.createList")
    : t("RecordModel.typeSettings");
  return (
    <ModelChangeSheet creating={!store.original} store={store} title={title}>
      <AppForm store={store}>
        <div className="space-y-4">
          <ModelChangeRecovery store={store} />

          {store.pendingOperationId && (
            <RecordOperationProgress
              operationId={store.pendingOperationId}
              onCompleted={store.operationCompleted}
              onStopped={store.operationStopped}
            />
          )}

          {store.parentType && (
            <p className="text-sm text-muted-foreground" data-configure-sublist-explanation="">
              <SublistSentence parent={store.parentType} onNavigate={store.close} />
            </p>
          )}

          <TypeSettingsFields store={store} />

          {store.preview && (
            <RecordConfigurationPreview model={store.model} preview={store.preview} renewal={store.summaryRenewal} />
          )}
        </div>
      </AppForm>
    </ModelChangeSheet>
  );
});
