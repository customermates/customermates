"use client";

import type { SetupQuestion } from "@/features/workspace-setup/setup-interview";

import { Globe, Loader2, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { Fragment, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { focusFirstInvalidField } from "@/components/forms/focus-first-invalid-field";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { SETUP_BASICS_QUESTION, SETUP_QUESTIONS } from "@/features/workspace-setup/setup-interview";

import { answerFromWebsite, displayedAnswerValue, partVisible } from "./setup-interview-state";
import { SetupActionBar } from "./setup-plan-preview";
import { partDescriptor } from "./setup-question-descriptor";
import { SetupQuestionField } from "./setup-question-field";
import { partsSummary } from "./setup-screen-summary";
import { SetupSpreadsheetUpload } from "./setup-spreadsheet-upload";
import { SetupStartEmpty } from "./setup-start";
import { SetupTimeline, type SetupTimelineRow } from "./setup-timeline";

const SetupQuestionBlock = observer(function SetupQuestionBlock({ question }: { question: SetupQuestion }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const parts = question.parts.filter((part) => partVisible(part, store.answers));
  if (!parts.length) return null;
  const suggestion = store.stepSuggestion;
  const fields = parts.map((part) => {
    const answer = store.answers[part.id]?.value;
    const steps =
      part.id === "mainSteps" && suggestion ? (t.raw(`WorkspaceSetup.suggestedSteps.${suggestion}`) as string[]) : null;
    return (
      <Fragment key={part.id}>
        <SetupQuestionField
          currency={store.currency}
          descriptor={partDescriptor(part, t, store.answers)}
          disabled={store.isBusy}
          fromWebsite={answerFromWebsite(store.answers, part.id)}
          invalid={store.answerMissing(part.id)}
          value={
            steps
              ? { format: "orderedList", items: steps.map((label) => ({ label })) }
              : displayedAnswerValue(part, store.answers, store.locale)
          }
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
    const failed = store.setup?.interview.prefill === "failed";
    const stage = progress?.stage ?? null;
    const { sourcesFound, sourcesRead } = store.setup?.knowledgeBase ?? { sourcesFound: 0, sourcesRead: 0 };
    const rows: SetupTimelineRow[] = [
      stage === "finding"
        ? { key: "finding", status: "running", label: t("WorkspaceSetup.website.finding", { website: host }) }
        : {
            key: "finding",
            status: "done",
            label: t("WorkspaceSetup.website.found", { website: host, count: sourcesFound }),
          },
    ];
    if (progress && stage === "reading") {
      rows.push({
        key: "reading",
        status: "running",
        label: t("WorkspaceSetup.website.reading", { website: host, read: progress.read, total: progress.total }),
      });
    } else if (stage !== "finding") {
      rows.push({
        key: "reading",
        status: "done",
        label: t("WorkspaceSetup.website.readPages", { count: sourcesRead }),
      });
    }
    if (stage === "suggesting") {
      rows.push({
        key: "suggesting",
        status: "running",
        label: t("WorkspaceSetup.website.suggesting", { website: host }),
      });
    } else if (stage === null) {
      rows.push({
        key: "suggesting",
        status: failed ? "error" : "done",
        label: failed ? t("WorkspaceSetup.interview.prefillFailed") : t("WorkspaceSetup.website.suggested"),
      });
    }
    const running = rows.find((row) => row.status === "running");
    const summary = running
      ? String(running.label)
      : failed
        ? t("WorkspaceSetup.interview.prefillFailed")
        : t("WorkspaceSetup.website.suggestedHint");

    return (
      <div className="flex flex-col gap-1">
        <SetupTimeline
          action={
            editable ? (
              <Button
                disabled={store.isBusy}
                size="xs"
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(host);
                  setEditing(true);
                }}
              >
                {t("WorkspaceSetup.website.change")}
              </Button>
            ) : null
          }
          rows={rows}
          status={running ? "running" : failed ? "error" : "done"}
          summary={summary}
        />

        {progress ? <p className="pl-5.5 text-xs text-muted-foreground">{t("WorkspaceSetup.website.eta")}</p> : null}
      </div>
    );
  }
  if (!editable || !editing) return null;

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

const SetupBasics = observer(function SetupBasics({ question }: { question: SetupQuestion }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const [open, setOpen] = useState(false);
  const missing = question.parts.some((part) => store.answerMissing(part.id));
  if (open || missing) return <SetupQuestionBlock question={question} />;
  const summary = partsSummary(question.parts, store.answers, store.locale, store.currency, t);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span>{summary}</span>

      <Button
        className="-my-1 h-auto px-1 py-0.5"
        disabled={store.isBusy}
        size="sm"
        type="button"
        variant="link"
        onClick={() => setOpen(true)}
      >
        {t("WorkspaceSetup.website.change")}
      </Button>
    </div>
  );
});

export const SetupInterview = observer(function SetupInterview() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const section = useRef<HTMLElement>(null);
  const saving = store.pending === "save";

  return (
    <section ref={section} aria-busy={store.isBusy} className="flex flex-col gap-6">
      <SetupWebsiteContext />

      {store.adjusting ? <Alert color="primary" description={t("WorkspaceSetup.interview.adjusting")} /> : null}

      <div aria-label={t("WorkspaceSetup.interview.stepsLabel")} className="flex flex-col gap-6" role="group">
        {SETUP_QUESTIONS.map((question) =>
          question.id === SETUP_BASICS_QUESTION ? (
            <SetupBasics key={question.id} question={question} />
          ) : (
            <SetupQuestionBlock key={question.id} question={question} />
          ),
        )}
      </div>

      <SetupActionBar hint={t("WorkspaceSetup.interview.planHint")}>
        {store.adjusting ? (
          <Button disabled={store.isBusy} type="button" variant="secondary" onClick={store.discardAdjustment}>
            {t("Common.actions.back")}
          </Button>
        ) : null}

        <Button
          disabled={store.isBusy}
          type="button"
          onClick={() => {
            if (store.showMissingAnswers(t("Common.errors.mustNotBeBlank"))) focusFirstInvalidField(section.current);
            else runUserAction(store.confirmScreen);
          }}
        >
          {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

          {t("WorkspaceSetup.interview.showPlan")}
        </Button>
      </SetupActionBar>

      {store.adjusting ? null : <SetupStartEmpty />}
    </section>
  );
});
