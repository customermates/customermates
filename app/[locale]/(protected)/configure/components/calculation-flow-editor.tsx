"use client";

import {
  type LinkedFlow,
  aggregateOf,
  linkedExpression,
  linkedFlow,
  linkedTypeIds,
  calculationSentence,
  expressionSegments,
  sentenceText,
} from "@/features/records/calculation-sentence";
import type { ComponentProps, ReactNode } from "react";
import type {
  CalculationExpression,
  RecordField,
  RecordModelView,
  RecordScalar,
} from "@/features/records/record-model.schema";
import type { CalculationPreview } from "@/features/records/preview-calculation.interactor";
import type { FieldModalStore } from "./field-modal";
import type { CalculationPickerGroup, CalculationPickerItem, CalculationPickerPage } from "./calculation-picker";
import type { ExpressionPath, FlowIssue, Operator } from "./calculation-flow";

import { useEffect, useRef, useState } from "react";
import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { ChevronRight, Link2, Plus, Sigma, TextCursorInput, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { Button } from "@/components/ui/button";
import { ITEM_REVEAL_CLASS, ITEM_REVEAL_GROUP_CLASS } from "@/components/ui/item-actions";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRootStore } from "@/core/stores/root-store.provider";
import { draftCalculationAction } from "@/app/components/agent-chat/actions";
import { CALCULATION_DRAFT_DESCRIPTION_LIMIT } from "@/features/records/calculation-draft";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";
import { calculationResultType } from "@/features/records/record-model-validation";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { previewCalculationAction } from "@/app/[locale]/(protected)/records/actions";
import { RecordRowActions } from "@/app/[locale]/(protected)/records/[typeId]/components/record-row-actions";
import { ConfirmationSentenceView, referenceSentence } from "@/components/modal/confirmation-sentence";
import { RecordValue, useRecordValueFormat } from "@/components/records/record-value";

import {
  AGGREGATES,
  OPERATOR_GROUPS,
  UNSET,
  addInput,
  aggregateTypes,
  calculableFields,
  calculationDraft,
  expressionAt,
  extendStep,
  formulaInputs,
  formulaSteps,
  insertStep,
  isUnset,
  isVariadic,
  issueText,
  operandTypes,
  operatorArity,
  relationshipChoices,
  removeInput,
  removeStep,
  replaceExpression,
  stepInsertPath,
  withAggregate,
  withOperator,
} from "./calculation-flow";
import { CalculationLiteralInput } from "./calculation-literal-input";
import { CalculationPicker } from "./calculation-picker";
import { configureCardinality } from "./configure-graph-model";
import { ConfigureNode, ConfigureNodeHeader } from "./configure-node";

const FIELD_ICON = <TextCursorInput aria-hidden className="text-muted-foreground" />;

function FlowConnector({ children }: { children?: ReactNode }) {
  return (
    <div className="relative flex min-h-6 items-center justify-center py-1.5">
      <span aria-hidden className="absolute inset-y-0 start-1/2 w-px bg-muted-foreground/45" />

      {children && <div className="relative max-w-full rounded-md bg-background">{children}</div>}
    </div>
  );
}

function FlowNode({
  invalid,
  error,
  result,
  className,
  children,
  ...props
}: {
  invalid?: boolean;
  error?: string;
  result?: boolean;
  className?: string;
  children: ReactNode;
  "data-calculation-node": string;
}) {
  return (
    <ConfigureNode
      className={cn("group/row w-full", result && "border-primary", invalid && "border-destructive", className)}
      data-calculation-invalid={invalid || undefined}
      data-invalid={(invalid && result) || undefined}
      {...props}
    >
      {children}

      {invalid && error && <p className="border-t border-border px-3.5 py-2 text-xs text-destructive">{error}</p>}
    </ConfigureNode>
  );
}

function FlowRow({ end, className, children, ...props }: ComponentProps<"div"> & { end?: ReactNode }) {
  return (
    <div
      className={cn("flex min-h-10 items-center gap-2 border-t border-border px-3.5 py-2 text-xs", className)}
      data-calculation-row=""
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>

      {end && <div className="flex shrink-0 items-center gap-1 text-muted-foreground">{end}</div>}
    </div>
  );
}

function FlowChip({
  label,
  icon,
  placeholder,
  disabled,
  page,
  open,
  onOpenChange,
  invalid,
  ariaLabel,
  tooltip,
  ...props
}: {
  label: string;
  icon?: ReactNode;
  placeholder?: boolean;
  invalid?: boolean;
  disabled: boolean;
  page: CalculationPickerPage;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ariaLabel?: string;
  tooltip?: string;
  "data-calculation-chip": string;
}) {
  const chip = {
    className: cn("text-xs", placeholder && "text-muted-foreground"),
    "data-invalid": invalid || undefined,
    startContent: icon,
    tooltip,
    ...props,
  };
  if (disabled) {
    return (
      <AppChip aria-label={ariaLabel} {...chip}>
        {label}
      </AppChip>
    );
  }
  return (
    <CalculationPicker
      open={open}
      page={page}
      trigger={
        <ClickableChip aria-label={ariaLabel ?? `${page.title}: ${label}`} {...chip}>
          {label}
        </ClickableChip>
      }
      onOpenChange={onOpenChange}
    />
  );
}

function InsertStepChip({ position, onClick }: { position: number; onClick: () => void }) {
  const t = useTranslations();
  const label = t("RecordModel.calculationFlow.addStep");
  return (
    <ClickableChip
      aria-label={label}
      className="text-xs text-muted-foreground hover:text-foreground"
      data-calculation-insert-step={position}
      startContent={<Plus aria-hidden />}
      tooltip={label}
      variant="secondary"
      onClick={onClick}
    >
      {t("RecordModel.calculationFlow.stepChip")}
    </ClickableChip>
  );
}

function useFlowLabels(model: RecordModelView) {
  const t = useTranslations();
  const format = useRecordValueFormat();
  return {
    model,
    t: (key: string, values?: Record<string, string>) => t(key, values),
    format,
    operatorLabel: (operator: Operator) => t(`RecordModel.operators.${operator}`),
    typeLabel: (valueType: string) => t(`RecordModel.types.${valueType}`),
  };
}

function useCalculationExample(store: FieldModalStore) {
  const [preview, setPreview] = useState<{ key: string; data: CalculationPreview } | null>(null);
  const [recordId, setRecordId] = useState<string | undefined>(undefined);
  const complete = store.isCalculated && store.calculationIssues.length === 0;
  const key = JSON.stringify([store.typeId, toJS(store.form.expression), recordId]);
  useEffect(() => {
    if (!complete) return;
    let current = true;
    const timer = setTimeout(() => {
      const [typeId, expression, id] = JSON.parse(key) as [string, CalculationExpression, string | undefined];
      previewCalculationAction({ typeId, expression, ...(id ? { recordId: id } : {}) })
        .then((result) => {
          if (current && result.ok) setPreview({ key, data: result.data });
        })
        .catch(reportApplicationError);
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [complete, key]);
  const data = complete && preview?.key === key ? preview.data : null;
  const next = () => {
    if (!data?.recordId || data.examples.length < 2) return;
    const index = data.examples.findIndex((example) => example.recordId === data.recordId);
    setRecordId(data.examples[(index + 1) % data.examples.length].recordId);
  };
  return { complete, data, next };
}

const CalculationComposer = observer(function CalculationComposer({ store }: { store: FieldModalStore }) {
  const t = useTranslations();
  const root = useRootStore();
  const agent = root.agentChatEnabled ? root.agentChatStore : null;
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  if (!agent || agent.enabled !== true || agent.usage?.blockedReason || store.isDisabled) return null;
  if (refused) {
    return (
      <p className="pb-3 text-xs text-muted-foreground" data-calculation-composer="">
        {failure}
      </p>
    );
  }
  const cancel = () => {
    request.current += 1;
    setPending(false);
  };
  const submit = () =>
    runUserAction(async () => {
      const text = description.trim();
      if (!text || pending) return;
      const id = ++request.current;
      const target = store.original?.id ?? null;
      setPending(true);
      setFailure(null);
      try {
        const result = await draftCalculationAction({
          typeId: store.typeId,
          description: text,
          ...(target ? { fieldId: target } : {}),
        });
        if (id !== request.current || !store.isOpen || (store.original?.id ?? null) !== target) return;
        if (!result.ok) {
          setFailure(
            result.code === "agentLimitReached"
              ? t("Common.errors.agentLimitReached")
              : t("RecordModel.calculationFlow.describe.unavailable"),
          );
          setRefused(true);
        } else if (!result.data.draft) setFailure(t("RecordModel.calculationFlow.describe.failed"));
        else store.applyCalculationDraft(result.data.draft);
      } finally {
        if (id === request.current) setPending(false);
      }
    });
  return (
    <div className="space-y-1.5 pb-3" data-calculation-composer="">
      <div className="relative">
        <Input
          aria-busy={pending}
          aria-label={t("RecordModel.calculationFlow.describe.label")}
          className={cn(pending && "pe-9")}
          maxLength={CALCULATION_DRAFT_DESCRIPTION_LIMIT}
          placeholder={t("RecordModel.calculationFlow.describe.placeholder")}
          value={description}
          onChange={(event) => {
            if (pending) cancel();
            setDescription(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
            event.preventDefault();
            submit();
          }}
        />

        {pending && (
          <div className="absolute end-1 top-1/2 flex -translate-y-1/2 items-center">
            <IconButton icon={X} label={t("RecordModel.calculationFlow.describe.stop")} onClick={cancel} />
          </div>
        )}
      </div>

      {pending && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner aria-label={t("RecordModel.calculationFlow.describe.pending")} size="sm" />

          <span aria-hidden>{t("RecordModel.calculationFlow.describe.pending")}</span>
        </p>
      )}

      {!pending && failure && <p className="text-xs text-muted-foreground">{failure}</p>}
    </div>
  );
});

export const CalculationFlow = observer(function CalculationFlow({ store }: { store: FieldModalStore }) {
  const t = useTranslations();
  const model = store.model;
  const typeId = store.typeId;
  const disabled = store.isDisabled;
  const source = store.calculationSource;
  const expression = store.form.expression;
  const showIssues = Boolean(store.getError("expression"));
  const issues = store.calculationIssues;
  const list = model.types.find((type) => type.id === typeId);
  const fieldLabel = store.form.label.trim() || t("RecordModel.calculationFlow.thisField");
  const { typeLabel, ...labels } = useFlowLabels(model);
  const operatorLabel = labels.operatorLabel;
  const issueMessage = (issue: FlowIssue) => issueText(issue, labels.t, operatorLabel);
  const listIcon = (id: string | undefined) => (
    <RecordTypeGlyph icon={model.types.find((type) => type.id === id)?.icon} />
  );
  const change = (next: CalculationExpression) => store.onChange("expression", next);
  const example = useCalculationExample(store);
  const [operatorPicker, setOperatorPicker] = useState<string | null>(null);
  useEffect(() => {
    store.issueMessage = (issue) => issueText(issue, (key, values) => t(key, values), operatorLabel);
  }, [store, t]);

  const fieldItems = (
    fieldTypeId: string,
    types: ReturnType<typeof operandTypes>,
    current: CalculationExpression,
    pick: (next: CalculationExpression) => void,
  ): CalculationPickerItem[] => [
    ...calculableFields(model, fieldTypeId, types, store.original?.id).map((field) => ({
      id: field.id,
      label: field.label,
      icon: FIELD_ICON,
      checked: current.kind === "field" && current.fieldId === field.id,
      onSelect: () => pick({ kind: "field", fieldId: field.id }),
    })),
    ...(!types || types.includes("number")
      ? calculableFields(model, fieldTypeId, ["select"], store.original?.id).flatMap((field) =>
          [...new Set(field.options.flatMap((option) => option.attributes.map((attribute) => attribute.key)))].map(
            (attribute) => ({
              id: `${field.id}:${attribute}`,
              label: `${field.label} ${attribute}`,
              icon: FIELD_ICON,
              checked:
                current.kind === "optionAttribute" && current.fieldId === field.id && current.attribute === attribute,
              onSelect: () => pick({ kind: "optionAttribute", fieldId: field.id, attribute }),
            }),
          ),
        )
      : []),
  ];

  const fieldsGroup = (
    fieldTypeId: string,
    types: ReturnType<typeof operandTypes>,
    current: CalculationExpression,
    pick: (next: CalculationExpression) => void,
  ): CalculationPickerGroup => ({
    heading:
      model.types.find((type) => type.id === fieldTypeId)?.pluralLabel ??
      t("RecordModel.calculationFlow.picker.fields"),
    items: fieldItems(fieldTypeId, types, current, pick),
  });

  const fixedValueItem = (
    current: CalculationExpression,
    types: ReturnType<typeof operandTypes>,
    pick: (next: CalculationExpression) => void,
  ): CalculationPickerItem => ({
    id: "fixed-value",
    label: t("RecordModel.calculationFlow.picker.fixedValue"),
    page: {
      title: t("RecordModel.calculationFlow.picker.fixedValue"),
      content: (close) => (
        <FixedValue
          close={close}
          currency={store.form.currency}
          initial={current.kind === "literal" && current.value ? current.value : defaultLiteral(types)}
          model={model}
          typeId={typeId}
          onPick={(value) => pick({ kind: "literal", value })}
        />
      ),
    },
  });

  const argumentPage = (
    title: string,
    current: CalculationExpression,
    types: ReturnType<typeof operandTypes>,
    pick: (next: CalculationExpression) => void,
  ): CalculationPickerPage => ({
    title,
    groups: [
      fieldsGroup(typeId, types, current, pick),
      {
        heading: t("RecordModel.calculationFlow.picker.goFurther"),
        items: relationshipChoices(typeId, model, true).map((choice) => ({
          id: `${choice.relation.id}:${choice.direction}`,
          label: choice.label,
          icon: listIcon(choice.targetTypeId),
          page: {
            title: choice.label,
            groups: [
              fieldsGroup(
                choice.targetTypeId,
                types,
                current.kind === "related" ? linkedFlow(current).value : UNSET,
                (value) =>
                  pick({
                    kind: "related",
                    relationId: choice.relation.id,
                    direction: choice.direction,
                    reducer: "one",
                    expression: value,
                  }),
              ),
            ],
          },
        })),
      },
      { heading: "", items: [fixedValueItem(current, types, pick)] },
    ],
  });

  const leafLabel = (leaf: CalculationExpression) =>
    isUnset(leaf) ? t("RecordModel.calculationFlow.pickValue") : sentenceText(expressionSegments(leaf, typeId, labels));
  const leafChip = (path: ExpressionPath, leaf: CalculationExpression, tooltip?: string) => {
    const parent = path.length ? expressionAt(expression, path.slice(0, -1)) : null;
    const types = parent?.kind === "operation" ? operandTypes(parent.operator, path.at(-1) ?? 0) : null;
    const unset = isUnset(leaf);
    const page = argumentPage(t("RecordModel.calculationFlow.pickValue"), leaf, types, (next) =>
      change(replaceExpression(expression, path, next)),
    );
    const removable =
      parent?.kind === "operation" &&
      isVariadic(parent.operator) &&
      parent.arguments.length > operatorArity(parent.operator);
    return (
      <FlowChip
        data-calculation-chip={unset ? "pick-value" : "value"}
        disabled={disabled}
        invalid={showIssues && unset}
        label={leafLabel(leaf)}
        page={
          removable
            ? {
                ...page,
                groups: [
                  ...(page.groups ?? []),
                  {
                    heading: "",
                    items: [
                      {
                        id: "remove-input",
                        label: t("RecordModel.removeInput"),
                        destructive: true,
                        onSelect: () =>
                          change(
                            replaceExpression(expression, path.slice(0, -1), {
                              ...parent,
                              arguments: parent.arguments.filter((_, index) => index !== path.at(-1)),
                            }),
                          ),
                      },
                    ],
                  },
                ],
              }
            : page
        }
        placeholder={unset}
        tooltip={tooltip}
      />
    );
  };

  const resultType = store.derivedType;
  const resultIssue = issues.find((issue) => issue.node === "result");
  const resultNode = (
    <FlowNode
      result
      data-calculation-node="result"
      error={resultIssue && issueMessage(resultIssue)}
      invalid={showIssues && Boolean(resultIssue)}
    >
      <ConfigureNodeHeader
        compact
        icon={Sigma}
        kind={resultType ? typeLabel(resultType.valueType) : undefined}
        name={fieldLabel}
      />

      {example.data && (
        <div data-calculation-example="">
          {example.data?.value === null || example.data?.recordId === null ? (
            <FlowRow>
              <span className="text-muted-foreground">
                {example.data.value?.state === "restricted"
                  ? t("RecordModel.calculationFlow.example.restricted")
                  : example.data.recordId === null
                    ? t("RecordModel.calculationFlow.example.none")
                    : t("RecordModel.calculationFlow.example.unavailable")}
              </span>
            </FlowRow>
          ) : (
            <FlowRow
              end={
                <>
                  {example.data?.value && (
                    <RecordValue
                      field={{
                        ...store.inputDefinition,
                        valueType: resultType?.valueType ?? "text",
                        multiple: false,
                        format: {
                          currency: resultType?.valueType === "currency" ? store.form.currency.toUpperCase() : null,
                          decimalPlaces:
                            store.form.decimalPlaces.trim() === "" ? null : Number(store.form.decimalPlaces),
                        },
                      }}
                      result={example.data.value}
                    />
                  )}

                  {(example.data?.examples.length ?? 0) > 1 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("RecordModel.calculationFlow.example.next")}
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                          onClick={example.next}
                        >
                          <ChevronRight aria-hidden />
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent>{t("RecordModel.calculationFlow.example.next")}</TooltipContent>
                    </Tooltip>
                  )}
                </>
              }
            >
              <span className="truncate font-medium">
                {example.data?.examples.find((candidate) => candidate.recordId === example.data?.recordId)?.title ??
                  t("RecordModel.calculationFlow.example.title")}
              </span>
            </FlowRow>
          )}
        </div>
      )}
    </FlowNode>
  );

  const issue = issues[0];
  const behavior = store.draftBehavior;
  const described =
    issue || !behavior
      ? null
      : calculationSentence({
          model,
          field: { label: fieldLabel, typeId, behavior },
          t: labels.t,
          format: labels.format,
        });
  const savedClause = described?.saved;
  const saved = [
    ...(savedClause?.kind === "create" ? [t("RecordModel.calculationFlow.sentence.savedOnCreate")] : []),
    ...(savedClause?.kind === "explicit" ? [t("RecordModel.calculationFlow.sentence.savedOnRequest")] : []),
    ...(savedClause?.kind === "whenChanged" && savedClause.field
      ? [
          savedClause.value
            ? t("RecordModel.calculationFlow.sentence.savedWhenChangedTo", {
                field: savedClause.field.label,
                value: savedClause.value,
              })
            : t("RecordModel.calculationFlow.sentence.savedWhenChanged", { field: savedClause.field.label }),
        ]
      : []),
    ...(described?.typeOver ? [t("RecordModel.calculationFlow.sentence.typeOver")] : []),
  ];

  return (
    <section aria-label={t("RecordModel.fieldTabs.calculation")} className="min-w-0" data-calculation-flow={source}>
      <CalculationComposer store={store} />

      {source === "formula" ? (
        <FormulaFlow
          disabled={disabled}
          expression={expression}
          issueMessage={issueMessage}
          leafChip={leafChip}
          leafLabel={leafLabel}
          list={list}
          operatorLabel={operatorLabel}
          operatorPicker={operatorPicker}
          setOperatorPicker={setOperatorPicker}
          showIssues={showIssues}
          typeLabel={typeLabel}
          typeOf={(path) => store.stepType(path)}
          onChange={change}
        />
      ) : (
        <LinkedFlowView
          describe={(value, valueTypeId) => sentenceText(expressionSegments(value, valueTypeId, labels))}
          disabled={disabled}
          fieldsGroup={fieldsGroup}
          flow={linkedFlow(expression)}
          issueMessage={issueMessage}
          issues={issues}
          lookup={source === "lookup"}
          model={model}
          showIssues={showIssues}
          typeId={typeId}
          typeLabel={typeLabel}
          onChange={(flow) => change(linkedExpression(flow))}
        />
      )}

      {source !== "formula" && <FlowConnector />}

      {resultNode}

      {!(showIssues && issues.length) && (
        <p className="px-3.5 pt-3 text-sm text-muted-foreground" data-calculation-sentence="">
          {issue ? (
            issueMessage(issue)
          ) : (
            <ConfirmationSentenceView sentence={referenceSentence(described?.sentence ?? [])} />
          )}

          {saved.map((text) => ` ${text}`).join("")}
        </p>
      )}
    </section>
  );
});

const NO_CHANGE = () => undefined;

export function CalculationFlowView({ field, model }: { field: RecordField; model: RecordModelView }) {
  const t = useTranslations();
  const { typeLabel, ...labels } = useFlowLabels(model);
  if (field.behavior.kind === "input") return null;
  const { source, expression } = calculationDraft(field.behavior);
  const typeId = field.typeId;
  const describe = (value: CalculationExpression, valueTypeId: string) =>
    sentenceText(expressionSegments(value, valueTypeId, labels));
  return (
    <section
      aria-label={t("RecordModel.fieldTabs.calculation")}
      className="min-w-0"
      data-calculation-flow={source}
      data-calculation-readonly=""
    >
      {source === "formula" ? (
        <FormulaFlow
          disabled
          expression={expression}
          issueMessage={() => ""}
          leafChip={(_, leaf, tooltip) => (
            <AppChip
              className="text-xs"
              data-calculation-chip={isUnset(leaf) ? "pick-value" : "value"}
              tooltip={tooltip}
            >
              {isUnset(leaf) ? t("RecordModel.calculationFlow.pickValue") : describe(leaf, typeId)}
            </AppChip>
          )}
          leafLabel={(leaf) => (isUnset(leaf) ? t("RecordModel.calculationFlow.pickValue") : describe(leaf, typeId))}
          list={model.types.find((type) => type.id === typeId)}
          operatorLabel={labels.operatorLabel}
          operatorPicker={null}
          setOperatorPicker={NO_CHANGE}
          showIssues={false}
          typeLabel={typeLabel}
          typeOf={(path) => {
            const step = expressionAt(expression, path);
            return step ? calculationResultType(step, typeId, model) : null;
          }}
          onChange={NO_CHANGE}
        />
      ) : (
        <LinkedFlowView
          disabled
          describe={describe}
          fieldsGroup={() => ({ heading: "", items: [] })}
          flow={linkedFlow(expression)}
          issueMessage={() => ""}
          issues={[]}
          lookup={source === "lookup"}
          model={model}
          showIssues={false}
          typeId={typeId}
          typeLabel={typeLabel}
          onChange={NO_CHANGE}
        />
      )}

      {source !== "formula" && <FlowConnector />}

      <FlowNode result data-calculation-node="result">
        <ConfigureNodeHeader compact icon={Sigma} kind={typeLabel(field.valueType)} name={field.label} />
      </FlowNode>
    </section>
  );
}

function defaultLiteral(types: ReturnType<typeof operandTypes>): RecordScalar {
  if (types?.includes("boolean")) return { kind: "boolean", value: false };
  if (types?.includes("text")) return { kind: "text", value: "" };
  if (types?.includes("date")) return { kind: "date", value: new Date().toISOString().slice(0, 10) };
  return { kind: "decimal", value: "0", currency: null };
}

function FixedValue({
  initial,
  model,
  typeId,
  currency,
  close,
  onPick,
}: {
  initial: RecordScalar;
  model: RecordModelView;
  typeId: string;
  currency: string;
  close: () => void;
  onPick: (value: RecordScalar) => void;
}) {
  const t = useTranslations();
  const [value, setValue] = useState<RecordScalar | null>(initial);
  return (
    <div className="space-y-3">
      <CalculationLiteralInput
        currency={currency}
        id="calculation-fixed-value"
        model={model}
        typeId={typeId}
        value={value}
        onChange={setValue}
      />

      <Button
        className="w-full"
        disabled={!value}
        size="sm"
        type="button"
        onClick={() => {
          if (value) onPick(value);
          close();
        }}
      >
        {t("RecordModel.calculationFlow.picker.use")}
      </Button>
    </div>
  );
}

function FormulaFlow({
  expression,
  list,
  disabled,
  showIssues,
  leafChip,
  leafLabel,
  operatorLabel,
  typeLabel,
  typeOf,
  issueMessage,
  operatorPicker,
  setOperatorPicker,
  onChange,
}: {
  expression: CalculationExpression;
  list: RecordModelView["types"][number] | undefined;
  disabled: boolean;
  showIssues: boolean;
  leafChip: (path: ExpressionPath, leaf: CalculationExpression, tooltip?: string) => ReactNode;
  leafLabel: (leaf: CalculationExpression) => string;
  operatorLabel: (operator: Operator) => string;
  typeLabel: (valueType: string) => string;
  typeOf: (path: ExpressionPath) => string | null;
  issueMessage: (issue: FlowIssue) => string;
  operatorPicker: string | null;
  setOperatorPicker: (key: string | null) => void;
  onChange: (expression: CalculationExpression) => void;
}) {
  const t = useTranslations();
  const steps = formulaSteps(expression);
  const inputs = formulaInputs(expression);
  const defaultOperator = (path: ExpressionPath): Operator => {
    const type = typeOf(path);
    return type === "text" ? "concat" : type === "boolean" ? "and" : "add";
  };
  const rootInvalid = showIssues && isUnset(expression);
  const symbols: Record<Operator, string> = {
    add: "+",
    subtract: "−",
    multiply: "×",
    divide: "÷",
    equal: "=",
    lessThan: "<",
    greaterThan: ">",
    concat: "&",
    daysBetween: "→",
    and: t("RecordModel.calculationFlow.symbols.and"),
    or: t("RecordModel.calculationFlow.symbols.or"),
    not: t("RecordModel.calculationFlow.symbols.not"),
    if: t("RecordModel.calculationFlow.symbols.if"),
    coalesce: t("RecordModel.calculationFlow.symbols.coalesce"),
    lower: t("RecordModel.calculationFlow.symbols.lower"),
    upper: t("RecordModel.calculationFlow.symbols.upper"),
    trim: t("RecordModel.calculationFlow.symbols.trim"),
  };
  const operationHeadings = {
    math: t("RecordModel.calculationFlow.picker.operations.math"),
    compare: t("RecordModel.calculationFlow.picker.operations.compare"),
    logic: t("RecordModel.calculationFlow.picker.operations.logic"),
    text: t("RecordModel.calculationFlow.picker.operations.text"),
    dates: t("RecordModel.calculationFlow.picker.operations.dates"),
  };
  const stepName = (index: number) => t("RecordModel.calculationFlow.step", { number: String(index + 1) });
  const insertAt = (position: number) => {
    const path = stepInsertPath(steps, position);
    onChange(insertStep(expression, path, defaultOperator(path)));
  };
  const connector = (position: number) => (
    <FlowConnector>
      {!disabled && <InsertStepChip position={position} onClick={() => insertAt(position)} />}
    </FlowConnector>
  );
  const operatorChip = (step: (typeof steps)[number], key: string, position: number) => {
    const chipKey = position === 0 ? key : `${key}:${position}`;
    return (
      <FlowChip
        ariaLabel={t("RecordModel.operationNamed", { operation: operatorLabel(step.operator) })}
        data-calculation-chip="operation"
        disabled={disabled}
        label={symbols[step.operator]}
        open={operatorPicker === chipKey}
        page={{
          title: t("RecordModel.operation"),
          groups: OPERATOR_GROUPS.map(({ group, operators }) => ({
            heading: operationHeadings[group],
            items: operators.map((operator) => ({
              id: operator,
              label: operatorLabel(operator),
              checked: operator === step.operator,
              onSelect: () => {
                const current = expressionAt(expression, step.path);
                if (current?.kind === "operation")
                  onChange(replaceExpression(expression, step.path, withOperator(current, operator)));
              },
            })),
          })),
        }}
        tooltip={operatorLabel(step.operator)}
        onOpenChange={(open) => setOperatorPicker(open ? chipKey : null)}
      />
    );
  };
  const operand = (argument: (typeof steps)[number]["arguments"][number]) =>
    argument.step === null ? (
      leafChip(argument.path, argument.expression)
    ) : (
      <AppChip className="text-xs" data-calculation-chip="step">
        {stepName(argument.step)}
      </AppChip>
    );
  const word = (text: string) => <span className="text-xs text-muted-foreground">{text}</span>;
  const stepLine = (step: (typeof steps)[number], key: string): ReactNode[] => {
    const [first, ...rest] = step.arguments;
    if (step.operator === "if") {
      return [
        operatorChip(step, key, 0),
        first && operand(first),
        word(t("RecordModel.calculationFlow.symbols.then")),
        rest[0] && operand(rest[0]),
        word(t("RecordModel.calculationFlow.symbols.otherwise")),
        rest[1] && operand(rest[1]),
      ];
    }
    if (operatorArity(step.operator) === 1) return [operatorChip(step, key, 0), first && operand(first)];
    return step.arguments.flatMap((argument, index) =>
      index === 0 ? [operand(argument)] : [operatorChip(step, key, index - 1), operand(argument)],
    );
  };
  return (
    <>
      <FlowNode data-calculation-node="inputs" error={issueMessage({ node: "input" })} invalid={rootInvalid}>
        <ConfigureNodeHeader
          compact
          icon={recordTypeIcon(list?.icon ?? "")}
          kind={list?.pluralLabel}
          name={t("RecordModel.calculationFlow.inputs")}
        />

        <FlowRow aria-label={t("RecordModel.calculationFlow.inputs")} data-calculation-inputs="" role="group">
          {inputs.map((input) => {
            const inputType = typeOf(input.path);
            return (
              <span
                key={input.path.join(".")}
                className={cn(ITEM_REVEAL_GROUP_CLASS, "relative flex max-w-full min-w-0 items-center")}
                data-calculation-input=""
              >
                {leafChip(input.path, input.expression, inputType ? typeLabel(inputType) : undefined)}

                {!disabled && (
                  <Button
                    aria-label={t("RecordModel.calculationFlow.removeInputNamed", {
                      input: leafLabel(input.expression),
                    })}
                    className={cn(
                      "absolute -end-2.5 -top-2.5 rounded-full border border-border bg-background",
                      ITEM_REVEAL_CLASS,
                    )}
                    data-calculation-remove-input=""
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                    onClick={() => onChange(removeInput(expression, input.path))}
                  >
                    <X aria-hidden />
                  </Button>
                )}
              </span>
            );
          })}

          {!disabled && (
            <Button
              className="text-muted-foreground"
              data-calculation-add-input=""
              size="xs"
              type="button"
              variant="ghost"
              onClick={() => onChange(addInput(expression, defaultOperator([])))}
            >
              <Plus aria-hidden />

              {t("RecordModel.addInput")}
            </Button>
          )}
        </FlowRow>
      </FlowNode>

      {connector(0)}

      {steps.map((step, number) => {
        const key = step.path.join(".");
        const invalid = showIssues && step.arguments.some((argument) => isUnset(argument.expression));
        const stepType = typeOf(step.path);
        const extendLabel = t("RecordModel.calculationFlow.extendStep", { step: stepName(number) });
        return (
          <div key={`${key}:${step.operator}`}>
            <FlowNode
              className={ITEM_REVEAL_GROUP_CLASS}
              data-calculation-node="step"
              error={issueMessage({ node: "step", path: step.path, operator: step.operator })}
              invalid={invalid}
            >
              <ConfigureNodeHeader
                compact
                action={
                  disabled ? undefined : (
                    <RecordRowActions
                      contextAction={{
                        label: t("RecordModel.calculationFlow.changeOperation"),
                        icon: Sigma,
                        onSelect: () => setOperatorPicker(key),
                      }}
                      deleteLabel={t("RecordModel.calculationFlow.removeStep")}
                      name={stepName(number)}
                      onDelete={() => onChange(removeStep(expression, step.path))}
                    />
                  )
                }
                icon={Sigma}
                kind={stepType ? typeLabel(stepType) : undefined}
                name={stepName(number)}
              />

              <FlowRow aria-label={operatorLabel(step.operator)} data-calculation-line="" role="group">
                {stepLine(step, key).map(
                  (part, index) =>
                    part && (
                      <span key={index} className="flex max-w-full min-w-0">
                        {part}
                      </span>
                    ),
                )}

                {!disabled && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={extendLabel}
                        className={ITEM_REVEAL_CLASS}
                        data-calculation-extend-step=""
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          onChange(
                            extendStep(
                              expression,
                              step.path,
                              step.operator === "add" || step.operator === "multiply"
                                ? step.operator
                                : defaultOperator(step.path),
                            ),
                          )
                        }
                      >
                        <Plus aria-hidden />
                      </Button>
                    </TooltipTrigger>

                    <TooltipContent>{extendLabel}</TooltipContent>
                  </Tooltip>
                )}
              </FlowRow>
            </FlowNode>

            {connector(number + 1)}
          </div>
        );
      })}
    </>
  );
}

function LinkedFlowView({
  flow,
  typeId,
  model,
  lookup,
  disabled,
  showIssues,
  issues,
  issueMessage,
  typeLabel,
  fieldsGroup,
  describe,
  onChange,
}: {
  flow: LinkedFlow;
  typeId: string;
  model: RecordModelView;
  lookup: boolean;
  disabled: boolean;
  showIssues: boolean;
  issues: FlowIssue[];
  issueMessage: (issue: FlowIssue) => string;
  typeLabel: (valueType: string) => string;
  describe: (expression: CalculationExpression, typeId: string) => string;
  fieldsGroup: (
    fieldTypeId: string,
    types: ReturnType<typeof operandTypes>,
    current: CalculationExpression,
    pick: (next: CalculationExpression) => void,
  ) => CalculationPickerGroup;
  onChange: (flow: LinkedFlow) => void;
}) {
  const t = useTranslations();
  const typeIds = linkedTypeIds(flow, typeId, model);
  const typeOf = (id: string | undefined) => model.types.find((type) => type.id === id);
  const reducer = aggregateOf(flow);
  const aggregate = reducer === "one" ? "sum" : reducer;
  const lastTypeId = typeIds.at(-1) ?? typeId;
  const [openHop, setOpenHop] = useState<number | null>(null);
  const terminal = flow.value;
  const valueField =
    terminal.kind === "field" ? model.fields.find((field) => field.id === terminal.fieldId) : undefined;
  const endLabel = (relation: RecordModelView["relationships"][number], direction: "outgoing" | "incoming") => {
    const outgoing = direction === "outgoing";
    const cardinality = configureCardinality(
      outgoing
        ? relation
        : { sourceCardinality: relation.targetCardinality, targetCardinality: relation.sourceCardinality },
    );
    return `${outgoing ? relation.sourceLabel : relation.targetLabel} · ${t(`RecordModel.cardinality.${cardinality}`)}`;
  };
  const relationshipIssue = issues.find((issue) => issue.node === "relationship");
  const valueIssue = issues.find((issue) => issue.node === "value");
  const aggregateLabels = {
    sum: t("RecordModel.calculationFlow.aggregates.sum"),
    average: t("RecordModel.calculationFlow.aggregates.average"),
    min: t("RecordModel.calculationFlow.aggregates.min"),
    max: t("RecordModel.calculationFlow.aggregates.max"),
    count: t("RecordModel.calculationFlow.aggregates.count"),
  };
  const relationshipPage = (index: number): CalculationPickerPage => ({
    title: t("RecordModel.calculationFlow.pickRelationship"),
    groups: [
      {
        heading: t("RecordModel.calculationFlow.picker.relationships"),
        items: relationshipChoices(typeIds[index], model, lookup).map((choice) => ({
          id: `${choice.relation.id}:${choice.direction}`,
          label: endLabel(choice.relation, choice.direction),
          icon: <RecordTypeGlyph icon={typeOf(choice.targetTypeId)?.icon} />,
          checked:
            flow.hops[index]?.relationId === choice.relation.id && flow.hops[index]?.direction === choice.direction,
          onSelect: () => {
            const same = typeIds[index + 1] === choice.targetTypeId;
            const hops = [
              ...flow.hops.slice(0, index),
              {
                relationId: choice.relation.id,
                direction: choice.direction,
                reducer: lookup || choice.single ? ("one" as const) : aggregate,
              },
              ...(same ? flow.hops.slice(index + 1) : []),
            ];
            onChange(withAggregate({ hops, value: same ? flow.value : UNSET }, lookup ? "one" : aggregate));
          },
        })),
      },
    ],
  });
  const relationshipChip = (index: number) => {
    const hop = flow.hops[index];
    const relation = model.relationships.find((candidate) => candidate.id === hop?.relationId);
    return (
      <FlowChip
        data-calculation-chip={relation ? "relationship" : "pick-relationship"}
        disabled={disabled}
        invalid={showIssues && !relation && Boolean(relationshipIssue)}
        label={relation ? endLabel(relation, hop.direction) : t("RecordModel.calculationFlow.pickRelationship")}
        open={openHop === index}
        page={relationshipPage(index)}
        placeholder={!relation}
        onOpenChange={(open) => setOpenHop(open ? index : null)}
      />
    );
  };
  const goFurther = {
    heading: t("RecordModel.calculationFlow.picker.goFurther"),
    items: (reducer === "average" ? [] : relationshipChoices(lastTypeId, model, lookup)).map((choice) => ({
      id: `further:${choice.relation.id}:${choice.direction}`,
      label: choice.label,
      icon: <RecordTypeGlyph icon={typeOf(choice.targetTypeId)?.icon} />,
      onSelect: () =>
        onChange(
          withAggregate(
            {
              hops: [
                ...flow.hops,
                {
                  relationId: choice.relation.id,
                  direction: choice.direction,
                  reducer: lookup || choice.single ? ("one" as const) : aggregate,
                },
              ],
              value: UNSET,
            },
            lookup ? "one" : aggregate,
          ),
        ),
    })),
  };
  const valueUnset = isUnset(flow.value);
  const valueChip = (
    <FlowChip
      data-calculation-chip={valueUnset ? "pick-field" : "value"}
      disabled={disabled}
      icon={
        valueUnset || (flow.value.kind !== "field" && flow.value.kind !== "optionAttribute") ? undefined : (
          <TextCursorInput aria-hidden className="text-muted-foreground" />
        )
      }
      invalid={showIssues && Boolean(valueIssue)}
      label={valueUnset ? t("RecordModel.calculationFlow.pickField") : describe(flow.value, lastTypeId)}
      page={{
        title: t("RecordModel.calculationFlow.pickField"),
        groups: [
          fieldsGroup(lastTypeId, aggregateTypes(reducer), flow.value, (value) => onChange({ ...flow, value })),
          goFurther,
        ],
      }}
      placeholder={valueUnset}
    />
  );
  const aggregateChip = (
    <FlowChip
      data-calculation-chip="aggregate"
      disabled={disabled}
      label={aggregateLabels[aggregate]}
      page={{
        title: t("RecordModel.aggregation"),
        groups: [
          {
            heading: t("RecordModel.aggregation"),
            items: AGGREGATES.filter((candidate) => candidate !== "average" || flow.hops.length < 2).map(
              (candidate) => ({
                id: candidate,
                label: aggregateLabels[candidate],
                checked: candidate === aggregate,
                onSelect: () => {
                  const next = withAggregate(flow, candidate);
                  const types = aggregateTypes(candidate);
                  onChange(
                    valueField && types && !types.includes(valueField.valueType) ? { ...next, value: UNSET } : next,
                  );
                },
              }),
            ),
          },
        ],
      }}
    />
  );
  const thisList = typeOf(typeId);
  return (
    <>
      <FlowNode data-calculation-node="list">
        <ConfigureNodeHeader
          compact
          icon={recordTypeIcon(thisList?.icon ?? "")}
          kind={t("RecordModel.calculationFlow.thisList")}
          name={thisList?.pluralLabel ?? ""}
        />
      </FlowNode>

      {flow.hops.length === 0 && (
        <>
          <FlowConnector />

          <FlowNode
            data-calculation-node="pick-relationship"
            error={relationshipIssue && issueMessage(relationshipIssue)}
            invalid={showIssues && Boolean(relationshipIssue)}
          >
            <ConfigureNodeHeader compact icon={Link2} name={t("RecordModel.calculationFlow.linkedList")} />

            <FlowRow>{relationshipChip(0)}</FlowRow>
          </FlowNode>
        </>
      )}

      {flow.hops.map((hop, index) => {
        const target = typeOf(typeIds[index + 1]);
        const last = index === flow.hops.length - 1;
        return (
          <div key={`${index}:${hop.relationId}`}>
            <FlowConnector>{relationshipChip(index)}</FlowConnector>

            <FlowNode
              data-calculation-node="linked"
              error={last && valueIssue ? issueMessage(valueIssue) : undefined}
              invalid={last && showIssues && Boolean(valueIssue)}
            >
              <ConfigureNodeHeader
                compact
                action={
                  index > 0 && !disabled ? (
                    <RecordRowActions
                      name={target?.pluralLabel ?? ""}
                      onDelete={() =>
                        onChange(withAggregate({ hops: flow.hops.slice(0, index), value: UNSET }, reducer))
                      }
                      onOpen={() => setOpenHop(index)}
                    />
                  ) : undefined
                }
                icon={recordTypeIcon(target?.icon ?? "")}
                kind={t("RecordModel.calculationFlow.linkedList")}
                name={target?.pluralLabel ?? ""}
              />

              {last && (
                <FlowRow
                  aria-label={target?.pluralLabel ?? ""}
                  end={valueField && reducer !== "count" ? typeLabel(valueField.valueType) : undefined}
                  role="group"
                >
                  {lookup ? (
                    <>
                      <span className="text-muted-foreground">{t("RecordModel.calculationFlow.take")}</span>

                      {valueChip}
                    </>
                  ) : reducer === "count" ? (
                    <>
                      {aggregateChip}

                      <span className="min-w-0 truncate text-muted-foreground">
                        {t("RecordModel.calculationFlow.ofLinked", { list: target?.pluralLabel ?? "" })}
                      </span>
                    </>
                  ) : (
                    <>
                      {aggregateChip}

                      <span className="text-muted-foreground">{t("RecordModel.calculationFlow.of")}</span>

                      {valueChip}
                    </>
                  )}
                </FlowRow>
              )}
            </FlowNode>
          </div>
        );
      })}
    </>
  );
}
