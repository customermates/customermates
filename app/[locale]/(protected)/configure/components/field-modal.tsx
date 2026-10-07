"use client";

import { useState } from "react";
import { action, makeObservable, observable, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RootStore } from "@/core/stores/root.store";
import type {
  RecordField,
  RecordModel,
  CalculationExpression,
  RecordScalar,
} from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";

import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { useRecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormInput } from "@/components/forms/form-input";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { Button } from "@/components/ui/button";
import { RecordValueTypeSchema } from "@/features/records/record-model.schema";
import { ModelChangeStore } from "./model-change.store";
import { ModelChangeRecovery } from "./model-change-recovery";
import { ModelChangeSheet } from "./model-change-sheet";
import { EditorTabs } from "@/components/editor-tabs/editor-tabs";
import { useConfigurationDeletion } from "./use-configuration-deletion";
import { CalculationInput } from "./calculation-input";
import { CalculationPath } from "./calculation-path";
import { RecordInputField } from "../../records/[typeId]/components/record-input-field";
import { recordInputValue } from "@/features/records/record-input-value";

function scalarDraft(value: RecordScalar | null | undefined): unknown {
  if (!value) return undefined;
  if (value.kind === "richText") return JSON.parse(value.documentJson);
  if (value.kind === "range") return `${value.start ?? ""},${value.end ?? ""}`;
  if (value.kind === "textList") return value.value.join("\n");
  return value.value;
}

const initial = () => ({
  id: undefined as string | undefined,
  label: "",
  valueType: "text" as RecordField["valueType"],
  behavior: "input" as RecordField["behavior"]["kind"],
  required: false,
  multiple: false,
  currency: "eur",
  decimalPlaces: "",
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
  options: [] as Array<{
    id: string;
    label: string;
    probability: string;
    color: string | null;
    attributes: Array<{ key: string; value: RecordScalar }>;
  }>,
});
export class FieldModalStore extends ModelChangeStore<ReturnType<typeof initial>> {
  typeId = "";
  original: RecordField | null = null;
  private definitionId: string = crypto.randomUUID();
  private publication: { signature: string; operations: ConfigurationChange["operations"] } | null = null;
  constructor(
    root: RootStore,
    model: RecordModel,
    completed: (preview: ConfigurationPreview) => Promise<void>,
    canPublishSummary = false,
    onModelRefreshed?: (model: RecordModel) => void,
  ) {
    super(root, initial(), model, completed, canPublishSummary, onModelRefreshed);
    makeObservable(this, {
      typeId: observable,
      original: observable.ref,
      edit: action,
      addOption: action,
      removeOption: action,
    });
  }
  get canPublishSummary() {
    return this.canRenewSummaries;
  }
  edit = (
    model: RecordModel,
    typeId: string,
    field: RecordField | null,
    preset: Partial<Pick<ReturnType<typeof initial>, "behavior" | "valueType">> = {},
  ) => {
    this.resetModel(model);
    this.typeId = typeId;
    this.original = field;
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
            ...(field.behavior.kind === "input"
              ? {
                  hasDefaultValue: field.behavior.defaultValue !== undefined && field.behavior.defaultValue !== null,
                  defaultValue: scalarDraft(field.behavior.defaultValue),
                }
              : { expression: field.behavior.expression }),
            ...(field.behavior.kind === "snapshot"
              ? {
                  capture: field.behavior.capture,
                  allowManualOverride: field.behavior.allowManualOverride ?? false,
                  triggerFieldId: field.behavior.triggerFieldId ?? "",
                  triggerValue: scalarDraft(field.behavior.triggerValue),
                }
              : {}),
            options: field.options.map((option) => {
              const probability = option.attributes.find((attribute) => attribute.key === "probability")?.value;
              return {
                id: option.id,
                label: option.label,
                color: option.color,
                probability: probability?.kind === "decimal" ? probability.value : "",
                attributes: option.attributes.filter((attribute) => attribute.key !== "probability"),
              };
            }),
          }
        : {
            ...initial(),
            ...preset,
          },
    );
    this.open();
  };
  protected projectLatestModel(model: RecordModel) {
    if (!model.types.some((type) => type.id === this.typeId)) return null;
    this.publication = null;
    if (!this.original) return toJS(this.savedState);
    const latest = model.fields.find((field) => field.id === this.original?.id);
    if (!latest) return null;
    const projected = new FieldModalStore(this.rootStore, model, async () => {}, this.canPublishSummary);
    projected.edit(model, latest.typeId, latest);
    this.typeId = latest.typeId;
    this.original = latest;
    this.definitionId = latest.id;
    return toJS(projected.form);
  }
  addOption = () => {
    this.form.options.push({
      id: crypto.randomUUID(),
      label: "",
      color: "secondary",
      probability: "",
      attributes: [],
    });
    this.setPreview(null);
  };
  removeOption = (id: string) => {
    this.form.options = this.form.options.filter((option) => option.id !== id);
    this.setPreview(null);
  };
  get inputDefinition(): RecordField {
    return {
      id: this.definitionId,
      typeId: this.typeId,
      label: this.form.label,
      valueType: this.form.valueType,
      behavior: { kind: "input" },
      required: false,
      multiple: ["text", "email", "phone", "url"].includes(this.form.valueType) && this.form.multiple,
      archived: false,
      publishedSummary: false,
      position: this.original?.position ?? 0,
      format: { currency: this.form.valueType === "currency" ? this.form.currency.toUpperCase() : null },
      options: this.form.options.map((option) => ({
        id: option.id,
        label: option.label,
        color: option.color,
        attributes: option.attributes,
      })),
    };
  }
  get triggerFields() {
    return this.model.fields.filter(
      (field) => field.typeId === this.typeId && !field.archived && !field.multiple && field.behavior.kind === "input",
    );
  }
  get triggerField() {
    return this.triggerFields.find((field) => field.id === this.form.triggerFieldId);
  }
  protected override afterChange(id?: string): void {
    if (id === "valueType" && !["number", "currency"].includes(this.form.valueType)) this.form.decimalPlaces = "";
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
      multiple: ["text", "email", "phone", "url"].includes(form.valueType) && form.multiple,
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
      },
      options:
        form.valueType === "select"
          ? form.options.map((option) => ({
              id: option.id,
              label: option.label,
              color: option.color,
              attributes: [
                ...option.attributes,
                ...(option.probability
                  ? [
                      {
                        key: "probability",
                        value: {
                          kind: "decimal" as const,
                          value: option.probability,
                          currency: null,
                        },
                      },
                    ]
                  : []),
              ],
            }))
          : [],
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
  const [showProbability, setShowProbability] = useState(false);
  const optionMetadata = showProbability || store.form.options.some((option) => option.probability !== "");
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
        ...(original
          ? [
              {
                id: "delete-field",
                icon: Trash2,
                label: t("RecordModel.configurationDeletion.deleteField"),
                variant: "destructive" as const,
                busy: deletion.isBusy,
                disabled: store.isLoading || store.isReadOnly,
                onClick: () => deletion.requestDelete(store.model, { kind: "field", id: original.id }, original.label),
              },
            ]
          : []),
      ]}
      creating={!store.original}
      store={store}
      title={store.original ? t("RecordModel.editField") : t("RecordModel.addField")}
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

          <EditorTabs
            className="-mx-6"
            contentClassName="space-y-4 px-6 pt-5"
            label={store.original ? t("RecordModel.editField") : t("RecordModel.addField")}
            tabs={[
              {
                id: "general",
                label: t("RecordModel.general"),
                fields: [
                  "label",
                  "valueType",
                  "behavior",
                  "currency",
                  "decimalPlaces",
                  "defaultValue",
                  "required",
                  "multiple",
                ],
                content: (
                  <>
                    <FormInput required id="label" label={t("RecordModel.name")} />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormSelect
                        id="valueType"
                        items={RecordValueTypeSchema.options.map((value) => ({
                          value,
                          label: t(`RecordModel.types.${value}`),
                        }))}
                        label={t("RecordModel.valueType")}
                      />

                      <FormSelect
                        id="behavior"
                        items={["input", "formula", "lookup", "rollup", "snapshot"].map((value) => ({
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
                                field.typeId === targetId &&
                                !field.archived &&
                                field.valueType === store.form.valueType,
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
                    </div>

                    {store.form.valueType === "currency" && (
                      <FormAutocompleteCurrency required id="currency" label={t("RecordModel.currency")} />
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

                    {store.form.behavior === "input" && (
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

                    <FormSwitch id="required" label={t("RecordModel.required")} />

                    {["text", "email", "phone", "url"].includes(store.form.valueType) && (
                      <FormSwitch id="multiple" label={t("RecordModel.multipleValues")} />
                    )}
                  </>
                ),
              },
              ...(store.form.behavior === "input"
                ? []
                : [
                    {
                      id: "calculation",
                      label: t("RecordModel.fieldTabs.calculation"),
                      fields: ["expression", "capture", "triggerFieldId", "triggerValue", "publishedSummary"],
                      content: (
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
                      ),
                    },
                  ]),
              ...(store.form.valueType === "select"
                ? [
                    {
                      id: "options",
                      label: t("RecordModel.options"),
                      fields: store.form.options.flatMap((_, index) => [
                        `options.${index}.label`,
                        `options.${index}.color`,
                        `options.${index}.probability`,
                      ]),
                      content: (
                        <div className="space-y-3">
                          <span className="text-sm font-medium">{t("RecordModel.options")}</span>

                          {store.form.options.map((option, index) => (
                            <div key={option.id} className="space-y-3">
                              <div className="flex flex-wrap items-end gap-2">
                                <FormInput
                                  containerClassName="min-w-32 flex-1"
                                  id={`options.${index}.label`}
                                  label={t("RecordModel.option")}
                                />

                                <FormSelect
                                  id={`options.${index}.color`}
                                  items={CHIP_COLORS.map((color) => ({
                                    value: color,
                                    label: t(`Common.colors.${color}`),
                                    color,
                                  }))}
                                  label={t("RecordModel.color")}
                                />

                                {optionMetadata && (
                                  <FormInput
                                    containerClassName="w-24"
                                    id={`options.${index}.probability`}
                                    inputMode="decimal"
                                    label={t("RecordModel.probability")}
                                  />
                                )}

                                <Button
                                  aria-label={t("RecordModel.removeOption")}
                                  disabled={store.isDisabled}
                                  size="icon"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => store.removeOption(option.id)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>

                              {option.attributes.map((attribute, offset) => (
                                <div key={offset} className="space-y-3">
                                  <div className="flex items-end gap-2">
                                    <FormInput
                                      containerClassName="flex-1"
                                      id={`options.${index}.attributes.${offset}.key`}
                                      label={t("RecordModel.attribute")}
                                    />

                                    <Button
                                      aria-label={t("RecordModel.removeInput")}
                                      disabled={store.isDisabled}
                                      size="icon"
                                      type="button"
                                      variant="ghost"
                                      onClick={() =>
                                        store.onChange(
                                          `options.${index}.attributes`,
                                          option.attributes.filter((_, position) => position !== offset),
                                        )
                                      }
                                    >
                                      <Trash2 aria-hidden className="size-4" />
                                    </Button>
                                  </div>

                                  <CalculationInput
                                    literalOnly
                                    currency={store.form.currency}
                                    model={store.model}
                                    path={`options.${index}.attributes.${offset}`}
                                    typeId={store.typeId}
                                    value={{ kind: "literal", value: attribute.value }}
                                    onChange={(expression) => {
                                      if (expression.kind === "literal" && expression.value)
                                        store.onChange(`options.${index}.attributes.${offset}.value`, expression.value);
                                    }}
                                  />
                                </div>
                              ))}

                              <Button
                                disabled={store.isDisabled}
                                size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() =>
                                  store.onChange(`options.${index}.attributes`, [
                                    ...option.attributes,
                                    { key: "", value: { kind: "decimal", value: "0", currency: null } },
                                  ])
                                }
                              >
                                {t("RecordModel.addAttribute")}
                              </Button>
                            </div>
                          ))}

                          <Button
                            disabled={store.isDisabled}
                            size="sm"
                            type="button"
                            variant="secondary"
                            onClick={store.addOption}
                          >
                            <Plus className="size-4" />

                            {t("RecordModel.addOption")}
                          </Button>

                          {!optionMetadata && (
                            <Button
                              disabled={store.isDisabled}
                              size="sm"
                              type="button"
                              variant="ghost"
                              onClick={() => setShowProbability(true)}
                            >
                              {t("RecordModel.addProbability")}
                            </Button>
                          )}
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />

          {store.preview && (
            <RecordConfigurationPreview model={store.model} preview={store.preview} renewal={store.summaryRenewal} />
          )}
        </div>
      </AppForm>
    </ModelChangeSheet>
  );
});
