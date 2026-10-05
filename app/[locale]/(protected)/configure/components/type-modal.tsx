"use client";

import { action, makeObservable, observable, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordModel, RecordType, RecordGroupSummaryDefinition } from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";

import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModelChangeStore } from "./model-change.store";
import { ModelChangeRecovery } from "./model-change-recovery";
import { recordChannelsEnabled } from "@/features/records/record-channels";
import { recordColumns } from "@/features/records/record-columns";
import { recordGroupableFields, resolveRecordGrouping } from "@/features/records/record-grouping";
import { encodeGroupingToken, decodeGroupingToken } from "@/core/base/grouping/grouping.schema";
import { RECORD_TYPE_ICON_KEYS, recordTypeIcon, type RecordTypeIconKey } from "@/components/records/record-type-icon";
import { configureFieldOrder, moveConfigureField, reorderFieldOperations } from "./configure-model";
import { ModelChangeSheet } from "./model-change-sheet";

const initialType = () => ({
  name: "",
  pluralName: "",
  description: "",
  icon: "folder",
  accessPresetId: "private",
  archived: false,
  channelsEnabled: false,
  providerAvatar: false,
  navigationVisible: true,
  layout: "table" as RecordType["defaults"]["layout"],
  groupBy: "none",
  sortField: "none",
  sortDirection: "asc" as "asc" | "desc",
  columns: [] as string[],
  hiddenColumns: [] as string[],
  pinnedFields: [] as string[],
  groupSummaries: [] as RecordGroupSummaryDefinition[],
  fieldOrder: [] as string[],
});
export type TypeModalSection = "settings" | "appearance" | "archive";
export class TypeModalStore extends ModelChangeStore<ReturnType<typeof initialType>> {
  original: RecordType | null = null;
  section: TypeModalSection = "settings";
  private channelBindingId = "";
  constructor(
    root: RootStore,
    model: RecordModel,
    completed: (preview: ConfigurationPreview, isCurrentSession?: () => boolean) => Promise<void>,
    canRenewSummaries = false,
    onModelRefreshed?: (model: RecordModel) => void,
  ) {
    super(root, initialType(), model, completed, canRenewSummaries, onModelRefreshed);
    makeObservable(this, {
      original: observable.ref,
      section: observable,
      edit: action,
      moveField: action,
    });
  }
  edit = (model: RecordModel, type: RecordType | null, section: TypeModalSection = "settings") => {
    this.section = section;
    this.resetModel(model);
    this.original = type;
    this.channelBindingId =
      model.capabilities.find((binding) => binding.kind === "channels" && binding.typeId === type?.id)?.id ??
      crypto.randomUUID();
    this.immediateApply = !type;
    const columns = type ? recordColumns(type.id, model) : [];
    const grouping = type?.defaults.groupBy
      ? resolveRecordGrouping(type.id, { field: type.defaults.groupBy, bucket: type.defaults.groupBucket }, model)
          ?.grouping
      : undefined;
    this.onInitOrRefresh(
      type
        ? {
            ...initialType(),
            name: type.label,
            channelsEnabled: recordChannelsEnabled(model, type.id),
            providerAvatar:
              model.capabilities.find((binding) => binding.kind === "channels" && binding.typeId === type.id)
                ?.providerAvatar ?? false,
            pluralName: type.pluralLabel,
            description: type.description,
            icon: type.icon,
            archived: type.archived,
            navigationVisible: type.navigationVisible,
            ...type.defaults,
            groupSummaries: type.defaults.groupSummaries ?? [],
            groupBy: grouping ? encodeGroupingToken(grouping) : "none",
            sortField: type.defaults.sortField ?? "none",
            columns: [...new Set([...type.defaults.columns, ...columns.map((column) => column.id)])],
            fieldOrder: configureFieldOrder(model, type.id),
          }
        : initialType(),
    );
    this.open();
  };
  protected projectLatestModel(model: RecordModel) {
    if (!this.original) return toJS(this.savedState);
    const latest = model.types.find((type) => type.id === this.original?.id);
    if (!latest) return null;
    const projected = new TypeModalStore(this.rootStore, model, async () => {});
    projected.edit(model, latest, this.section);
    this.original = latest;
    this.channelBindingId = projected.channelBindingId;
    return toJS(projected.form);
  }
  moveField = (activeId: string, overId: string) => {
    this.onChange("fieldOrder", moveConfigureField(this.form.fieldOrder, activeId, overId));
  };
  moveColumn = (fieldId: string, offset: number) => {
    const columns = [...this.form.columns];
    const from = columns.indexOf(fieldId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= columns.length) return;
    [columns[from], columns[to]] = [columns[to], columns[from]];
    this.onChange("columns", columns);
  };
  toggleField = (key: "hiddenColumns" | "pinnedFields", fieldId: string) => {
    const current = this.form[key];
    this.onChange(key, current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId]);
  };
  get summaryFields() {
    return this.model.fields.filter(
      (field) =>
        field.typeId === this.original?.id && !field.archived && ["number", "currency"].includes(field.valueType),
    );
  }
  get nextSummary() {
    if (this.form.groupSummaries.length >= 8) return undefined;
    return (["sum", "average", "min", "max"] as const)
      .flatMap((aggregation) => this.summaryFields.map((field) => ({ fieldId: field.id, aggregation })))
      .find(
        (candidate) =>
          !this.form.groupSummaries.some(
            (summary) => summary.fieldId === candidate.fieldId && summary.aggregation === candidate.aggregation,
          ),
      );
  }
  addSummary = () => {
    const summary = this.nextSummary;
    if (summary) this.onChange("groupSummaries", [...this.form.groupSummaries, summary]);
  };
  updateSummary = (index: number, value: Partial<RecordGroupSummaryDefinition>) => {
    this.onChange(
      "groupSummaries",
      this.form.groupSummaries.map((summary, position) => (position === index ? { ...summary, ...value } : summary)),
    );
  };
  removeSummary = (index: number) => {
    this.onChange(
      "groupSummaries",
      this.form.groupSummaries.filter((_, position) => position !== index),
    );
  };
  operations(): ConfigurationChange["operations"] {
    if (this.original) {
      return [
        {
          operation: "putType",
          type: {
            ...this.original,
            label: this.form.name,
            pluralLabel: this.form.pluralName || this.form.name,
            description: this.form.description,
            icon: this.form.icon,
            archived: this.form.archived,
            navigationVisible: this.form.navigationVisible,
            defaults: {
              ...this.original.defaults,
              layout: this.form.layout,
              groupBy: this.form.groupBy === "none" ? null : (decodeGroupingToken(this.form.groupBy)?.field ?? null),
              groupBucket: this.form.groupBy === "none" ? undefined : decodeGroupingToken(this.form.groupBy)?.bucket,
              sortField: this.form.sortField === "none" ? null : this.form.sortField,
              sortDirection: this.form.sortDirection,
              columns: this.form.columns,
              hiddenColumns: this.form.hiddenColumns,
              pinnedFields: this.form.pinnedFields,
              groupSummaries: this.form.groupSummaries,
            },
          },
        },
        ...reorderFieldOperations(this.model, this.original.id, this.form.fieldOrder),
        ...(this.form.channelsEnabled !== recordChannelsEnabled(this.model, this.original.id) ||
        this.form.providerAvatar !==
          (this.model.capabilities.find((binding) => binding.id === this.channelBindingId)?.providerAvatar ?? false)
          ? [
              {
                operation: "putCapability" as const,
                capability: {
                  ...(this.model.capabilities.find((binding) => binding.id === this.channelBindingId) ?? {
                    id: this.channelBindingId,
                    fields: [],
                  }),
                  kind: "channels" as const,
                  typeId: this.original.id,
                  enabled: this.form.channelsEnabled,
                  providerAvatar: this.form.providerAvatar,
                },
              },
            ]
          : []),
      ];
    }
    return [
      {
        operation: "createType",
        reference: "$type",
        label: this.form.name,
        pluralLabel: this.form.pluralName || this.form.name,
        description: this.form.description,
        icon: this.form.icon,
        embedded: false,
        accessPresetId: this.form.accessPresetId === "private" ? null : this.form.accessPresetId,
      },
      ...(this.form.channelsEnabled
        ? [
            {
              operation: "putCapability" as const,
              capability: {
                id: this.channelBindingId,
                kind: "channels" as const,
                typeId: "$type",
                fields: [],
                enabled: true,
                providerAvatar: this.form.providerAvatar,
              },
            },
          ]
        : []),
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
  const iconLabels: Record<RecordTypeIconKey, string> = {
    contact: t("RecordModel.icons.contact"),
    building: t("RecordModel.icons.building"),
    handshake: t("RecordModel.icons.handshake"),
    package: t("RecordModel.icons.package"),
    check: t("RecordModel.icons.check"),
    folder: t("RecordModel.icons.folder"),
    briefcase: t("RecordModel.icons.briefcase"),
    list: t("RecordModel.icons.list"),
  };
  const iconKeys: string[] = RECORD_TYPE_ICON_KEYS;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput required id="name" inputId={inputId("name")} label={t("RecordModel.name")} />

        <FormInput
          description={t("RecordModel.pluralDescription")}
          id="pluralName"
          inputId={inputId("pluralName")}
          label={t("RecordModel.pluralName")}
        />
      </div>

      <FormTextarea id="description" inputId={inputId("description")} label={t("RecordModel.description")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormSelect
          id="icon"
          inputId={inputId("icon")}
          items={[
            ...RECORD_TYPE_ICON_KEYS.map((key) => {
              const Icon = recordTypeIcon(key);
              return {
                value: key,
                label: iconLabels[key],
                startContent: <Icon aria-hidden className="size-4 text-muted-foreground" />,
              };
            }),
            ...(iconKeys.includes(store.form.icon) ? [] : [{ value: store.form.icon, label: iconLabels.folder }]),
          ]}
          label={t("RecordModel.icon")}
        />

        {!store.original && (
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

      <div className="space-y-1">
        <FormSwitch id="channelsEnabled" inputId={inputId("channelsEnabled")} label={t("RecordModel.enableChannels")} />

        <p className="text-xs text-muted-foreground">{t("RecordModel.channelsHelp")}</p>
      </div>

      {store.form.channelsEnabled &&
        store.model.capabilities.some(
          (binding) => binding.kind === "avatar" && binding.typeId === store.original?.id,
        ) && (
          <FormSwitch
            id="providerAvatar"
            inputId={inputId("providerAvatar")}
            label={t("RecordModel.useChannelAvatar")}
          />
        )}

      {store.original && (
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
  const groupings = store.original ? recordGroupableFields(store.original.id, store.model) : [];
  const columns = store.original
    ? recordColumns(store.original.id, store.model).map((column) => ({
        ...column,
        label:
          column.kind === "identity"
            ? t("EntityChannels.heading")
            : column.kind === "system"
              ? t(`RecordModel.${column.label}`)
              : column.label,
      }))
    : [];
  const archiving = !store.original?.archived;
  const title = !store.original
    ? t("RecordModel.createList")
    : store.section === "appearance"
      ? t("RecordModel.sharedDefaults")
      : store.section === "archive"
        ? archiving
          ? t("RecordModel.archiveList")
          : t("RecordModel.unarchiveList")
        : t("RecordModel.typeSettings");
  return (
    <ModelChangeSheet
      store={store}
      submitLabel={store.original ? undefined : t("RecordModel.createList")}
      title={title}
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

          {(!store.original || store.section === "settings") && <TypeSettingsFields store={store} />}

          {store.original && store.section === "archive" && (
            <p className="text-sm text-muted-foreground">
              {archiving ? t("RecordModel.archiveListDescription") : t("RecordModel.unarchiveListDescription")}
            </p>
          )}

          {store.original && store.section === "appearance" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium">{t("RecordModel.sharedDefaults")}</h3>

                <p className="text-sm text-muted-foreground">{t("RecordModel.sharedDefaultsDescription")}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect
                  id="layout"
                  items={[
                    { value: "table", label: t("RecordModel.table") },
                    {
                      value: "board",
                      label: t("RecordModel.board"),
                    },
                  ]}
                  label={t("RecordModel.defaultLayout")}
                />

                <FormSelect
                  id="groupBy"
                  items={[
                    { value: "none", label: t("RecordModel.noGrouping") },
                    ...groupings.map((field) => ({
                      value: encodeGroupingToken(field.grouping),
                      label: [
                        field.grouping.field.startsWith("system:") ? t(`RecordModel.${field.label}`) : field.label,
                        field.bucket ? t(`Common.dateBuckets.${field.bucket}`) : null,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    })),
                  ]}
                  label={t("RecordModel.defaultGrouping")}
                />

                <FormSelect
                  id="sortField"
                  items={[
                    {
                      value: "none",
                      label: t("RecordModel.defaultOrder"),
                    },
                    ...columns
                      .filter((column) => column.sortable)
                      .map((column) => ({
                        value: column.id,
                        label: column.label,
                      })),
                  ]}
                  label={t("RecordModel.defaultSort")}
                />

                <FormSelect
                  id="sortDirection"
                  items={[
                    { value: "asc", label: t("RecordModel.ascending") },
                    { value: "desc", label: t("RecordModel.descending") },
                  ]}
                  label={t("RecordModel.sortDirection")}
                />
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t("RecordModel.groupSummaries")}</legend>

                <p className="text-sm text-muted-foreground">{t("RecordModel.groupSummariesDescription")}</p>

                {store.form.groupSummaries.map((summary, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <div className="space-y-1">
                      <label className="text-sm" htmlFor={`type-summary-field-${index}`}>
                        {t("RecordModel.summaryField")}
                      </label>

                      <Select
                        disabled={store.isReadOnly || store.isLoading}
                        value={summary.fieldId}
                        onValueChange={(fieldId) => store.updateSummary(index, { fieldId })}
                      >
                        <SelectTrigger id={`type-summary-field-${index}`}>
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent>
                          {store.summaryFields.map((field) => (
                            <SelectItem key={field.id} value={field.id}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm" htmlFor={`type-summary-aggregation-${index}`}>
                        {t("RecordModel.summaryAggregation")}
                      </label>

                      <Select
                        disabled={store.isReadOnly || store.isLoading}
                        value={summary.aggregation}
                        onValueChange={(aggregation) =>
                          store.updateSummary(index, {
                            aggregation: aggregation as RecordGroupSummaryDefinition["aggregation"],
                          })
                        }
                      >
                        <SelectTrigger id={`type-summary-aggregation-${index}`}>
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent>
                          {(["sum", "average", "min", "max"] as const).map((aggregation) => (
                            <SelectItem key={aggregation} value={aggregation}>
                              {t(`RecordModel.reducers.${aggregation}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      aria-label={t("RecordModel.removeGroupSummary")}
                      disabled={store.isReadOnly || store.isLoading}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => store.removeSummary(index)}
                    >
                      <X aria-hidden className="size-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  disabled={!store.nextSummary || store.isReadOnly || store.isLoading}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={store.addSummary}
                >
                  <Plus aria-hidden className="size-4" />

                  {t("RecordModel.addGroupSummary")}
                </Button>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">{t("RecordModel.defaultColumns")}</legend>

                {store.form.columns.map((id, index) => {
                  const field = columns.find((field) => field.id === id);
                  if (!field) return null;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <label className="flex grow items-center gap-2 text-sm">
                        <Checkbox
                          checked={!store.form.hiddenColumns.includes(id)}
                          disabled={id === store.original?.primaryFieldId || store.isReadOnly || store.isLoading}
                          onCheckedChange={() => store.toggleField("hiddenColumns", id)}
                        />

                        {field.label}
                      </label>

                      <Button
                        aria-label={t("RecordModel.moveUp", {
                          field: field.label,
                        })}
                        disabled={index === 0 || store.isReadOnly || store.isLoading}
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() => store.moveColumn(id, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>

                      <Button
                        aria-label={t("RecordModel.moveDown", {
                          field: field.label,
                        })}
                        disabled={index === store.form.columns.length - 1 || store.isReadOnly || store.isLoading}
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() => store.moveColumn(id, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">{t("RecordModel.pinnedFields")}</legend>

                {columns.map((field) => (
                  <label key={field.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={store.form.pinnedFields.includes(field.id)}
                      disabled={store.isReadOnly || store.isLoading}
                      onCheckedChange={() => store.toggleField("pinnedFields", field.id)}
                    />

                    {field.label}
                  </label>
                ))}
              </fieldset>
            </div>
          )}

          {store.preview && (
            <RecordConfigurationPreview model={store.model} preview={store.preview} renewal={store.summaryRenewal} />
          )}
        </div>
      </AppForm>
    </ModelChangeSheet>
  );
});
