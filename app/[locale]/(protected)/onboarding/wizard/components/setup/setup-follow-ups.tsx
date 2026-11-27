"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { focusFirstInvalidField } from "@/components/forms/focus-first-invalid-field";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

import { displayedFollowUpValue } from "./setup-interview-state";
import { followUpDescriptor } from "./setup-question-descriptor";
import { SetupQuestionField } from "./setup-question-field";

export const SetupFollowUps = observer(function SetupFollowUps() {
  const { workspaceSetupStore: store } = useRootStore();
  const setup = store.setup;
  if (!setup) return null;

  return (
    <section
      aria-busy={store.isBusy}
      className="flex animate-page-result-in flex-col gap-6 motion-reduce:animate-none"
      id="setup-follow-ups"
    >
      {store.pendingFollowUps.map((question) => (
        <SetupQuestionField
          key={question.id}
          currency={store.currency}
          descriptor={followUpDescriptor(question)}
          disabled={store.isBusy}
          invalid={store.answerMissing(question.id)}
          value={displayedFollowUpValue(question, setup, store.followUpDrafts)}
          onChange={(value) => store.setFollowUpAnswer(question.id, value)}
        />
      ))}
    </section>
  );
});

export const SetupFollowUpsFooter = observer(function SetupFollowUpsFooter() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();

  return (
    <AppCardFooter className="justify-end">
      <Button
        className="min-h-11 max-sm:w-full"
        disabled={store.isBusy}
        id="setup-follow-ups-continue"
        type="button"
        onClick={() => {
          if (store.showMissingAnswers(t("Common.errors.mustNotBeBlank")))
            focusFirstInvalidField(document.getElementById("setup-follow-ups"));
          else runUserAction(store.confirmFollowUps);
        }}
      >
        {store.pending === "followUps" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

        {t("OnboardingWizard.continue")}

        {store.pending === "followUps" ? null : <ArrowRight aria-hidden="true" className="size-4" />}
      </Button>
    </AppCardFooter>
  );
});
