"use client";

import { action, makeObservable, observable, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordModelView, RecordRelationship } from "@/features/records/record-model.schema";
import type { RecordRelationshipPath, RecordPathStep } from "@/features/records/record-relationship-path.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";

import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { ModelChangeStore } from "./model-change.store";
import { ModelChangeRecovery } from "./model-change-recovery";
import { ModelChangeSheet } from "./model-change-sheet";
import { useRecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { RelationshipPathInput } from "@/components/records/relationship-path-input";
import { recordInvariant } from "@/features/records/record-invariant";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";
import { configureCardinality } from "./configure-graph-model";
import { relationshipDefinition, typeDefinition } from "./configure-model";
import { useConfigurationDeletion } from "./use-configuration-deletion";

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
  messagesOnSource: false,
  messagesOnTarget: false,
});
export class RelationshipModalStore extends ModelChangeStore<ReturnType<typeof empty>> {
  sourceTypeId = "";
  constructor(
    root: RootStore,
    model: RecordModelView,
    completed: (preview: ConfigurationPreview) => Promise<void>,
    canRenewSummaries = false,
    onModelRefreshed?: (model: RecordModelView) => void,
  ) {
    super(root, empty(), model, completed, canRenewSummaries, onModelRefreshed);
    makeObservable(this, { sourceTypeId: observable, edit: action, editPath: action });
  }
  edit = (model: RecordModelView, typeId: string, relationship?: RecordRelationship, targetTypeId?: string) => {
    this.resetModel(model);
    this.sourceTypeId = relationship?.sourceTypeId ?? typeId;
    this.onInitOrRefresh(
      relationship
        ? { ...empty(), ...relationshipDefinition(relationship) }
        : { ...empty(), ...(targetTypeId ? { targetTypeId } : {}) },
    );
    this.open();
  };
  editPath = (model: RecordModelView, typeId: string, path: RecordRelationshipPath) => {
    this.resetModel(model);
    this.sourceTypeId = typeId;
    this.onInitOrRefresh({
      ...empty(),
      mode: "path",
      id: path.id,
      sourceLabel: path.label,
      path: path.path,
    });
    this.open();
  };
  protected projectLatestModel(model: RecordModelView) {
    const source = model.types.find((type) => type.id === this.sourceTypeId);
    if (!source) return null;
    if (!this.form.id) return toJS(this.savedState);
    const projected = new RelationshipModalStore(this.rootStore, model, async () => {});
    if (this.form.mode === "path") {
      const latest = source.relationshipPaths?.find((path) => path.id === this.form.id);
      if (!latest) return null;
      projected.editPath(model, this.sourceTypeId, latest);
    } else {
      const latest = model.relationships.find((relation) => relation.id === this.form.id);
      if (!latest) return null;
      projected.edit(model, this.sourceTypeId, latest);
    }
    this.sourceTypeId = projected.sourceTypeId;
    return toJS(projected.form);
  }
  operations(): ConfigurationChange["operations"] {
    const { mode, path, ...relationship } = this.form;
    if (mode === "path") {
      const type = recordInvariant(this.model.types.find((type) => type.id === this.sourceTypeId));
      const definition = {
        id: this.form.id ?? "$relationshipPath",
        label: this.form.sourceLabel,
        path,
      };
      const current = typeDefinition(type);
      return [
        {
          operation: "putType",
          type: {
            ...current,
            relationshipPaths: [
              ...(current.relationshipPaths ?? []).filter((path) => path.id !== definition.id),
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
const CARDINALITIES = ["oneToOne", "oneToMany", "manyToOne", "manyToMany"] as const;

const MessageSourceSwitches = observer(function MessageSourceSwitches({ store }: { store: RelationshipModalStore }) {
  const t = useTranslations();
  const source = store.model.types.find((type) => type.id === store.sourceTypeId);
  const target = store.model.types.find((type) => type.id === store.form.targetTypeId);
  if (!source || !target) return null;
  const self = source.id === target.id;
  const label = (list: string, side: string) =>
    self
      ? t("RecordModel.relationshipEditor.showMessagesOnSide", { list, side })
      : t("RecordModel.relationshipEditor.showMessagesOn", { list });
  return (
    <div className="flex flex-col gap-3" data-relationship-messages="">
      <FormSwitch id="messagesOnSource" label={label(source.pluralLabel, store.form.sourceLabel)} />

      <FormSwitch id="messagesOnTarget" label={label(target.pluralLabel, store.form.targetLabel)} />

      <p className="text-xs text-muted-foreground">{t("RecordModel.relationshipEditor.messagesHelp")}</p>
    </div>
  );
});

const DirectRelationshipFields = observer(function DirectRelationshipFields({
  store,
}: {
  store: RelationshipModalStore;
}) {
  const t = useTranslations();
  const types = store.model.types;
  const source = types.find((type) => type.id === store.sourceTypeId);
  const target = types.find((type) => type.id === store.form.targetTypeId);
  const cardinality = configureCardinality(store.form);
  const listLabel = (type: typeof source) => type?.pluralLabel ?? t("RecordModel.relationshipEditor.otherList");
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-0">
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3" data-relationship-side="source">
        <FormSelect
          readOnly
          id="sourceTypeId"
          items={[
            {
              value: store.sourceTypeId,
              label: listLabel(source),
              startContent: <RecordTypeGlyph icon={source?.icon} />,
            },
          ]}
          label={t("RecordModel.relationshipEditor.thisList")}
          value={store.sourceTypeId}
        />

        <FormInput
          required
          description={t("RecordModel.relationshipEditor.shownOn", { list: listLabel(source) })}
          id="sourceLabel"
          label={t("RecordModel.relationshipLabel")}
        />
      </div>

      <div className="flex items-center justify-center">
        <span aria-hidden className="hidden h-px w-3 bg-border sm:block" />

        <FormSelect
          ariaLabel={t("RecordModel.relationshipEditor.cardinality")}
          containerClassName="w-40"
          id="cardinality"
          items={CARDINALITIES.map((value) => ({ value, label: t(`RecordModel.cardinality.${value}`) }))}
          label={null}
          value={cardinality}
          onValueChange={(value) => {
            const [left, right] = value.split("To");
            store.onChange("targetCardinality", left === "one" ? "one" : "many");
            store.onChange("sourceCardinality", right === "One" ? "one" : "many");
          }}
        />

        <span aria-hidden className="hidden h-px w-3 bg-border sm:block" />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-3" data-relationship-side="target">
        <FormSelect
          id="targetTypeId"
          items={types.map((type) => ({
            value: type.id,
            label: type.pluralLabel,
            startContent: <RecordTypeGlyph icon={type.icon} />,
          }))}
          label={t("RecordModel.linkedType")}
        />

        <FormInput
          required
          description={t("RecordModel.relationshipEditor.shownOn", { list: listLabel(target) })}
          id="targetLabel"
          label={t("RecordModel.oppositeLabel")}
        />
      </div>
    </div>
  );
});

export const RelationshipModal = observer(function RelationshipModal({
  store,
  onDeleted,
}: {
  store: RelationshipModalStore;
  onDeleted: () => Promise<void>;
}) {
  const t = useTranslations();
  const deletion = useConfigurationDeletion(onDeleted);
  const id = store.form.id;
  const deleteAction = id
    ? {
        id: "delete-relationship",
        icon: Trash2,
        label:
          store.form.mode === "path"
            ? t("RecordModel.configurationDeletion.deleteColumn")
            : t("RecordModel.configurationDeletion.deleteRelationship"),
        variant: "destructive" as const,
        busy: deletion.isBusy,
        disabled: store.isLoading || store.isReadOnly,
        onClick: () =>
          store.form.mode === "path"
            ? deletion.requestDeleteColumn(store.model, store.sourceTypeId, id, store.form.sourceLabel)
            : deletion.requestDelete(store.model, { kind: "relationship", id }, store.form.sourceLabel),
      }
    : null;
  const source = store.model.types.find((type) => type.id === store.sourceTypeId);
  const askAi = useRecordAiAction({
    registerContext: true,
    active: store.isOpen && Boolean(source),
    context: { reference: { kind: "recordType", typeId: store.sourceTypeId }, label: source?.pluralLabel ?? "" },
  });
  return (
    <ModelChangeSheet
      actions={[...(askAi ? [askAi] : []), ...(deleteAction ? [deleteAction] : [])]}
      creating={!store.form.id}
      store={store}
      title={t("RecordModel.relationship")}
    >
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

          {!store.form.id && (
            <FormSelect
              id="mode"
              items={[
                { value: "direct", label: t("RecordModel.directRelationship") },
                { value: "path", label: t("RecordModel.relationshipPath") },
              ]}
              label={t("RecordModel.connectionType")}
            />
          )}

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
            </>
          ) : (
            <>
              <DirectRelationshipFields store={store} />

              <MessageSourceSwitches store={store} />

              <CollapsibleSection
                id="relationship-deletion"
                summary={[store.form.onSourceDelete, store.form.onTargetDelete]
                  .map((value) => t(`RecordModel.deletion.${value}`))
                  .join(" · ")}
                title={t("RecordModel.relationshipEditor.onDelete")}
              >
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
              </CollapsibleSection>
            </>
          )}

          {store.preview && (
            <RecordConfigurationPreview model={store.model} preview={store.preview} renewal={store.summaryRenewal} />
          )}
        </div>
      </AppForm>
    </ModelChangeSheet>
  );
});
