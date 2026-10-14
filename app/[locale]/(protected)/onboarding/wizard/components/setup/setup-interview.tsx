"use client";

import type { SetupQuestion } from "@/features/workspace-setup/setup-interview";

import { Globe, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { SETUP_SCREEN_DEFINITIONS, SETUP_SCREENS } from "@/features/workspace-setup/setup-interview";

import { answerFromWebsite, displayedAnswerValue, partVisible, screenQuestions } from "./setup-interview-state";
import { partDescriptor } from "./setup-question-descriptor";
import { SetupQuestionField } from "./setup-question-field";
import { SetupSpreadsheetUpload } from "./setup-spreadsheet-upload";

export function SetupScreenSteps({ current, titles }: { current: number; titles: string[] }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label={t("WorkspaceSetup.interview.stepsLabel")} className="flex gap-1.5">
        {titles.map((title, index) => (
          <li
            key={title}
            aria-current={index === current ? "step" : undefined}
            aria-label={title}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
              index <= current ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </ol>

      <p className="text-xs text-muted-foreground">
        {t("WorkspaceSetup.interview.stepProgress", { current: current + 1, total: titles.length })}
      </p>
    </div>
  );
}

const SetupQuestionBlock = observer(function SetupQuestionBlock({ question }: { question: SetupQuestion }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const parts = question.parts.filter((part) => partVisible(part, store.answers));
  if (!parts.length) return null;
  const currency = store.answers.currency?.value;
  const fields = parts.map((part) => (
    <SetupQuestionField
      key={part.id}
      currency={currency?.format === "singleChoice" ? currency.value : null}
      descriptor={partDescriptor(part, t)}
      disabled={store.isBusy}
      fromWebsite={answerFromWebsite(store.answers, part.id)}
      value={displayedAnswerValue(part, store.answers, store.locale)}
      onChange={(value) => store.setAnswer(part.id, value)}
    />
  ));

  if (question.confirmationCard)
    return <div className="grid gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">{fields}</div>;

  return <div className="flex flex-col gap-6">{fields}</div>;
});

export const SetupInterview = observer(function SetupInterview() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(store.screenIndex);
  const titles = SETUP_SCREEN_DEFINITIONS.map((screen) => t(screen.titleKey));
  const setup = store.setup;
  const prefillFailed = setup?.interview.prefill === "failed" && Boolean(setup.websiteUrl);
  const saving = store.pending === "save";

  useEffect(() => {
    if (previous.current !== store.screenIndex) heading.current?.focus();
    previous.current = store.screenIndex;
  }, [store.screenIndex]);

  return (
    <section aria-busy={store.isBusy} className="flex flex-col gap-6">
      <SetupScreenSteps current={store.screenIndex} titles={titles} />

      {store.adjusting ? <Alert color="primary" description={t("WorkspaceSetup.interview.adjusting")} /> : null}

      {store.prefillRunning ? (
        <p aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Globe aria-hidden className="size-3.5 animate-pulse motion-reduce:animate-none" />

          {t("WorkspaceSetup.interview.prefillRunning", { website: setup?.websiteUrl ?? "" })}
        </p>
      ) : null}

      {prefillFailed && store.screenIndex === 0 ? (
        <Alert color="warning" description={t("WorkspaceSetup.interview.prefillFailed")} />
      ) : null}

      <div key={store.screen} className="flex animate-page-result-in flex-col gap-6 motion-reduce:animate-none">
        <h2 ref={heading} className="text-lg font-semibold outline-none" tabIndex={-1}>
          {titles[store.screenIndex]}
        </h2>

        {screenQuestions(SETUP_SCREENS[store.screenIndex]).map((question) => (
          <SetupQuestionBlock key={question.id} question={question} />
        ))}

        {store.screen === "data" &&
        store.answers.existingData?.value.format === "singleChoice" &&
        store.answers.existingData.value.value === "spreadsheet" ? (
          <SetupSpreadsheetUpload />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        {store.screenIndex > 0 || store.adjusting ? (
          <Button disabled={store.isBusy} type="button" variant="secondary" onClick={store.previousScreen}>
            {t("Common.actions.back")}
          </Button>
        ) : (
          <span />
        )}

        <Button
          disabled={!store.canConfirmScreen || store.isBusy}
          type="button"
          onClick={() => runUserAction(store.confirmScreen)}
        >
          {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

          {t("WorkspaceSetup.actions.looksRight")}
        </Button>
      </div>
    </section>
  );
});
