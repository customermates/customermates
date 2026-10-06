"use client";

import { action, makeObservable, observable, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordModel, RecordRelationship } from "@/features/records/record-model.schema";
import type { RecordRelationshipPath, RecordPathStep } from "@/features/records/record-relationship-path.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";

import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { ModelChangeStore } from "./model-change.store";
import { ModelChangeRecovery } from "./model-change-recovery";
import { ModelChangeSheet } from "./model-change-sheet";
import { RelationshipPathInput } from "@/components/records/relationship-path-input";
import { recordInvariant } from "@/features/records/record-invariant";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { configureCardinality } from "./configure-graph-model";

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
  constructor(
    root: RootStore,
    model: RecordModel,
    completed: (preview: ConfigurationPreview) => Promise<void>,
    canRenewSummaries = false,
    onModelRefreshed?: (model: RecordModel) => void,
  ) {
    super(root, empty(), model, completed, canRenewSummaries, onModelRefreshed);
    makeObservable(this, { sourceTypeId: observable, edit: action, editPath: action });
  }
  edit = (model: RecordModel, typeId: string, relationship?: RecordRelationship, targetTypeId?: string) => {
    this.resetModel(model);
    this.sourceTypeId = relationship?.sourceTypeId ?? typeId;
    this.onInitOrRefresh(
      relationship ? { ...empty(), ...relationship } : { ...empty(), ...(targetTypeId ? { targetTypeId } : {}) },
    );
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
  protected projectLatestModel(model: RecordModel) {
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
const CARDINALITIES = ["oneToOne", "oneToMany", "manyToOne", "manyToMany"] as const;

const DirectRelationshipFields = observer(function DirectRelationshipFields({
  store,
}: {
  store: RelationshipModalStore;
}) {
  const t = useTranslations();
  const types = store.model.types;
  const source = types.find((type) => type.id === store.sourceTypeId);
  const target = types.find((type) => type.id === store.form.targetTypeId);
  const SourceIcon = recordTypeIcon(source?.icon ?? "");
  const cardinality = configureCardinality(store.form);
  const listLabel = (type: typeof source) => type?.pluralLabel ?? t("RecordModel.relationshipEditor.otherList");
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-0">
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3" data-relationship-side="source">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("RecordModel.relationshipEditor.thisList")}
            </span>

            <span className="flex h-9 items-center gap-2 rounded-md bg-muted px-3 text-sm">
              <SourceIcon aria-hidden className="size-4 text-muted-foreground" />

              <span className="truncate">{listLabel(source)}</span>
            </span>
          </div>

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
            className="w-auto rounded-full"
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
            items={types
              .filter((type) => !type.archived)
              .map((type) => {
                const Icon = recordTypeIcon(type.icon);
                return {
                  value: type.id,
                  label: type.pluralLabel,
                  startContent: <Icon aria-hidden className="size-4 text-muted-foreground" />,
                };
              })}
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

      <ul className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2.5 text-sm" data-relationship-summary="">
        <li>
          {t("RecordModel.relationshipEditor.summary", {
            list: listLabel(source),
            linked: listLabel(target),
            amount: store.form.sourceCardinality,
          })}
        </li>

        <li>
          {t("RecordModel.relationshipEditor.summary", {
            list: listLabel(target),
            linked: listLabel(source),
            amount: store.form.targetCardinality,
          })}
        </li>
      </ul>
    </div>
  );
});

export const RelationshipModal = observer(function RelationshipModal({ store }: { store: RelationshipModalStore }) {
  const t = useTranslations();
  return (
    <ModelChangeSheet store={store} title={t("RecordModel.relationship")}>
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
                <DirectRelationshipFields store={store} />

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

            {store.preview && (
              <RecordConfigurationPreview model={store.model} preview={store.preview} renewal={store.summaryRenewal} />
            )}
          </div>
        </div>
      </AppForm>
    </ModelChangeSheet>
  );
});
