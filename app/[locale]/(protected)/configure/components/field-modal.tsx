"use client";

import { useState } from "react";
import { action, makeObservable, observable, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordField, RecordModelView, RecordScalar } from "@/features/records/record-model.schema";
import type { ConfigurationChange, ConfigurationPreview } from "@/features/records/configuration.schema";

import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { useRecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormInput } from "@/components/forms/form-input";
import { CHIP_COLORS, toChipColor } from "@/constants/chip-colors";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { RecordValueTypeSchema } from "@/features/records/record-model.schema";
import { ModelChangeStore } from "./model-change.store";
import { ModelChangeRecovery } from "./model-change-recovery";
import { ModelChangeSheet } from "./model-change-sheet";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useConfigurationDeletion } from "./use-configuration-deletion";
import { CalculationLiteralInput } from "./calculation-literal-input";
import { CalculationFlow } from "./calculation-flow-editor";
import { isResolvedField } from "./configure-model";
import {
  CALCULATION_UPDATES,
  UNSET,
  VALUE_SOURCES,
  aggregateOf,
  calculationBehavior,
  calculationDraft,
  calculationIssues,
  derivedValueType,
  expressionAt,
  linkedExpression,
  linkedFlow,
  linkedTypeIds,
  relationshipChoices,
  withAggregate,
  type CalculationSource,
  type CalculationUpdates,
  type ExpressionPath,
  type FlowIssue,
  type ValueSource,
} from "./calculation-flow";
import { RecordInputField } from "../../records/[typeId]/components/record-input-field";
import { recordDraftValue, recordInputValue } from "@/features/records/record-input-value";
import {
  CONTACT_VALUE_TYPES,
  MULTIPLE_VALUE_TYPES,
  calculationResultType,
  expressionRelationshipDependencies,
} from "@/features/records/record-model-validation";
import { recordChannelsBinding } from "@/features/records/record-channels";
import { channelsAvatarAvailable, channelsFieldOperations } from "./channels-field";

type ChannelsBinding = RecordModelView["capabilities"][number];

const initial = () => ({
  id: undefined as string | undefined,
  label: "",
  valueType: "text" as RecordField["valueType"] | "channels",
  source: "input" as ValueSource,
  required: false,
  multiple: false,
  providerAvatar: false,
  currency: "eur",
  decimalPlaces: "",
  onClick: "open" as "open" | "copy",
  expression: UNSET,
  updates: "live" as CalculationUpdates,
  triggerFieldId: "",
  triggerValue: undefined as unknown,
  hasDefaultValue: false,
  defaultValue: undefined as unknown,
  publishedSummary: false,
  allowManualOverride: false as boolean | undefined,
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
    preset: Partial<Pick<ReturnType<typeof initial>, "source" | "valueType">> = {},
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
            source: field.behavior.kind === "input" ? "input" : calculationDraft(field.behavior).source,
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
                  updates: field.behavior.capture,
                  allowManualOverride: field.behavior.allowManualOverride,
                  triggerFieldId: field.behavior.triggerFieldId ?? "",
                  triggerValue: recordDraftValue(field.behavior.triggerValue),
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
    this.form.options.push({
      id: crypto.randomUUID(),
      label: "",
      color: "secondary",
      probability: "",
      attributes: [],
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
    if (multiple) this.onChange("source", "input");
    if (!fromChoice || !hadDefault || previous === undefined) return;
    const ids = Array.isArray(previous) ? previous.map(String) : [String(previous)];
    if (!multiple && ids.length > 1) return;
    this.onChange("hasDefaultValue", true);
    this.onChange("defaultValue", multiple ? ids : ids[0]);
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
      valueType: this.form.valueType === "channels" ? "text" : this.form.valueType,
      behavior: { kind: "input" },
      required: false,
      multiple:
        this.form.valueType !== "channels" && MULTIPLE_VALUE_TYPES.includes(this.form.valueType) && this.form.multiple,
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
  get isCalculated() {
    return this.form.source !== "input";
  }
  get calculationSource(): CalculationSource {
    return this.form.source === "input" ? "formula" : this.form.source;
  }
  get derivedType() {
    const derived = this.isCalculated ? derivedValueType(this.form.expression, this.typeId, this.model) : null;
    if (
      derived?.valueType === "text" &&
      this.form.valueType !== "channels" &&
      CONTACT_VALUE_TYPES.includes(this.form.valueType)
    )
      return { ...derived, valueType: this.form.valueType };
    return derived;
  }
  get valueType(): RecordField["valueType"] | "channels" {
    return this.derivedType?.valueType ?? this.form.valueType;
  }
  get calculationIssues() {
    return this.isCalculated
      ? calculationIssues(this.calculationSource, this.form.expression, this.typeId, this.model)
      : [];
  }
  get linkedTypeIds() {
    return [
      ...new Set(
        this.isCalculated
          ? [...expressionRelationshipDependencies(this.form.expression)].flatMap((relationId) => {
              const relation = this.model.relationships.find((candidate) => candidate.id === relationId);
              return relation ? [relation.sourceTypeId, relation.targetTypeId] : [];
            })
          : [],
      ),
    ].filter((id) => id !== this.typeId);
  }
  chooseSource = (source: ValueSource) => {
    const linked = linkedFlow(this.form.expression);
    const keeps =
      source === "formula" ||
      source === "input" ||
      (source === "rollup" && linked.hops.length > 0) ||
      (source === "lookup" &&
        linked.hops.length > 0 &&
        linked.hops.every((hop, index) =>
          relationshipChoices(linkedTypeIds(linked, this.typeId, this.model)[index], this.model, true).some(
            (choice) => choice.relation.id === hop.relationId && choice.direction === hop.direction,
          ),
        ));
    this.onChange("source", source);
    if (!keeps) this.onChange("expression", UNSET);
    else if (source === "lookup" || source === "rollup") {
      this.onChange(
        "expression",
        linkedExpression(
          withAggregate(
            linked,
            source === "lookup" ? "one" : aggregateOf(linked) === "one" ? "sum" : aggregateOf(linked),
          ),
        ),
      );
    }
  };
  protected override validateDraft() {
    const issue = this.calculationIssues[0];
    if (!issue) return undefined;
    return {
      errors: [],
      properties: { expression: { errors: [this.issueMessage(issue)] } },
    } as FieldModalStore["error"];
  }
  issueMessage: (issue: FlowIssue) => string = () => "";
  stepType(path: ExpressionPath) {
    const step = expressionAt(this.form.expression, path);
    return step ? calculationResultType(step, this.typeId, this.model) : null;
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
    if (id === "valueType" && this.form.valueType === "channels") this.form.source = "input";
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
      form.source === "input"
        ? {
            kind: "input",
            ...(form.hasDefaultValue
              ? {
                  defaultValue: recordInputValue(form.defaultValue, this.inputDefinition),
                }
              : {}),
          }
        : calculationBehavior({
            source: form.source,
            expression: form.expression,
            updates: form.updates,
            allowManualOverride: form.allowManualOverride,
            triggerFieldId: form.triggerFieldId,
            triggerValue,
          });
    const derived = this.derivedType;
    const valueType = derived?.valueType ?? form.valueType;
    const currency = derived?.currency ?? form.currency.toUpperCase();
    const field = {
      id: form.id ?? this.definitionId,
      typeId: this.typeId,
      label: form.label,
      valueType,
      behavior,
      required: form.required,
      multiple: !derived && MULTIPLE_VALUE_TYPES.includes(valueType) && form.multiple,
      position:
        this.original?.position ??
        Math.max(
          -1,
          ...this.model.fields.filter((field) => field.typeId === this.typeId).map((field) => field.position),
        ) + 1,
      format: {
        ...this.original?.format,
        currency: valueType === "currency" ? currency : null,
        decimalPlaces:
          ["number", "currency"].includes(valueType) && form.decimalPlaces.trim() !== ""
            ? Number(form.decimalPlaces)
            : null,
        onClick: CONTACT_VALUE_TYPES.includes(valueType) ? form.onClick : null,
      },
      options:
        derived?.valueType === "select"
          ? derived.options
          : valueType === "select"
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
  const channels = store.channels;
  const editing = Boolean(original || channels);
  const deleteTarget = original
    ? { target: { kind: "field" as const, id: original.id }, name: original.label }
    : channels
      ? { target: { kind: "channels" as const, id: channels.id }, name: t("EntityChannels.heading") }
      : null;
  const [showProbability, setShowProbability] = useState(false);
  const optionMetadata = showProbability || store.form.options.some((option) => option.probability !== "");
  const optionGrid = cn(
    "grid items-start gap-2",
    optionMetadata
      ? "grid-cols-[minmax(0,1fr)_6rem_2.25rem] [grid-template-areas:'name_name_del'_'color_prob_.'] @md/options:grid-cols-[minmax(0,1fr)_9rem_6rem_2.25rem] @md/options:[grid-template-areas:'name_color_prob_del']"
      : "grid-cols-[minmax(0,1fr)_8rem_2.25rem] [grid-template-areas:'name_color_del'] @md/options:grid-cols-[minmax(0,1fr)_9rem_2.25rem]",
  );
  const triggerValueLabel = () => {
    const trigger = store.triggerField;
    const value = store.form.triggerValue;
    if (!trigger || value === undefined || value === null || value === "") return undefined;
    if (trigger.valueType === "select") return trigger.options.find((option) => option.id === value)?.label;
    if (typeof value === "boolean") return value ? t("RecordModel.yes") : t("RecordModel.no");
    return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  };
  const thisList = store.model.types.find((type) => type.id === store.typeId);
  const linkedList = store.model.types.find((type) => type.id === store.linkedTypeIds[0]);
  const updateLabels: Record<CalculationUpdates, string> = {
    live: t("RecordModel.calculationFlow.updateModes.live"),
    create: t("RecordModel.calculationFlow.updateModes.create"),
    whenChanged: t("RecordModel.calculationFlow.updateModes.whenChanged"),
    explicit: t("RecordModel.calculationFlow.updateModes.explicit"),
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

            <div className={cn("grid gap-4", !store.isCalculated && "sm:grid-cols-2")}>
              {!store.isChannels && (
                <FormSelect
                  id="source"
                  items={(store.form.valueType === "select" && store.form.multiple ? ["input"] : VALUE_SOURCES).map(
                    (value) => ({
                      value,
                      label: t(`RecordModel.behaviors.${value}`),
                    }),
                  )}
                  label={t("RecordModel.behavior")}
                  onValueChange={(source) => store.chooseSource(source as ValueSource)}
                />
              )}

              {!store.isCalculated && (
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
                  value={
                    store.form.valueType === "select" && store.form.multiple ? "multiSelect" : store.form.valueType
                  }
                  onValueChange={store.chooseValueType}
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

            {store.valueType === "currency" && !store.derivedType?.currency && (
              <FormAutocompleteCurrency required id="currency" label={t("RecordModel.currency")} />
            )}

            {store.valueType !== "channels" && CONTACT_VALUE_TYPES.includes(store.valueType) && (
              <FormSelect
                id="onClick"
                items={(["open", "copy"] as const).map((value) => ({
                  value,
                  label: t(`RecordModel.clickActions.${store.valueType}.${value}`),
                }))}
                label={t("RecordModel.clickAction")}
              />
            )}

            {["number", "currency"].includes(store.valueType) && (
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

            {!store.isCalculated && !store.isChannels && (
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

            {!store.isCalculated && ["text", "email", "phone", "url"].includes(store.form.valueType) && (
              <FormSwitch id="multiple" label={t("RecordModel.multipleValues")} />
            )}
          </>

          {store.isCalculated && (
            <CollapsibleSection
              defaultOpen
              open={store.getError("expression") ? true : undefined}
              summary={t(`RecordModel.behaviors.${store.form.source}`)}
              title={t("RecordModel.fieldTabs.calculation")}
            >
              <CalculationFlow store={store} triggerValueLabel={triggerValueLabel()} />
            </CollapsibleSection>
          )}

          {store.isCalculated && (
            <CollapsibleSection
              summary={[
                updateLabels[store.form.updates],
                ...(linkedList
                  ? [
                      store.form.publishedSummary
                        ? t("RecordModel.calculationFlow.shown")
                        : t("RecordModel.calculationFlow.private"),
                    ]
                  : []),
              ].join(" · ")}
              title={t("RecordModel.calculationFlow.moreOptions")}
            >
              <FormSelect
                id="updates"
                items={CALCULATION_UPDATES.map((value) => ({ value, label: updateLabels[value] }))}
                label={t("RecordModel.calculationFlow.updates")}
              />

              {store.form.updates === "whenChanged" && (
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

              {store.form.updates !== "live" && (
                <FormSwitch id="allowManualOverride" label={t("RecordModel.calculationFlow.typeOver")} />
              )}

              {linkedList && (store.canPublishSummary || store.original?.publishedSummary) && (
                <div className="space-y-2">
                  {store.canPublishSummary ? (
                    <FormSwitch
                      id="publishedSummary"
                      label={t("RecordModel.calculationFlow.showToEveryone", { list: thisList?.label ?? "" })}
                    />
                  ) : (
                    <p className="text-sm">{t("RecordModel.summaryApprovalRequired")}</p>
                  )}

                  {store.form.publishedSummary && (
                    <p className="text-xs text-muted-foreground">
                      {t("RecordModel.calculationFlow.showToEveryoneHelp", { list: linkedList.label })}
                    </p>
                  )}
                </div>
              )}
            </CollapsibleSection>
          )}

          {store.form.valueType === "select" && (
            <CollapsibleSection
              defaultOpen
              summary={t("RecordModel.optionCount", { count: store.form.options.length })}
              title={t("RecordModel.options")}
            >
              <div className="@container/options space-y-3">
                {store.form.options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("RecordModel.noOptions")}</p>
                ) : (
                  <div aria-hidden className={cn(optionGrid, "text-xs font-medium text-muted-foreground")}>
                    <span className="truncate [grid-area:name]">{t("RecordModel.option")}</span>

                    <span className="truncate [grid-area:color]">{t("RecordModel.color")}</span>

                    {optionMetadata && (
                      <span className="truncate [grid-area:prob]">{t("RecordModel.probability")}</span>
                    )}
                  </div>
                )}

                {store.form.options.map((option, index) => (
                  <div key={option.id} className="space-y-3">
                    <div className={optionGrid}>
                      <FormInput
                        aria-label={t("RecordModel.option")}
                        containerClassName="min-w-0 [grid-area:name]"
                        id={`options.${index}.label`}
                        label={null}
                      />

                      <FormSelect
                        ariaLabel={t("RecordModel.color")}
                        containerClassName="min-w-0 [grid-area:color]"
                        id={`options.${index}.color`}
                        items={CHIP_COLORS.map((color) => ({
                          value: color,
                          label: t(`Common.colors.${color}`),
                          chipLabel: option.label.trim() || undefined,
                          color,
                        }))}
                        label={null}
                        value={toChipColor(option.color)}
                      />

                      {optionMetadata && (
                        <FormInput
                          aria-label={t("RecordModel.probability")}
                          containerClassName="min-w-0 [grid-area:prob]"
                          id={`options.${index}.probability`}
                          inputMode="decimal"
                          label={null}
                        />
                      )}

                      <Button
                        aria-label={t("RecordModel.removeOption")}
                        className="[grid-area:del]"
                        disabled={store.isDisabled}
                        size="icon"
                        type="button"
                        variant="ghostDestructive"
                        onClick={() => store.removeOption(option.id)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </div>

                    {option.attributes.map((attribute, offset) => (
                      <div key={offset} className="ml-3 space-y-3 border-l pl-4">
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
                            variant="ghostDestructive"
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

                        <CalculationLiteralInput
                          currency={store.form.currency}
                          id={`options.${index}.attributes.${offset}`}
                          model={store.model}
                          typeId={store.typeId}
                          value={attribute.value}
                          onChange={(value) => {
                            if (value) store.onChange(`options.${index}.attributes.${offset}.value`, value);
                          }}
                        />
                      </div>
                    ))}

                    {!store.form.multiple && (
                      <Button
                        className="h-auto px-0 text-muted-foreground hover:bg-transparent hover:text-foreground has-[>svg]:px-0"
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
                        <Plus aria-hidden className="size-3.5" />

                        {t("RecordModel.addAttribute")}
                      </Button>
                    )}
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2">
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

                  {!optionMetadata && !store.form.multiple && (
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
              </div>
            </CollapsibleSection>
          )}

          {store.preview && (
            <RecordConfigurationPreview model={store.model} preview={store.preview} renewal={store.summaryRenewal} />
          )}
        </div>
      </AppForm>
    </ModelChangeSheet>
  );
});
