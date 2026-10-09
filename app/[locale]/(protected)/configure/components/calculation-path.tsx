"use client";

import type { CalculationExpression, RecordModelView, RecordType } from "@/features/records/record-model.schema";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { ArrowRight, Sigma } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";

import { expressionSummary } from "./calculation-editor";
import { configureCardinality } from "./configure-graph-model";

type PathStep = { label: string; icon?: string; result?: boolean };

type Capture = { allowManualOverride: boolean; capture: string; triggerLabel?: string; triggerValueLabel?: string };

type Props = {
  model: RecordModelView;
  typeId: string;
  fieldLabel: string;
  expression: CalculationExpression;
  snapshot?: Capture;
};

type RelatedExpression = Extract<CalculationExpression, { kind: "related" }>;

function relatedChain(model: RecordModelView, typeId: string, expression: RelatedExpression) {
  const hops: { relationLabel: string; cardinality: string; target: RecordType | undefined }[] = [];
  let current: CalculationExpression = expression;
  let listId = typeId;
  while (current.kind === "related") {
    const { relationId, direction } = current;
    const relation = model.relationships.find((candidate) => candidate.id === relationId);
    const targetId = direction === "outgoing" ? (relation?.targetTypeId ?? listId) : (relation?.sourceTypeId ?? listId);
    hops.push({
      relationLabel: relation ? (direction === "outgoing" ? relation.sourceLabel : relation.targetLabel) : "",
      cardinality: relation
        ? configureCardinality(
            direction === "outgoing"
              ? relation
              : { sourceCardinality: relation.targetCardinality, targetCardinality: relation.sourceCardinality },
          )
        : "manyToMany",
      target: model.types.find((type) => type.id === targetId),
    });
    listId = targetId;
    current = current.expression;
  }
  return { hops, value: current };
}

export const CalculationPath = observer(function CalculationPath({
  model,
  typeId,
  fieldLabel,
  expression,
  snapshot,
}: Props) {
  const t = useTranslations();
  const summary = (value: CalculationExpression) => expressionSummary(value, model, (key) => t(`RecordModel.${key}`));
  const list = model.types.find((type) => type.id === typeId);
  const reducerNouns: Record<string, string> = {
    sum: t("RecordModel.calculationPath.reducers.sum"),
    average: t("RecordModel.calculationPath.reducers.average"),
    min: t("RecordModel.calculationPath.reducers.min"),
    max: t("RecordModel.calculationPath.reducers.max"),
  };
  const steps: PathStep[] = [];
  let sentence: string;
  if (expression.kind === "related") {
    const { hops, value } = relatedChain(model, typeId, expression);
    const last = hops.at(-1)?.target;
    const counted = expression.reducer === "count";
    steps.push({ label: list?.label ?? "", icon: list?.icon });
    hops.forEach((hop, index) => {
      steps.push({
        label: t("RecordModel.calculationPath.via", {
          relationship: hop.relationLabel,
          cardinality: t(`RecordModel.cardinality.${hop.cardinality}`),
        }),
      });
      const final = index === hops.length - 1;
      steps.push({
        label: final && !counted ? `${hop.target?.label ?? ""} · ${summary(value)}` : (hop.target?.label ?? ""),
        icon: hop.target?.icon,
      });
    });
    steps.push({ label: t(`RecordModel.reducers.${expression.reducer}`) });
    sentence =
      expression.reducer === "one"
        ? t("RecordModel.calculationPath.lookup", { field: fieldLabel, value: summary(value), list: last?.label ?? "" })
        : counted
          ? t("RecordModel.calculationPath.count", { field: fieldLabel, list: last?.pluralLabel ?? "" })
          : t("RecordModel.calculationPath.rollup", {
              field: fieldLabel,
              reducer: reducerNouns[expression.reducer],
              value: summary(value),
              list: last?.pluralLabel ?? "",
            });
  } else {
    if (expression.kind === "operation") {
      for (const argument of expression.arguments) steps.push({ label: summary(argument), icon: list?.icon });
      steps.push({ label: t(`RecordModel.operators.${expression.operator}`) });
    } else steps.push({ label: summary(expression), icon: expression.kind === "literal" ? undefined : list?.icon });
    sentence = t("RecordModel.calculationPath.formula", { field: fieldLabel, formula: summary(expression) });
  }
  steps.push({ label: fieldLabel, result: true });
  const clauses = [sentence];
  if (snapshot?.allowManualOverride) clauses.push(t("RecordModel.calculationPath.manual"));
  if (snapshot?.capture === "explicit") clauses.push(t("RecordModel.calculationPath.captureExplicit"));
  if (snapshot?.capture === "create") clauses.push(t("RecordModel.calculationPath.captureCreate"));
  if (snapshot?.capture === "whenChanged" && snapshot.triggerLabel) {
    clauses.push(
      snapshot.triggerValueLabel
        ? t("RecordModel.calculationPath.captureChangedTo", {
            field: snapshot.triggerLabel,
            value: snapshot.triggerValueLabel,
          })
        : t("RecordModel.calculationPath.captureChanged", { field: snapshot.triggerLabel }),
    );
  }
  return (
    <figure aria-label={t("RecordModel.calculationPath.title")} className="space-y-2" data-calculation-path="">
      <ol aria-label={t("RecordModel.calculationPath.steps")} className="flex flex-wrap items-center gap-1.5">
        {steps.map((step, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <li aria-hidden className="text-muted-foreground">
                <ArrowRight className="size-3.5" />
              </li>
            )}

            <li className="min-w-0 max-w-full">
              <AppChip
                startContent={
                  step.result ? (
                    <Sigma aria-hidden />
                  ) : step.icon !== undefined ? (
                    <RecordTypeGlyph icon={step.icon} />
                  ) : undefined
                }
                variant={step.result ? "default" : "secondary"}
              >
                {step.label}
              </AppChip>
            </li>
          </Fragment>
        ))}
      </ol>

      <figcaption className="text-sm text-muted-foreground" data-calculation-sentence="">
        {t("RecordModel.calculationPath.sentence", { clauses: clauses.join("; ") })}
      </figcaption>
    </figure>
  );
});
