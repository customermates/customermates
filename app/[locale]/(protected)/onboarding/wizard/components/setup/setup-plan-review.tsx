"use client";

import type { WorkspaceSetupFailure } from "@/ee/workspace-setup/workspace-setup.schema";

import { ArrowRight, Loader2, Mail, RotateCcw } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { MateOrb } from "@/components/mate/mate-orb";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { setupPart } from "@/features/workspace-setup/setup-interview";
import { supportMailHref } from "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/subscription/support-mail-href";

import { WIZARD_FOOTER_CLASS } from "../wizard-footer";
import { displayedAnswerValue, partVisible } from "./setup-interview-state";
import { planProgress } from "./setup-plan-progress";
import { planLists } from "./setup-plan-summary";
import { partDescriptor } from "./setup-question-descriptor";

export function useSetupFailureMessage() {
  const t = useTranslations();
  const messages: Record<WorkspaceSetupFailure, string> = {
    spendCap: t("WorkspaceSetup.failures.spendCap"),
    aiUnavailable: t("WorkspaceSetup.failures.aiUnavailable"),
    generation: t("WorkspaceSetup.failures.generation"),
    invalidPlan: t("WorkspaceSetup.failures.invalidPlan"),
    schemaChanged: t("WorkspaceSetup.failures.schemaChanged"),
    permission: t("WorkspaceSetup.failures.permission"),
    dependency: t("WorkspaceSetup.failures.dependency"),
    error: t("WorkspaceSetup.failures.error"),
  };
  return (failure: WorkspaceSetupFailure | null) => messages[failure ?? "error"];
}

export function SetupSupportButton({ size }: { size?: "xs" }) {
  const t = useTranslations();
  return (
    <Button
      className={size ? "self-start" : undefined}
      size={size}
      type="button"
      variant="secondary"
      onClick={() => {
        const href = supportMailHref(t("WorkspaceSetup.failures.supportSubject"));
        if (href) window.location.assign(href);
      }}
    >
      <Mail />

      {t("WorkspaceSetup.failures.contactSupport")}
    </Button>
  );
}

type Row = { key: string; label: string; value: string; question: string };

function useChoiceLabel() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  return (partId: string): string | null => {
    const part = setupPart(partId);
    if (!part || !partVisible(part, store.answers)) return null;
    const value = displayedAnswerValue(part, store.answers);
    const descriptor = partDescriptor(part, t, store.answers);
    const options = "options" in descriptor ? descriptor.options : [];
    if (value?.format === "singleChoice") return options.find((option) => option.id === value.value)?.label ?? null;
    if (value?.format !== "multipleChoice") return null;
    const chosen = value.values.map((id) => options.find((option) => option.id === id)?.label ?? id);
    return [...chosen, ...value.custom].join(", ");
  };
}

function usePlanClock() {
  const [seenAt] = useState(() => Date.now());
  const [now, setNow] = useState(seenAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return { now, seenAt };
}

const PlanDrafting = observer(function PlanDrafting() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const { now, seenAt } = usePlanClock();
  const setup = store.setup;
  if (!setup) return null;
  const progress = planProgress(setup, now, seenAt);
  const remaining = progress.overdue
    ? t("WorkspaceSetup.plan.progress.overdue")
    : progress.remainingMs > 60_000
      ? t("WorkspaceSetup.plan.progress.minutesLeft", { minutes: Math.round(progress.remainingMs / 60_000) })
      : t("WorkspaceSetup.plan.progress.underMinute");

  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" id="setup-plan-drafting" role="status">
      <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />

      <span>{`${t("WorkspaceSetup.plan.planningTitle")} · ${remaining}`}</span>
    </p>
  );
});

export const SetupPlanReview = observer(function SetupPlanReview() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const failureMessage = useSetupFailureMessage();
  const label = useChoiceLabel();
  const plan = store.setup?.plan.plan ?? null;
  const steps = store.answers.mainSteps?.value;
  const examples = store.answers.existingData?.value;
  const withExamples = examples?.format !== "singleChoice" || examples.value === "sampleData";
  const rows: Row[] = [
    {
      key: "workWith",
      label: t("WorkspaceSetup.plan.rows.workWith"),
      value: label("workWith") ?? "",
      question: "workWith",
    },
    {
      key: "lists",
      label: t("WorkspaceSetup.plan.lists"),
      value: plan
        ? planLists(plan)
            .map((list) => list.label)
            .join(", ")
        : (label("purpose") ?? ""),
      question: "purpose",
    },
    ...(store.questions.some((question) => question.id === "mainSteps")
      ? [
          {
            key: "pipeline",
            label: t("WorkspaceSetup.plan.pipeline"),
            value: t("WorkspaceSetup.plan.rows.steps", {
              count: steps?.format === "orderedList" ? steps.items.length : 0,
            }),
            question: "mainSteps",
          },
        ]
      : []),
    ...(label("pricing")
      ? [
          {
            key: "pricing",
            label: t("WorkspaceSetup.plan.rows.pricing"),
            value: label("pricing") ?? "",
            question: "charge",
          },
        ]
      : []),
    {
      key: "examples",
      label: t("WorkspaceSetup.plan.rows.examples"),
      value: withExamples ? t("WorkspaceSetup.plan.rows.yes") : t("WorkspaceSetup.plan.rows.no"),
      question: "charge",
    },
  ];
  const stage = store.stage;

  return (
    <section className="flex animate-page-result-in flex-col gap-4 motion-reduce:animate-none" id="setup-plan-review">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MateOrb className="size-3.5" />

        {t("WorkspaceSetup.plan.eyebrow")}
      </p>

      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => (
          <div key={row.key} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>

            <dd className="flex min-w-0 items-center gap-2 text-right">
              <span className="min-w-0 truncate font-medium text-foreground">{row.value}</span>

              <Button
                aria-label={t("WorkspaceSetup.plan.changeNamed", { item: row.label })}
                className="h-auto shrink-0 px-1 py-0.5 text-xs"
                disabled={!store.canChangeAnswers}
                id={`setup-plan-change-${row.key}`}
                size="sm"
                type="button"
                variant="link"
                onClick={() => store.changeAnswer(row.question)}
              >
                {t("OnboardingWizard.change")}
              </Button>
            </dd>
          </div>
        ))}
      </dl>

      {stage === "planning" ? <PlanDrafting /> : null}

      {stage === "planFailed" ? (
        <Alert
          description={failureMessage(store.setup?.plan.error ?? null)}
          title={t("WorkspaceSetup.plan.failedTitle")}
          variant="destructive"
        />
      ) : null}
    </section>
  );
});

export const SetupPlanReviewFooter = observer(function SetupPlanReviewFooter() {
  const t = useTranslations();
  const { workspaceSetupStore: store, onboardingWizardStore: wizard } = useRootStore();
  const stage = store.stage;
  const error = store.setup?.plan.error ?? null;

  if (stage === "planFailed") {
    return (
      <AppCardFooter className={WIZARD_FOOTER_CLASS}>
        {error === "spendCap" ? (
          <>
            <SetupSupportButton />

            <Button
              className="min-h-11"
              disabled={store.isBusy || wizard.isSubmitting}
              type="button"
              onClick={() => runUserAction(wizard.completeSetupStep)}
            >
              {wizard.isSubmitting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

              {t("WorkspaceSetup.actions.continueAnyway")}
            </Button>
          </>
        ) : (
          <>
            <span />

            <Button
              className="min-h-11"
              disabled={store.isBusy}
              id="setup-plan-retry"
              type="button"
              onClick={() => runUserAction(store.replan)}
            >
              {store.pending === "plan" ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : (
                <RotateCcw />
              )}

              {t("WorkspaceSetup.plan.tryAgain")}
            </Button>
          </>
        )}
      </AppCardFooter>
    );
  }

  return (
    <AppCardFooter>
      <Button
        className="min-h-11 w-full"
        disabled={store.isBusy || stage !== "plan"}
        id="setup-plan-build"
        type="button"
        onClick={() => runUserAction(store.build)}
      >
        {store.pending === "build" || stage === "planning" ? (
          <Loader2 className="animate-spin motion-reduce:animate-none" />
        ) : null}

        {t("WorkspaceSetup.plan.build")}

        {store.pending === "build" || stage === "planning" ? null : (
          <ArrowRight aria-hidden="true" className="size-4" />
        )}
      </Button>
    </AppCardFooter>
  );
});
