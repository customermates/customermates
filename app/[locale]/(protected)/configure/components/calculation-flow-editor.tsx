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
import type { ReactNode } from "react";
import type { CalculationExpression, RecordModelView, RecordScalar } from "@/features/records/record-model.schema";
import type { CalculationPreview } from "@/features/records/preview-calculation.interactor";
import type { FieldModalStore } from "./field-modal";
import type { CalculationPickerGroup, CalculationPickerItem, CalculationPickerPage } from "./calculation-picker";
import type { ExpressionPath, FlowIssue, Operator } from "./calculation-flow";

import { useEffect, useState } from "react";
import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { ChevronRight, Plus, Sigma, TextCursorInput } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useRootStore } from "@/core/stores/root-store.provider";
import { draftCalculationAction } from "@/app/components/agent-chat/actions";
import { CALCULATION_DRAFT_DESCRIPTION_LIMIT } from "@/features/records/calculation-draft";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { previewCalculationAction } from "@/app/[locale]/(protected)/records/actions";
import { RecordRowActions } from "@/app/[locale]/(protected)/records/[typeId]/components/record-row-actions";
import { CalculationSentenceText } from "@/components/records/calculation-sentence-text";
import { RecordValue } from "@/app/[locale]/(protected)/records/[typeId]/components/record-value";

import {
  AGGREGATES,
  OPERATOR_GROUPS,
  UNSET,
  addInput,
  addStep,
  aggregateTypes,
  calculableFields,
  expressionAt,
  formulaInputs,
  formulaSteps,
  isUnset,
  isVariadic,
  issueText,
  operandTypes,
  operatorArity,
  relationshipChoices,
  removeStep,
  replaceExpression,
  withAggregate,
  withOperator,
} from "./calculation-flow";
import { CalculationLiteralInput } from "./calculation-literal-input";
import { CalculationPicker } from "./calculation-picker";
import { configureCardinality } from "./configure-graph-model";
import { ConfigureNode, ConfigureNodeHeader, ConfigureNodeRows, ConfigureNodeStaticRow } from "./configure-node";

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
  children,
  ...props
}: {
  invalid?: boolean;
  error?: string;
  result?: boolean;
  children: ReactNode;
  "data-calculation-node": string;
}) {
  return (
    <ConfigureNode
      className={cn("group/row w-full", result && "border-primary", invalid && "border-destructive")}
      data-calculation-invalid={invalid || undefined}
      data-invalid={(invalid && result) || undefined}
      {...props}
    >
      {children}

      {invalid && error && <p className="border-t border-border px-3.5 py-2 text-xs text-destructive">{error}</p>}
    </ConfigureNode>
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
  "data-calculation-chip": string;
}) {
  const chip = {
    className: cn(placeholder && "text-muted-foreground"),
    "data-invalid": invalid || undefined,
    startContent: icon,
    ...props,
  };
  if (disabled) return <AppChip {...chip}>{label}</AppChip>;
  return (
    <CalculationPicker
      open={open}
      page={page}
      trigger={
        <ClickableChip aria-label={`${page.title}: ${label}`} {...chip}>
          {label}
        </ClickableChip>
      }
      onOpenChange={onOpenChange}
    />
  );
}

function AddButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} disabled={disabled} size="icon-sm" type="button" variant="ghost" onClick={onClick}>
          <Plus aria-hidden />
        </Button>
      </TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
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

function CalculationComposer({ store }: { store: FieldModalStore }) {
  const t = useTranslations();
  const root = useRootStore();
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (!root.agentChatEnabled || root.agentChatStore?.enabled === false || store.isDisabled) return null;
  const submit = () =>
    runUserAction(async () => {
      const text = description.trim();
      if (!text || pending) return;
      setPending(true);
      setFailure(null);
      try {
        const result = await draftCalculationAction({
          typeId: store.typeId,
          description: text,
          ...(store.original ? { fieldId: store.original.id } : {}),
        });
        if (!result.ok) setFailure(t("RecordModel.calculationFlow.describe.unavailable"));
        else if (!result.data.draft) setFailure(t("RecordModel.calculationFlow.describe.failed"));
        else store.applyCalculationDraft(result.data.draft);
      } finally {
        setPending(false);
      }
    });
  return (
    <div className="space-y-1.5 pb-3" data-calculation-composer="">
      <div className="relative">
        <Input
          aria-label={t("RecordModel.calculationFlow.describe.label")}
          disabled={pending}
          maxLength={CALCULATION_DRAFT_DESCRIPTION_LIMIT}
          placeholder={t("RecordModel.calculationFlow.describe.placeholder")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
            event.preventDefault();
            submit();
          }}
        />

        {pending && (
          <Spinner
            aria-label={t("RecordModel.calculationFlow.describe.pending")}
            className="absolute end-3 top-1/2 -translate-y-1/2"
            size="sm"
          />
        )}
      </div>

      {failure && <p className="text-xs text-muted-foreground">{failure}</p>}
    </div>
  );
}

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
  const operatorLabel = (operator: Operator) => t(`RecordModel.operators.${operator}`);
  const intl = useHydratedIntlStore();
  const labels = {
    model,
    t: (key: string, values?: Record<string, string>) => t(key, values),
    locale: intl.formattingLocale,
    operatorLabel,
  };
  const typeLabel = (valueType: string) => t(`RecordModel.types.${valueType}`);
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

  const leafIcon = (leaf: CalculationExpression, leafTypeId: string) => {
    if (leaf.kind === "field" || leaf.kind === "optionAttribute") return FIELD_ICON;
    if (leaf.kind === "related") return listIcon(linkedTypeIds(linkedFlow(leaf), leafTypeId, model).at(-1));
    return undefined;
  };

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

  const leafChip = (path: ExpressionPath, leaf: CalculationExpression) => {
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
        icon={leafIcon(leaf, typeId)}
        invalid={showIssues && unset}
        label={
          unset ? t("RecordModel.calculationFlow.pickValue") : sentenceText(expressionSegments(leaf, typeId, labels))
        }
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
        icon={Sigma}
        kind={resultType ? typeLabel(resultType.valueType) : undefined}
        name={fieldLabel}
      />

      {example.data && (
        <ConfigureNodeRows label={t("RecordModel.calculationFlow.example.title")}>
          <li data-calculation-example="">
            {example.data?.value === null || example.data?.recordId === null ? (
              <ConfigureNodeStaticRow
                kind=""
                name={
                  <span className="font-normal text-muted-foreground">
                    {example.data.value?.state === "restricted"
                      ? t("RecordModel.calculationFlow.example.restricted")
                      : example.data.recordId === null
                        ? t("RecordModel.calculationFlow.example.none")
                        : t("RecordModel.calculationFlow.example.unavailable")}
                  </span>
                }
              />
            ) : (
              <ConfigureNodeStaticRow
                kind={
                  <span className="flex items-center gap-1">
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
                  </span>
                }
                name={
                  example.data?.examples.find((candidate) => candidate.recordId === example.data?.recordId)?.title ??
                  t("RecordModel.calculationFlow.example.title")
                }
              />
            )}
          </li>
        </ConfigureNodeRows>
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
          locale: labels.locale,
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

      <FlowConnector />

      {resultNode}

      {!(showIssues && issues.length) && (
        <p className="pt-3 text-sm text-muted-foreground" data-calculation-sentence="">
          {issue ? issueMessage(issue) : <CalculationSentenceText segments={described?.sentence ?? []} />}

          {saved.map((text) => ` ${text}`).join("")}
        </p>
      )}
    </section>
  );
});

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
  leafChip: (path: ExpressionPath, leaf: CalculationExpression) => ReactNode;
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
  const symbols: Partial<Record<Operator, string>> = {
    add: "+",
    subtract: "−",
    multiply: "×",
    divide: "÷",
    equal: "=",
    lessThan: "<",
    greaterThan: ">",
  };
  const role = (operator: Operator, index: number) =>
    operator === "if"
      ? [t("RecordModel.conditionIf"), t("RecordModel.conditionThen"), t("RecordModel.conditionOtherwise")][index]
      : null;
  return (
    <>
      <FlowNode data-calculation-node="inputs" error={issueMessage({ node: "input" })} invalid={rootInvalid}>
        <ConfigureNodeHeader
          action={
            disabled ? undefined : (
              <AddButton
                disabled={disabled}
                label={t("RecordModel.addInput")}
                onClick={() => onChange(addInput(expression, defaultOperator([])))}
              />
            )
          }
          icon={recordTypeIcon(list?.icon ?? "")}
          kind={list?.pluralLabel}
          name={t("RecordModel.calculationFlow.inputs")}
        />

        <ConfigureNodeRows label={t("RecordModel.calculationFlow.inputs")}>
          {inputs.map((input) => (
            <li key={input.path.join(".")}>
              <ConfigureNodeStaticRow
                kind={typeOf(input.path) ? typeLabel(String(typeOf(input.path))) : ""}
                name={leafChip(input.path, input.expression)}
              />
            </li>
          ))}
        </ConfigureNodeRows>
      </FlowNode>

      {steps.map((step, number) => {
        const key = step.path.join(".");
        const invalid = showIssues && step.arguments.some((argument) => isUnset(argument.expression));
        const last = number === steps.length - 1;
        const stepType = typeOf(step.path);
        return (
          <div key={`${key}:${step.operator}`}>
            <FlowConnector />

            <FlowNode
              data-calculation-node="step"
              error={issueMessage({ node: "step", path: step.path, operator: step.operator })}
              invalid={invalid}
            >
              <ConfigureNodeHeader
                action={
                  disabled ? undefined : (
                    <span className="flex items-center gap-1">
                      {last && (
                        <AddButton
                          disabled={disabled}
                          label={t("RecordModel.calculationFlow.addStep")}
                          onClick={() => onChange(addStep(expression, defaultOperator([])))}
                        />
                      )}

                      <RecordRowActions
                        name={t("RecordModel.calculationFlow.step", { number: String(number + 1) })}
                        onDelete={() => onChange(removeStep(expression, step.path))}
                        onOpen={() => setOperatorPicker(key)}
                      />
                    </span>
                  )
                }
                icon={Sigma}
                kind={stepType ? typeLabel(stepType) : undefined}
                name={t("RecordModel.calculationFlow.step", { number: String(number + 1) })}
              />

              <ConfigureNodeRows label={operatorLabel(step.operator)}>
                <li>
                  <ConfigureNodeStaticRow
                    kind=""
                    name={
                      <FlowChip
                        data-calculation-chip="operation"
                        disabled={disabled}
                        icon={<Sigma aria-hidden className="text-muted-foreground" />}
                        label={operatorLabel(step.operator)}
                        open={operatorPicker === key}
                        page={{
                          title: t("RecordModel.operation"),
                          groups: OPERATOR_GROUPS.map(({ group, operators }) => ({
                            heading: {
                              math: t("RecordModel.calculationFlow.picker.operations.math"),
                              compare: t("RecordModel.calculationFlow.picker.operations.compare"),
                              logic: t("RecordModel.calculationFlow.picker.operations.logic"),
                              text: t("RecordModel.calculationFlow.picker.operations.text"),
                              dates: t("RecordModel.calculationFlow.picker.operations.dates"),
                            }[group],
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
                        onOpenChange={(open) => setOperatorPicker(open ? key : null)}
                      />
                    }
                  />
                </li>

                {step.arguments.map((argument, index) => (
                  <li key={index}>
                    <ConfigureNodeStaticRow
                      kind={
                        role(step.operator, index) ??
                        (typeOf(argument.path) ? typeLabel(String(typeOf(argument.path))) : "")
                      }
                      marker={
                        <span aria-hidden className="w-3.5 shrink-0 text-center text-muted-foreground">
                          {index > 0 ? (symbols[step.operator] ?? "") : ""}
                        </span>
                      }
                      name={
                        argument.step === null ? (
                          leafChip(argument.path, argument.expression)
                        ) : (
                          <AppChip startContent={<Sigma aria-hidden className="text-muted-foreground" />}>
                            {t("RecordModel.calculationFlow.step", { number: String(argument.step + 1) })}
                          </AppChip>
                        )
                      }
                    />
                  </li>
                ))}
              </ConfigureNodeRows>
            </FlowNode>
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
            <ConfigureNodeRows label={t("RecordModel.calculationFlow.pickRelationship")}>
              <li>
                <ConfigureNodeStaticRow kind="" name={relationshipChip(0)} />
              </li>
            </ConfigureNodeRows>
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
                <ConfigureNodeRows label={target?.pluralLabel ?? ""}>
                  <li>
                    <ConfigureNodeStaticRow
                      kind={valueField && reducer !== "count" ? typeLabel(valueField.valueType) : ""}
                      name={
                        <span className="flex min-w-0 items-center gap-1.5 font-normal">
                          {lookup ? (
                            <>
                              {t("RecordModel.calculationFlow.take")}

                              {valueChip}
                            </>
                          ) : reducer === "count" ? (
                            <>
                              {aggregateChip}

                              <span className="truncate">
                                {t("RecordModel.calculationFlow.ofLinked", { list: target?.pluralLabel ?? "" })}
                              </span>
                            </>
                          ) : (
                            <>
                              {aggregateChip}

                              {t("RecordModel.calculationFlow.of")}

                              {valueChip}
                            </>
                          )}
                        </span>
                      }
                    />
                  </li>
                </ConfigureNodeRows>
              )}
            </FlowNode>
          </div>
        );
      })}
    </>
  );
}
