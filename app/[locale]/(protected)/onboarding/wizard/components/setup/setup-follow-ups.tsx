"use client";

import { Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { useTranslations } from "next-intl";

import { focusFirstInvalidField } from "@/components/forms/focus-first-invalid-field";

import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

import { displayedFollowUpValue } from "./setup-interview-state";
import { followUpDescriptor } from "./setup-question-descriptor";
import { SetupQuestionField } from "./setup-question-field";

export const SetupFollowUps = observer(function SetupFollowUps() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const section = useRef<HTMLElement>(null);
  const setup = store.setup;
  if (!setup) return null;

  return (
    <section
      ref={section}
      aria-busy={store.isBusy}
      className="flex animate-page-result-in flex-col gap-6 motion-reduce:animate-none"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("WorkspaceSetup.interview.followUpsTitle")}</h2>

        <p className="text-sm text-muted-foreground">{t("WorkspaceSetup.interview.followUpsSubtitle")}</p>
      </div>

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

      <div className="flex justify-end">
        <Button
          disabled={store.isBusy}
          type="button"
          onClick={() => {
            if (store.showMissingAnswers(t("Common.errors.mustNotBeBlank"))) focusFirstInvalidField(section.current);
            else runUserAction(store.confirmFollowUps);
          }}
        >
          {store.pending === "followUps" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

          {t("OnboardingWizard.next")}
        </Button>
      </div>
    </section>
  );
});
