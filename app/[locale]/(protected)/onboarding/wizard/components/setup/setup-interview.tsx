"use client";

import type { SetupQuestion } from "@/features/workspace-setup/setup-interview";

import { Globe, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { IconContainer } from "@/components/shared/icon-container";
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
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(store.screenIndex);
  const titles = SETUP_SCREEN_DEFINITIONS.map((screen) => t(screen.titleKey));
  const visibleScreens = store.visibleScreens;
  const position = Math.max(0, visibleScreens.indexOf(store.screenIndex));
  const setup = store.setup;
  const prefillFailed = setup?.interview.prefill === "failed" && Boolean(setup.websiteUrl);
  const saving = store.pending === "save";

  useEffect(() => {
    if (previous.current !== store.screenIndex) heading.current?.focus();
    previous.current = store.screenIndex;
  }, [store.screenIndex]);

  return (
    <section aria-busy={store.isBusy} className="flex flex-col gap-6">
      <SetupScreenSteps current={position} titles={visibleScreens.map((index) => titles[index])} />

      <SetupWebsiteContext />

      {store.adjusting ? <Alert color="primary" description={t("WorkspaceSetup.interview.adjusting")} /> : null}

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
    </section>
  );
});
