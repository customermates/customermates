"use client";

import { useState } from "react";
import { action, makeObservable, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { Plus, Save, Trash2 } from "lucide-react";
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
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormInput } from "@/components/forms/form-input";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { Button } from "@/components/ui/button";
import { RecordValueTypeSchema } from "@/features/records/record-model.schema";
import { ModelChangeStore } from "./model-change.store";
import { CalculationInput } from "./calculation-input";

const initial = () => ({
  id: undefined as string | undefined,
  label: "",
  valueType: "text" as RecordField["valueType"],
  behavior: "input" as RecordField["behavior"]["kind"],
  required: false,
  multiple: false,
  archived: false,
  currency: "eur",
  expression: {
    kind: "literal",
    value: { kind: "decimal", value: "0", currency: null },
  } as CalculationExpression,
  capture: "explicit" as "explicit" | "create" | "whenChanged",
  triggerFieldId: "",
  triggerValue: "",
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
  constructor(root: RootStore, model: RecordModel, completed: (preview: ConfigurationPreview) => Promise<void>) {
    super(root, initial(), model, completed);
    makeObservable(this, {
      typeId: observable,
      original: observable.ref,
      edit: action,
      addOption: action,
      removeOption: action,
    });
  }
  edit = (model: RecordModel, typeId: string, field: RecordField | null) => {
    this.resetModel(model);
    this.typeId = typeId;
    this.original = field;
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
            archived: field.archived,
            currency: (field.format?.currency ?? this.rootStore.companyStore.company?.currency ?? "EUR").toLowerCase(),
            ...(field.behavior.kind === "input" ? {} : { expression: field.behavior.expression }),
            ...(field.behavior.kind === "snapshot"
              ? {
                  capture: field.behavior.capture,
                  allowManualOverride: field.behavior.allowManualOverride ?? false,
                  triggerFieldId: field.behavior.triggerFieldId ?? "",
                  triggerValue:
                    field.behavior.triggerValue && "value" in field.behavior.triggerValue
                      ? String(field.behavior.triggerValue.value)
                      : "",
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
            currency: this.rootStore.companyStore.company?.currency?.toLowerCase() ?? "eur",
          },
    );
    this.open();
  };
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
  operations(): ConfigurationChange["operations"] {
    const form = this.form;
    const behavior: RecordField["behavior"] =
      form.behavior === "input"
        ? {
            kind: "input",
            ...(this.original?.behavior.kind === "input" ? { defaultValue: this.original.behavior.defaultValue } : {}),
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
                    triggerValue: {
                      kind: "select",
                      value: form.triggerValue,
                    } as const,
                  }
                : {}),
            }
          : { kind: form.behavior, expression: form.expression };
    const field = {
      id: form.id ?? "$field",
      typeId: this.typeId,
      label: form.label,
      valueType: form.valueType,
      behavior,
      required: form.required,
      multiple: ["text", "email", "phone", "url"].includes(form.valueType) && form.multiple,
      archived: form.archived,
      position: this.original?.position ?? this.model.fields.filter((field) => field.typeId === this.typeId).length,
      format: {
        ...this.original?.format,
        currency: form.valueType === "currency" ? form.currency.toUpperCase() : null,
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
export const FieldModal = observer(function FieldModal({ store }: { store: FieldModalStore }) {
  const t = useTranslations();
  const [showProbability, setShowProbability] = useState(false);
  const optionMetadata = showProbability || store.form.options.some((option) => option.probability !== "");
  return (
    <AppModal
      actions={[
        {
          id: "save-field",
          icon: Save,
          label: store.preview?.valid ? t("RecordModel.apply") : t("RecordModel.preview"),
          onClick: store.onSubmit,
          busy: store.isLoading,
          disabled: Boolean(store.pendingOperationId),
        },
      ]}
      size="xl"
      store={store}
      title={store.original ? t("RecordModel.editField") : t("RecordModel.addField")}
    >
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-lg font-semibold">
              {store.original ? t("RecordModel.editField") : t("RecordModel.addField")}
            </h2>
          </AppCardHeader>

          <AppCardBody>
            <RecordAiAction
              registerContext
              active={store.isOpen}
              context={{
                reference: store.original
                  ? { kind: "recordField", typeId: store.typeId, fieldId: store.original.id }
                  : { kind: "recordType", typeId: store.typeId },
                label: store.original?.label ?? t("RecordModel.addField"),
              }}
            />

            {store.pendingOperationId && (
              <RecordOperationProgress
                operationId={store.pendingOperationId}
                onCompleted={store.operationCompleted}
                onStopped={store.operationStopped}
              />
            )}

            <div className="space-y-4">
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
              </div>

              {store.form.valueType === "currency" && (
                <FormAutocompleteCurrency required id="currency" label={t("RecordModel.currency")} />
              )}

              {store.form.behavior !== "input" && (
                <CalculationInput
                  behavior={store.form.behavior}
                  model={store.model}
                  typeId={store.typeId}
                  value={store.form.expression}
                  onChange={(expression) => store.onChange("expression", expression)}
                />
              )}

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
                        items={store.model.fields
                          .filter(
                            (field) =>
                              field.typeId === store.typeId &&
                              field.valueType === "select" &&
                              field.behavior.kind === "input",
                          )
                          .map((field) => ({
                            value: field.id,
                            label: field.label,
                          }))}
                        label={t("RecordModel.triggerField")}
                      />

                      <FormSelect
                        id="triggerValue"
                        items={
                          store.model.fields
                            .find((field) => field.id === store.form.triggerFieldId)
                            ?.options.map((option) => ({
                              value: option.id,
                              label: option.label,
                            })) ?? []
                        }
                        label={t("RecordModel.triggerValue")}
                      />
                    </>
                  )}
                </>
              )}

              {store.form.valueType === "select" && (
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
                          items={CHIP_COLORS.map((color) => ({ value: color, label: t(`Common.colors.${color}`) }))}
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
              )}

              <FormSwitch id="required" label={t("RecordModel.required")} />

              {["text", "email", "phone", "url"].includes(store.form.valueType) && (
                <FormSwitch id="multiple" label={t("RecordModel.multipleValues")} />
              )}

              {store.original && <FormSwitch id="archived" label={t("RecordModel.archiveField")} />}

              {store.preview && <RecordConfigurationPreview model={store.model} preview={store.preview} />}
            </div>
          </AppCardBody>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
