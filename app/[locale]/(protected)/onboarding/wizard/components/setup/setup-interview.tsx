"use client";

import type { SetupQuestion } from "@/features/workspace-setup/setup-interview";

import { Globe, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { SETUP_SCREEN_DEFINITIONS, SETUP_SCREENS } from "@/features/workspace-setup/setup-interview";

import { answerFromWebsite, displayedAnswerValue, partVisible, screenQuestions } from "./setup-interview-state";
import { partDescriptor } from "./setup-question-descriptor";
import { SetupQuestionField } from "./setup-question-field";
import { SetupSpreadsheetUpload } from "./setup-spreadsheet-upload";

export function SetupScreenSteps({ current, titles }: { current: number; titles: string[] }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {t("WorkspaceSetup.interview.stepProgress", { current: current + 1, total: titles.length })}
      </p>

      <WizardProgress
        current={current + 1}
        label={t("WorkspaceSetup.interview.stepsLabel")}
        total={titles.length}
        valueText={titles[current] ?? ""}
      />
    </div>
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
          descriptor={partDescriptor(part, t)}
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

const SetupWebsiteContext = observer(function SetupWebsiteContext() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const website = store.setup?.websiteUrl ?? null;
  const editable = store.setup?.status === "interview" && !store.adjusting;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const reading = store.pending === "website";

  if (website && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Globe aria-hidden className="size-4 shrink-0" />

          <span className="truncate">{t("WorkspaceSetup.website.from", { website: new URL(website).host })}</span>
        </span>

        {editable ? (
          <Button
            disabled={store.isBusy}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(new URL(website).host);
              setEditing(true);
            }}
          >
            {t("WorkspaceSetup.website.change")}
          </Button>
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
    <div className="flex flex-col gap-1.5">
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

        <Button disabled={store.isBusy || !draft.trim()} type="button" variant="secondary" onClick={submit}>
          {reading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Globe aria-hidden />}

          {t("WorkspaceSetup.website.read")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t("OnboardingWizard.profile.websiteDescription")}</p>
    </div>
  );
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

      <SetupWebsiteContext />

      {store.adjusting ? <Alert color="primary" description={t("WorkspaceSetup.interview.adjusting")} /> : null}

      {store.prefillRunning ? (
        <p aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />

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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
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
