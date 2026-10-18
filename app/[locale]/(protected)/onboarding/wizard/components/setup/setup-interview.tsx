"use client";

import type { SetupQuestion } from "@/features/workspace-setup/setup-interview";

import { Check, Globe, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { IconContainer } from "@/components/shared/icon-container";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { SETUP_SCREEN_DEFINITIONS, SETUP_SCREENS } from "@/features/workspace-setup/setup-interview";

import { answerFromWebsite, displayedAnswerValue, partVisible, screenQuestions } from "./setup-interview-state";
import { partDescriptor } from "./setup-question-descriptor";
import { SetupQuestionField } from "./setup-question-field";
import { screenSummary } from "./setup-screen-summary";
import { SetupSpreadsheetUpload } from "./setup-spreadsheet-upload";

type ScreenState = "done" | "current" | "upcoming";

function ScreenMarker({ state, number }: { state: ScreenState; number: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors motion-reduce:transition-none",
        state === "done" && "bg-primary text-primary-foreground",
        state === "current" && "bg-primary/10 text-primary ring-1 ring-primary",
        state === "upcoming" && "border border-border text-muted-foreground",
      )}
    >
      {state === "done" ? <Check className="size-3.5" /> : number}
    </span>
  );
}

const SetupQuestionBlock = observer(function SetupQuestionBlock({ question }: { question: SetupQuestion }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const parts = question.parts.filter((part) => partVisible(part, store.answers));
  if (!parts.length) return null;
  const currency = store.answers.currency?.value;
  const fields = parts.map((part) => {
    const answer = store.answers[part.id]?.value;
    return (
      <Fragment key={part.id}>
        <SetupQuestionField
          currency={currency?.format === "singleChoice" ? currency.value : null}
          descriptor={partDescriptor(part, t, store.answers)}
          disabled={store.isBusy}
          fromWebsite={answerFromWebsite(store.answers, part.id)}
          value={displayedAnswerValue(part, store.answers, store.locale)}
          onChange={(value) => store.setAnswer(part.id, value)}
        />

        {part.format === "singleChoice" &&
        part.upload &&
        answer?.format === "singleChoice" &&
        answer.value === "spreadsheet" ? (
          <SetupSpreadsheetUpload />
        ) : null}
      </Fragment>
    );
  });

  return <div className="flex flex-col gap-6">{fields}</div>;
});

const WEBSITE_CARD_CLASS = "flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4";

const SetupWebsiteContext = observer(function SetupWebsiteContext() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const website = store.setup?.websiteUrl ?? null;
  const editable = store.setup?.status === "interview" && !store.adjusting;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const reading = store.pending === "website";

  if (website && !editing) {
    const host = new URL(website).host;
    const progress = store.websiteReading;
    const status = progress
      ? t(`WorkspaceSetup.website.${progress.stage}`, { website: host, read: progress.read, total: progress.total })
      : t("WorkspaceSetup.website.suggestedHint");
    return (
      <div aria-live="polite" className={WEBSITE_CARD_CLASS} role="status">
        <div className="flex items-center gap-3">
          <IconContainer
            icon={progress ? Loader2 : Globe}
            iconClassName={progress ? "animate-spin motion-reduce:animate-none" : undefined}
            size="md"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{host}</span>

            <span className="text-xs text-muted-foreground">{status}</span>
          </div>

          {editable ? (
            <Button
              disabled={store.isBusy}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(host);
                setEditing(true);
              }}
            >
              {t("WorkspaceSetup.website.change")}
            </Button>
          ) : null}
        </div>

        {progress ? (
          <div className="flex flex-col gap-1.5">
            <WizardProgress current={progress.progress} label={host} total={100} valueText={status} />

            <span className="text-xs text-muted-foreground">{t("WorkspaceSetup.website.eta")}</span>
          </div>
        ) : null}
      </div>
    );
  }
  if (!editable) return null;

  const submit = () => {
    const value = draft.trim();
    if (!value) return;
    runUserAction(async () => {
      if (await store.setWebsite(value)) setEditing(false);
    });
  };

  return (
    <div className={WEBSITE_CARD_CLASS}>
      <div className="flex items-center gap-3">
        <IconContainer icon={Globe} size="md" />

        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{t("WorkspaceSetup.website.title")}</span>

          <span className="text-xs text-muted-foreground">{t("WorkspaceSetup.website.hint")}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          aria-label={t("Common.inputs.websiteUrl")}
          autoComplete="url"
          className="sm:flex-1"
          disabled={store.isBusy}
          inputMode="url"
          placeholder={t("OnboardingWizard.profile.websitePlaceholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />

        <Button disabled={store.isBusy || !draft.trim()} type="button" onClick={submit}>
          {reading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Globe aria-hidden />}

          {t("WorkspaceSetup.website.read")}
        </Button>
      </div>
    </div>
  );
});

export const SetupInterview = observer(function SetupInterview() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const triggers = useRef(new Map<number, HTMLButtonElement>());
  const previous = useRef(store.screenIndex);
  const titles = SETUP_SCREEN_DEFINITIONS.map((screen) => t(screen.titleKey));
  const visibleScreens = store.visibleScreens;
  const position = Math.max(0, visibleScreens.indexOf(store.screenIndex));
  const setup = store.setup;
  const prefillFailed = setup?.interview.prefill === "failed" && Boolean(setup.websiteUrl);
  const saving = store.pending === "save";

  useEffect(() => {
    if (previous.current !== store.screenIndex) triggers.current.get(store.screenIndex)?.focus();
    previous.current = store.screenIndex;
  }, [store.screenIndex]);

  const stateOf = (index: number): ScreenState =>
    index === store.screenIndex ? "current" : index <= store.furthestScreen ? "done" : "upcoming";

  return (
    <section aria-busy={store.isBusy} className="flex flex-col gap-6">
      <SetupWebsiteContext />

      {store.adjusting ? <Alert color="primary" description={t("WorkspaceSetup.interview.adjusting")} /> : null}

      {prefillFailed && store.screenIndex === 0 ? (
        <Alert color="warning" description={t("WorkspaceSetup.interview.prefillFailed")} />
      ) : null}

      <Accordion
        aria-label={t("WorkspaceSetup.interview.stepsLabel")}
        className="rounded-xl border border-border"
        type="single"
        value={String(store.screenIndex)}
        onValueChange={(value) => {
          if (value) store.goToScreen(Number(value));
        }}
      >
        {visibleScreens.map((index, order) => {
          const state = stateOf(index);
          const summary = state === "done" ? screenSummary(SETUP_SCREENS[index], store.answers, store.locale, t) : "";
          return (
            <AccordionItem
              key={index}
              className="px-4"
              disabled={state === "upcoming" || store.isBusy}
              value={String(index)}
            >
              <AccordionTrigger
                ref={(node) => {
                  if (node) triggers.current.set(index, node);
                  else triggers.current.delete(index);
                }}
                aria-label={`${t("WorkspaceSetup.interview.stepProgress", { current: order + 1, total: visibleScreens.length })}: ${titles[index]}`}
                className="min-w-0 items-center gap-3 py-3.5 hover:no-underline disabled:opacity-100 [&[data-disabled]>svg]:hidden [&[data-state=open]>svg]:hidden"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <ScreenMarker number={order + 1} state={state} />

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        "text-sm",
                        state === "current" ? "text-base font-semibold" : "font-medium",
                        state === "upcoming" && "text-muted-foreground",
                      )}
                    >
                      {titles[index]}
                    </span>

                    {summary ? (
                      <span className="truncate text-xs font-normal text-muted-foreground">{summary}</span>
                    ) : null}
                  </span>
                </span>
              </AccordionTrigger>

              <AccordionContent className="flex flex-col gap-6 pt-1 pb-5 sm:pl-9">
                {screenQuestions(SETUP_SCREENS[index]).map((question) => (
                  <SetupQuestionBlock key={question.id} question={question} />
                ))}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {position > 0 || store.adjusting ? (
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
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
});
