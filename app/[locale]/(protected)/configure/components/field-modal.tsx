"use client";

import { omit } from "lodash";
import { action, makeObservable, observable, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordField, RecordModelView, CalculationExpression } from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";

import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { useRecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { RecordValueTypeSchema } from "@/features/records/record-model.schema";
import { ModelChangeStore } from "./model-change.store";
import { ModelChangeRecovery } from "./model-change-recovery";
import { ModelChangeSheet } from "./model-change-sheet";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useConfigurationDeletion } from "./use-configuration-deletion";
import { CalculationInput } from "./calculation-input";
import { isResolvedField } from "./configure-model";
import { CalculationPath } from "./calculation-path";
import { FieldOptionsEditor } from "./field-options-editor";
import {
  moveOption,
  optionColumnsFromField,
  optionsWithAttributes,
  type OptionAttributeColumn,
  type OptionDraft,
} from "./field-option-columns";
import { RecordInputField } from "../../records/[typeId]/components/record-input-field";
import { recordDraftValue, recordInputValue } from "@/features/records/record-input-value";
import { CONTACT_VALUE_TYPES, MULTIPLE_VALUE_TYPES } from "@/features/records/record-model-validation";
import { recordChannelsBinding } from "@/features/records/record-channels";
import { channelsAvatarAvailable, channelsFieldOperations } from "./channels-field";

type ChannelsBinding = RecordModelView["capabilities"][number];

const initial = () => ({
  id: undefined as string | undefined,
  label: "",
  valueType: "text" as RecordField["valueType"] | "channels",
  behavior: "input" as RecordField["behavior"]["kind"],
  required: false,
  multiple: false,
  providerAvatar: false,
  currency: "eur",
  decimalPlaces: "",
  onClick: "open" as "open" | "copy",
  expression: {
    kind: "literal",
    value: { kind: "decimal", value: "0", currency: null },
  } as CalculationExpression,
  capture: "explicit" as "explicit" | "create" | "whenChanged",
  triggerFieldId: "",
  triggerValue: undefined as unknown,
  hasDefaultValue: false,
  defaultValue: undefined as unknown,
  publishedSummary: false,
  allowManualOverride: false,
  choices: { columns: [] as OptionAttributeColumn[], options: [] as OptionDraft[] },
});
export class FieldModalStore extends ModelChangeStore<ReturnType<typeof initial>> {
  typeId = "";
  original: RecordField | null = null;
  channels: ChannelsBinding | null = null;
  private definitionId: string = crypto.randomUUID();
  private publication: { signature: string; operations: ConfigurationChange["operations"] } | null = null;
  constructor(
    root: RootStore,
    model: RecordModelView,
    completed: (preview: ConfigurationPreview) => Promise<void>,
    canPublishSummary = false,
    onModelRefreshed?: (model: RecordModelView) => void,
  ) {
    super(root, initial(), model, completed, canPublishSummary, onModelRefreshed);
    makeObservable(this, {
      typeId: observable,
      original: observable.ref,
      channels: observable.ref,
      edit: action,
      editChannels: action,
      addOption: action,
      removeOption: action,
      moveOption: action,
      addAttributeColumn: action,
      renameAttributeColumn: action,
      removeAttributeColumn: action,
      chooseValueType: action,
    });
  }
  get canPublishSummary() {
    return this.canRenewSummaries;
  }
  edit = (
    model: RecordModelView,
    typeId: string,
    field: RecordField | null,
    preset: Partial<Pick<ReturnType<typeof initial>, "behavior" | "valueType">> = {},
  ) => {
    this.resetModel(model);
    this.typeId = typeId;
    this.original = field;
    this.channels = null;
    this.definitionId = field?.id ?? crypto.randomUUID();
    this.publication = null;
    this.onInitOrRefresh(
      field
        ? {
            ...initial(),
            id: field.id,
            label: field.label,
            valueType: field.valueType,
            behavior: field.behavior.kind,
            required: field.required,
            multiple: field.multiple ?? false,
            publishedSummary: field.publishedSummary,
            decimalPlaces: field.format?.decimalPlaces?.toString() ?? "",
            currency: field.format?.currency?.toLowerCase() ?? initial().currency,
            onClick: field.format?.onClick ?? "open",
            ...(field.behavior.kind === "input"
              ? {
                  hasDefaultValue: field.behavior.defaultValue !== undefined && field.behavior.defaultValue !== null,
                  defaultValue: recordDraftValue(field.behavior.defaultValue),
                }
              : { expression: field.behavior.expression }),
            ...(field.behavior.kind === "snapshot"
              ? {
                  capture: field.behavior.capture,
                  allowManualOverride: field.behavior.allowManualOverride ?? false,
                  triggerFieldId: field.behavior.triggerFieldId ?? "",
                  triggerValue: recordDraftValue(field.behavior.triggerValue),
                }
              : {}),
            choices: optionColumnsFromField(field.options),
          }
        : {
            ...initial(),
            ...preset,
          },
    );
    this.open();
  };
  editChannels = (model: RecordModelView, typeId: string) => {
    const binding = recordChannelsBinding(model, typeId);
    if (!binding) return;
    this.resetModel(model);
    this.typeId = typeId;
    this.original = null;
    this.channels = binding;
    this.definitionId = binding.id;
    this.publication = null;
    this.onInitOrRefresh(this.channelsForm(binding));
    this.open();
  };
  get isChannels() {
    return this.form.valueType === "channels";
  }
  private channelsForm(binding: ChannelsBinding) {
    return {
      ...initial(),
      valueType: "channels" as const,
      providerAvatar: binding.providerAvatar ?? false,
    };
  }
  protected projectLatestModel(model: RecordModelView) {
    if (!model.types.some((type) => type.id === this.typeId)) return null;
    this.publication = null;
    if (this.channels) {
      const latest = recordChannelsBinding(model, this.typeId);
      if (!latest) return null;
      this.channels = latest;
      this.definitionId = latest.id;
      return this.channelsForm(latest);
    }
    if (!this.original) return toJS(this.savedState);
    const latest = model.fields.find((field) => field.id === this.original?.id);
    if (!latest || !isResolvedField(latest)) return null;
    const projected = new FieldModalStore(this.rootStore, model, async () => {}, this.canPublishSummary);
    projected.edit(model, latest.typeId, latest);
    this.typeId = latest.typeId;
    this.original = latest;
    this.definitionId = latest.id;
    return toJS(projected.form);
  }
  addOption = () => {
    this.form.choices.options.push({
      id: crypto.randomUUID(),
      label: "",
      color: "secondary",
      cells: {},
    });
    this.setPreview(null);
  };
  chooseValueType = (choice: string) => {
    const multiple = choice === "multiSelect";
    const fromChoice = this.form.valueType === "select" && (choice === "select" || multiple);
    const previous = fromChoice ? toJS(this.form.defaultValue) : undefined;
    const hadDefault = this.form.hasDefaultValue;
    this.onChange("valueType", multiple ? "select" : choice);
    this.onChange("multiple", multiple);
    if (multiple) this.onChange("behavior", "input");
    if (!fromChoice || !hadDefault || previous === undefined) return;
    const ids = Array.isArray(previous) ? previous.map(String) : [String(previous)];
    if (!multiple && ids.length > 1) return;
    this.onChange("hasDefaultValue", true);
    this.onChange("defaultValue", multiple ? ids : ids[0]);
  };
  removeOption = (id: string) => {
    this.form.choices.options = this.form.choices.options.filter((option) => option.id !== id);
    this.setPreview(null);
  };
  moveOption = (activeId: string, overId: string) => {
    this.onChange("choices.options", moveOption(this.form.choices.options, activeId, overId));
  };
  addAttributeColumn = (key: string, type: OptionAttributeColumn["type"]) => {
    this.onChange("choices.columns", [
      ...this.form.choices.columns,
      { id: crypto.randomUUID(), key: key.trim(), type },
    ]);
  };
  renameAttributeColumn = (id: string, key: string) => {
    this.onChange(
      "choices.columns",
      this.form.choices.columns.map((column) => (column.id === id ? { ...column, key: key.trim() } : column)),
    );
  };
  removeAttributeColumn = (id: string) => {
    this.form.choices.options = this.form.choices.options.map((option) => ({
      ...option,
      cells: omit(option.cells, id),
    }));
    this.onChange(
      "choices.columns",
      this.form.choices.columns.filter((column) => column.id !== id),
    );
  };
  get inputDefinition(): RecordField {
    return {
      id: this.definitionId,
      typeId: this.typeId,
      label: this.form.label,
      valueType: this.form.valueType === "channels" ? "text" : this.form.valueType,
      behavior: { kind: "input" },
      required: false,
      multiple:
        this.form.valueType !== "channels" && MULTIPLE_VALUE_TYPES.includes(this.form.valueType) && this.form.multiple,
      archived: false,
      publishedSummary: false,
      position: this.original?.position ?? 0,
      format: { currency: this.form.valueType === "currency" ? this.form.currency.toUpperCase() : null },
      options: optionsWithAttributes(this.form.choices.columns, this.form.choices.options),
    };
  }
  get triggerFields() {
    return this.model.fields.filter(
      (field): field is RecordField =>
        field.typeId === this.typeId && !field.archived && !field.multiple && field.behavior.kind === "input",
    );
  }
  get triggerField() {
    return this.triggerFields.find((field) => field.id === this.form.triggerFieldId);
  }
  protected override afterChange(id?: string): void {
    if (id === "valueType" && !["number", "currency"].includes(this.form.valueType)) this.form.decimalPlaces = "";
    if (id === "valueType" && this.form.valueType === "channels") this.form.behavior = "input";
    if (id === "valueType" || id === "multiple") {
      this.form.hasDefaultValue = false;
      this.form.defaultValue = undefined;
    }
    if (
      id === "hasDefaultValue" &&
      this.form.hasDefaultValue &&
      this.form.defaultValue === undefined &&
      this.form.valueType === "boolean"
    )
      this.form.defaultValue = false;
    if (id === "triggerFieldId")
      this.form.triggerValue = this.triggerField?.valueType === "boolean" ? false : undefined;
    this.publication = null;
    super.afterChange();
  }
  protected override enrichPreviewChange(
    change: ConfigurationChange,
    preview: ConfigurationPreview,
  ): ConfigurationChange {
    const operation = change.operations.find((operation) => operation.operation === "putField");
    if (
      !operation ||
      operation.operation !== "putField" ||
      operation.field.behavior.kind === "input" ||
      !this.canPublishSummary ||
      (!this.original?.publishedSummary && !this.form.publishedSummary)
    )
      return change;
    const calculation = preview.calculations.find((calculation) => calculation.fieldId === operation.field.id);
    if (!calculation) return change;
    const operations: ConfigurationChange["operations"] = [
      ...change.operations.filter(
        (candidate) => candidate.operation !== "publishSummary" || candidate.fieldId !== operation.field.id,
      ),
      {
        operation: "publishSummary",
        fieldId: operation.field.id,
        published: this.form.publishedSummary,
        dependencyHash: calculation.dependencyHash,
      },
    ];
    this.publication = { signature: JSON.stringify(toJS(this.form)), operations };
    return { ...change, operations };
  }
  operations(): ConfigurationChange["operations"] {
    if (this.canPublishSummary && this.publication?.signature === JSON.stringify(toJS(this.form)))
      return this.publication.operations;
    const form = this.form;
    if (form.valueType === "channels") return channelsFieldOperations(this.model, this.typeId, form, this.definitionId);
    const trigger = this.triggerField;
    const triggerValue = trigger ? recordInputValue(form.triggerValue, trigger) : null;
    const behavior: RecordField["behavior"] =
      form.behavior === "input"
        ? {
            kind: "input",
            ...(form.hasDefaultValue
              ? {
                  defaultValue: recordInputValue(form.defaultValue, this.inputDefinition),
                }
              : {}),
          }
        : form.behavior === "snapshot"
          ? {
              kind: "snapshot",
              expression: form.expression,
              capture: form.capture,
              allowManualOverride: form.allowManualOverride,
              ...(form.capture === "whenChanged"
                ? {
                    triggerFieldId: form.triggerFieldId,
                    ...(triggerValue ? { triggerValue } : {}),
                  }
                : {}),
            }
          : { kind: form.behavior, expression: form.expression };
    const field = {
      id: form.id ?? this.definitionId,
      typeId: this.typeId,
      label: form.label,
      valueType: form.valueType,
      behavior,
      required: form.required,
      multiple: MULTIPLE_VALUE_TYPES.includes(form.valueType) && form.multiple,
      position:
        this.original?.position ??
        Math.max(
          -1,
          ...this.model.fields.filter((field) => field.typeId === this.typeId).map((field) => field.position),
        ) + 1,
      format: {
        ...this.original?.format,
        currency: form.valueType === "currency" ? form.currency.toUpperCase() : null,
        decimalPlaces:
          ["number", "currency"].includes(form.valueType) && form.decimalPlaces.trim() !== ""
            ? Number(form.decimalPlaces)
            : null,
        onClick: CONTACT_VALUE_TYPES.includes(form.valueType) ? form.onClick : null,
      },
      options: form.valueType === "select" ? optionsWithAttributes(form.choices.columns, form.choices.options) : [],
    };
    return [{ operation: "putField", field }];
  }
}
export const FieldModal = observer(function FieldModal({
  store,
  onDeleted,
}: {
  store: FieldModalStore;
  onDeleted: () => Promise<void>;
}) {
  const t = useTranslations();
  const deletion = useConfigurationDeletion(onDeleted);
  const original = store.original;
  const channels = store.channels;
  const editing = Boolean(original || channels);
  const deleteTarget = original
    ? { target: { kind: "field" as const, id: original.id }, name: original.label }
    : channels
      ? { target: { kind: "channels" as const, id: channels.id }, name: t("EntityChannels.heading") }
      : null;
  const triggerValueLabel = () => {
    const trigger = store.triggerField;
    const value = store.form.triggerValue;
    if (!trigger || value === undefined || value === null || value === "") return undefined;
    if (trigger.valueType === "select") return trigger.options.find((option) => option.id === value)?.label;
    if (typeof value === "boolean") return value ? t("RecordModel.yes") : t("RecordModel.no");
    return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  };
  const askAi = useRecordAiAction({
    registerContext: true,
    active: store.isOpen,
    context: {
      reference: store.original
        ? { kind: "recordField", typeId: store.typeId, fieldId: store.original.id }
        : { kind: "recordType", typeId: store.typeId },
      label: store.original?.label ?? t("RecordModel.addField"),
    },
  });
  return (
    <ModelChangeSheet
      actions={[
        ...(askAi ? [askAi] : []),
        ...(deleteTarget
          ? [
              {
                id: "delete-field",
                icon: Trash2,
                label: t("RecordModel.configurationDeletion.deleteField"),
                variant: "destructive" as const,
                busy: deletion.isBusy,
                disabled: store.isLoading || store.isReadOnly,
                onClick: () => deletion.requestDelete(store.model, deleteTarget.target, deleteTarget.name),
              },
            ]
          : []),
      ]}
      creating={!store.original}
      store={store}
      title={editing ? t("RecordModel.editField") : t("RecordModel.addField")}
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

          <>
            {!store.isChannels && <FormInput required id="label" label={t("RecordModel.name")} />}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormSelect
                disabled={store.isChannels}
                id="valueType"
                items={
                  store.isChannels
                    ? [{ value: "channels", label: t("EntityChannels.heading") }]
                    : RecordValueTypeSchema.options.flatMap((value) =>
                        value === "select"
                          ? [
                              { value, label: t("RecordModel.types.select") },
                              { value: "multiSelect", label: t("RecordModel.types.multiSelect") },
                            ]
                          : [{ value, label: t(`RecordModel.types.${value}`) }],
                      )
                }
                label={t("RecordModel.valueType")}
                value={store.form.valueType === "select" && store.form.multiple ? "multiSelect" : store.form.valueType}
                onValueChange={store.chooseValueType}
              />

              {!store.isChannels && (
                <FormSelect
                  id="behavior"
                  items={(store.form.valueType === "select" && store.form.multiple
                    ? ["input"]
                    : ["input", "formula", "lookup", "rollup", "snapshot"]
                  ).map((value) => ({
                    value,
                    label: t(`RecordModel.behaviors.${value}`),
                  }))}
                  label={t("RecordModel.behavior")}
                  onValueChange={(behavior) => {
                    store.onChange("behavior", behavior);
                    if (behavior === "lookup" || behavior === "rollup") {
                      const relation = store.model.relationships.find(
                        (relation) =>
                          !relation.archived &&
                          (relation.sourceTypeId === store.typeId || relation.targetTypeId === store.typeId),
                      );
                      if (!relation) return;
                      const direction = relation.sourceTypeId === store.typeId ? "outgoing" : "incoming";
                      const targetId = direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
                      const field = store.model.fields.find(
                        (field) =>
                          field.typeId === targetId && !field.archived && field.valueType === store.form.valueType,
                      );
                      const current = store.form.expression;
                      store.onChange(
                        "expression",
                        current.kind === "related"
                          ? { ...current, reducer: behavior === "lookup" ? "one" : "sum" }
                          : {
                              kind: "related",
                              relationId: relation.id,
                              direction,
                              reducer: behavior === "lookup" ? "one" : "sum",
                              expression: field
                                ? { kind: "field", fieldId: field.id }
                                : { kind: "literal", value: null },
                            },
                      );
                    }
                  }}
                />
              )}
            </div>

            {store.isChannels && (
              <>
                <p className="text-sm text-muted-foreground">{t("RecordModel.channelsHelp")}</p>

                {channelsAvatarAvailable(store.model, store.typeId) && (
                  <FormSwitch id="providerAvatar" label={t("RecordModel.useChannelAvatar")} />
                )}
              </>
            )}

            {store.form.valueType === "currency" && (
              <FormAutocompleteCurrency required id="currency" label={t("RecordModel.currency")} />
            )}

            {store.form.valueType !== "channels" && CONTACT_VALUE_TYPES.includes(store.form.valueType) && (
              <FormSelect
                id="onClick"
                items={(["open", "copy"] as const).map((value) => ({
                  value,
                  label: t(`RecordModel.clickActions.${store.form.valueType}.${value}`),
                }))}
                label={t("RecordModel.clickAction")}
              />
            )}

            {["number", "currency"].includes(store.form.valueType) && (
              <FormInput
                description={t("RecordModel.decimalPlacesHelp")}
                id="decimalPlaces"
                inputMode="numeric"
                label={t("RecordModel.decimalPlaces")}
                max={30}
                min={0}
                step={1}
                type="number"
              />
            )}

            {store.form.behavior === "input" && !store.isChannels && (
              <div className="space-y-3">
                <FormSwitch id="hasDefaultValue" label={t("RecordModel.setDefaultValue")} />

                {store.form.hasDefaultValue && (
                  <RecordInputField
                    field={store.inputDefinition}
                    id="defaultValue"
                    label={t("RecordModel.defaultValue")}
                  />
                )}
              </div>
            )}

            {!store.isChannels && <FormSwitch id="required" label={t("RecordModel.required")} />}

            {["text", "email", "phone", "url"].includes(store.form.valueType) && (
              <FormSwitch id="multiple" label={t("RecordModel.multipleValues")} />
            )}
          </>

          {store.form.behavior !== "input" && (
            <CollapsibleSection
              defaultOpen
              summary={t(`RecordModel.behaviors.${store.form.behavior}`)}
              title={t("RecordModel.fieldTabs.calculation")}
            >
              <>
                <CalculationPath
                  expression={store.form.expression}
                  fieldLabel={store.form.label.trim() || t("RecordModel.calculationPath.thisField")}
                  model={store.model}
                  snapshot={
                    store.form.behavior === "snapshot"
                      ? {
                          allowManualOverride: store.form.allowManualOverride,
                          capture: store.form.capture,
                          triggerLabel: store.triggerField?.label,
                          triggerValueLabel: triggerValueLabel(),
                        }
                      : undefined
                  }
                  typeId={store.typeId}
                />

                <CalculationInput
                  behavior={store.form.behavior}
                  currency={store.form.currency}
                  model={store.model}
                  typeId={store.typeId}
                  value={store.form.expression}
                  onChange={(expression) => store.onChange("expression", expression)}
                />

                {store.form.behavior === "snapshot" && (
                  <>
                    <FormSwitch id="allowManualOverride" label={t("RecordModel.allowManualOverride")} />

                    <FormSelect
                      id="capture"
                      items={[
                        { value: "explicit", label: t("RecordModel.captureExplicit") },
                        { value: "create", label: t("RecordModel.captureCreate") },
                        { value: "whenChanged", label: t("RecordModel.captureChanged") },
                      ]}
                      label={t("RecordModel.capture")}
                    />

                    {store.form.capture === "whenChanged" && (
                      <>
                        <FormSelect
                          id="triggerFieldId"
                          items={store.triggerFields.map((field) => ({
                            value: field.id,
                            label: field.label,
                          }))}
                          label={t("RecordModel.triggerField")}
                        />

                        {store.triggerField && (
                          <RecordInputField
                            field={{ ...store.triggerField, required: false }}
                            id="triggerValue"
                            label={t("RecordModel.triggerValue")}
                          />
                        )}
                      </>
                    )}
                  </>
                )}

                {(store.canPublishSummary || store.original?.publishedSummary) && (
                  <div className="space-y-2">
                    {store.canPublishSummary ? (
                      <FormSwitch id="publishedSummary" label={t("RecordModel.publishSummary")} />
                    ) : (
                      <p className="text-sm">{t("RecordModel.summaryApprovalRequired")}</p>
                    )}

                    <p className="text-xs text-muted-foreground">{t("RecordModel.publishSummaryHelp")}</p>
                  </div>
                )}
              </>
            </CollapsibleSection>
          )}

          {store.form.valueType === "select" && <FieldOptionsEditor store={store} />}

          {store.preview && (
            <RecordConfigurationPreview model={store.model} preview={store.preview} renewal={store.summaryRenewal} />
          )}
        </div>
      </AppForm>
    </ModelChangeSheet>
  );
});
