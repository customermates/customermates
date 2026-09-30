"use client";

import { action, makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { ArrowDown, ArrowUp, Save, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordModel, RecordType, RecordGroupSummaryDefinition } from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";

import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModelChangeStore } from "./model-change.store";
import { recordColumns } from "@/features/records/record-columns";
import { recordGroupableFields, resolveRecordGrouping } from "@/features/records/record-grouping";
import { encodeGroupingToken, decodeGroupingToken } from "@/core/base/grouping/grouping.schema";

const initialType = () => ({
  name: "",
  pluralName: "",
  description: "",
  icon: "folder",
  accessPresetId: "private",
  archived: false,
  navigationVisible: true,
  layout: "table" as RecordType["defaults"]["layout"],
  groupBy: "none",
  sortField: "none",
  sortDirection: "asc" as "asc" | "desc",
  columns: [] as string[],
  hiddenColumns: [] as string[],
  pinnedFields: [] as string[],
  groupSummaries: [] as RecordGroupSummaryDefinition[],
});
export class TypeModalStore extends ModelChangeStore<ReturnType<typeof initialType>> {
  original: RecordType | null = null;
  constructor(root: RootStore, model: RecordModel, completed: (preview: ConfigurationPreview) => Promise<void>) {
    super(root, initialType(), model, completed);
    makeObservable(this, { original: observable.ref, edit: action });
  }
  edit = (model: RecordModel, type: RecordType | null) => {
    this.resetModel(model);
    this.original = type;
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
          }
        : initialType(),
    );
    this.open();
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
    ];
  }
}
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
  const title = store.original ? t("RecordModel.typeSettings") : t("RecordModel.createList");
  return (
    <AppModal
      actions={[
        {
          id: "create-list",
          icon: Save,
          label: store.original
            ? store.preview?.valid
              ? t("RecordModel.apply")
              : t("RecordModel.preview")
            : t("RecordModel.createList"),
          onClick: store.onSubmit,
          busy: store.isLoading,
          disabled: Boolean(store.pendingOperationId),
        },
      ]}
      size={store.original ? "xl" : "md"}
      store={store}
      title={title}
    >
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-lg font-semibold">{title}</h2>
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
              <FormInput required id="name" label={t("RecordModel.name")} />

              <FormInput
                description={t("RecordModel.pluralDescription")}
                id="pluralName"
                label={t("RecordModel.pluralName")}
              />

              <FormTextarea id="description" label={t("RecordModel.description")} />

              <FormSelect
                id="icon"
                items={[
                  { value: "folder", label: t("RecordModel.folder") },
                  { value: "briefcase", label: t("RecordModel.briefcase") },
                  { value: "list", label: t("RecordModel.list") },
                  { value: "building", label: t("RecordModel.building") },
                ]}
                label={t("RecordModel.icon")}
              />

              {!store.original && (
                <FormSelect
                  description={t("RecordModel.accessDescription")}
                  id="accessPresetId"
                  items={[
                    { value: "private", label: t("RecordModel.privateAccess") },
                    ...store.model.accessPresets
                      .filter((preset) => !preset.archived)
                      .map((preset) => ({ value: preset.id, label: preset.label })),
                  ]}
                  label={t("RecordModel.access")}
                />
              )}

              {store.original && (
                <>
                  <div className="space-y-4 border-t border-border pt-4">
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
                              field.grouping.field.startsWith("system:")
                                ? t(`RecordModel.${field.label}`)
                                : field.label,
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
                          { value: "none", label: t("RecordModel.defaultOrder") },
                          ...columns
                            .filter((column) => column.sortable)
                            .map((column) => ({ value: column.id, label: column.label })),
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
                              aria-label={t("RecordModel.moveUp", { field: field.label })}
                              disabled={index === 0 || store.isReadOnly || store.isLoading}
                              size="icon"
                              type="button"
                              variant="ghost"
                              onClick={() => store.moveColumn(id, -1)}
                            >
                              <ArrowUp className="size-4" />
                            </Button>

                            <Button
                              aria-label={t("RecordModel.moveDown", { field: field.label })}
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

                  <FormSwitch id="navigationVisible" label={t("RecordModel.showInNavigation")} />

                  <FormSwitch id="archived" label={t("RecordModel.archiveType")} />
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
