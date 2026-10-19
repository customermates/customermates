"use client";

import type { SetupQuestion } from "@/features/workspace-setup/setup-interview";

import { Globe, Loader2, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { focusFirstInvalidField } from "@/components/forms/focus-first-invalid-field";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Alert } from "@/components/shared/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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

const SetupQuestionBlock = observer(function SetupQuestionBlock({ question }: { question: SetupQuestion }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const parts = question.parts.filter((part) => partVisible(part, store.answers));
  if (!parts.length) return null;
  const fields = parts.map((part) => {
    const answer = store.answers[part.id]?.value;
    return (
      <Fragment key={part.id}>
        <SetupQuestionField
          currency={store.currency}
          descriptor={partDescriptor(part, t, store.answers)}
          disabled={store.isBusy}
          fromWebsite={answerFromWebsite(store.answers, part.id)}
          invalid={store.answerMissing(part.id)}
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
      <Alert
        color="primary"
        icon={progress ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Globe />}
        role="note"
        title={host}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <span aria-live="polite" className="text-sm text-primary/90">
              {status}
            </span>

            {editable ? (
              <Button
                className="-my-1"
                disabled={store.isBusy}
                size="sm"
                type="button"
                variant="secondary"
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

              <span className="text-xs text-primary/90">{t("WorkspaceSetup.website.eta")}</span>
            </div>
          ) : null}
        </div>
      </Alert>
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
  const cancel = () => {
    if (store.isBusy) return;
    setEditing(false);
  };

  return (
    <Alert
      color="primary"
      description={t("WorkspaceSetup.website.hint")}
      icon={<Globe />}
      role="note"
      title={t("WorkspaceSetup.website.title")}
    >
      <div className="mt-2 flex gap-2">
        <Input
          aria-label={t("Common.inputs.websiteUrl")}
          autoComplete="url"
          className="flex-1"
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
            if (event.key === "Escape" && editing) {
              event.preventDefault();
              cancel();
            }
          }}
        />

        {editing ? (
          <Button
            aria-label={t("Common.actions.close")}
            disabled={store.isBusy}
            size="icon"
            type="button"
            variant="ghost"
            onClick={cancel}
          >
            <X aria-hidden />
          </Button>
        ) : null}

        <Button disabled={store.isBusy || !draft.trim()} type="button" variant="secondary" onClick={submit}>
          {reading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

          {t("WorkspaceSetup.website.read")}
        </Button>
      </div>
    </Alert>
  );
});

export const SetupInterview = observer(function SetupInterview() {
  const t = useTranslations();
  const { workspaceSetupStore: store, onboardingWizardStore: wizard } = useRootStore();
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  const section = useRef<HTMLElement>(null);
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
    <section ref={section} aria-busy={store.isBusy} className="flex flex-col gap-6">
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
          const summary =
            state === "done" ? screenSummary(SETUP_SCREENS[index], store.answers, store.locale, store.currency, t) : "";
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
                className="min-w-0 items-center hover:no-underline disabled:opacity-100 [&[data-disabled]>svg]:hidden [&[data-state=open]>svg]:hidden"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("text-sm font-medium", state === "upcoming" && "text-muted-foreground")}>
                    {titles[index]}
                  </span>

                  {summary ? (
                    <span className="truncate text-xs font-normal text-muted-foreground">{summary}</span>
                  ) : null}
                </span>
              </AccordionTrigger>

              <AccordionContent className="flex flex-col gap-6">
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
                    disabled={store.isBusy}
                    type="button"
                    onClick={() => {
                      if (store.showMissingAnswers(t("Common.errors.mustNotBeBlank")))
                        focusFirstInvalidField(section.current);
                      else runUserAction(store.confirmScreen);
                    }}
                  >
                    {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

                    {t("OnboardingWizard.next")}
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {store.adjusting ? null : (
        <Button
          className="self-center text-muted-foreground"
          disabled={store.isBusy || wizard.isSubmitting}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setConfirmingEmpty(true)}
        >
          {t("WorkspaceSetup.empty.action")}
        </Button>
      )}

      <ConfirmDialog
        anchorScope="setup-empty-confirm"
        confirmLabel={t("WorkspaceSetup.empty.confirm")}
        confirmVariant="default"
        description={t("WorkspaceSetup.empty.description")}
        open={confirmingEmpty}
        title={t("WorkspaceSetup.empty.title")}
        onCancel={() => setConfirmingEmpty(false)}
        onConfirm={wizard.startEmpty}
      />
    </section>
  );
});
