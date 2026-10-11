"use client";

import { Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

import { displayedFollowUpValue } from "./setup-interview-state";
import { followUpDescriptor } from "./setup-question-descriptor";
import { SetupQuestionField } from "./setup-question-field";

export const SetupFollowUps = observer(function SetupFollowUps() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const setup = store.setup;
  if (!setup) return null;
  const currency = store.answers.currency?.value;

  return (
    <section aria-busy={store.isBusy} className="flex animate-page-result-in flex-col gap-6 motion-reduce:animate-none">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("WorkspaceSetup.interview.followUpsTitle")}</h2>

        <p className="text-sm text-muted-foreground">{t("WorkspaceSetup.interview.followUpsSubtitle")}</p>
      </div>

      {store.pendingFollowUps.map((question) => (
        <SetupQuestionField
          key={question.id}
          currency={currency?.format === "singleChoice" ? currency.value : null}
          descriptor={followUpDescriptor(question)}
          disabled={store.isBusy}
          value={displayedFollowUpValue(question, setup, store.followUpDrafts)}
          onChange={(value) => store.setFollowUpAnswer(question.id, value)}
        />
      ))}

      <div className="flex justify-end border-t border-border pt-4">
        <Button
          disabled={!store.canConfirmFollowUps || store.isBusy}
          type="button"
          onClick={() => runUserAction(store.confirmFollowUps)}
        >
          {store.pending === "followUps" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

          {t("WorkspaceSetup.actions.looksRight")}
        </Button>
      </div>
    </section>
  );
});
