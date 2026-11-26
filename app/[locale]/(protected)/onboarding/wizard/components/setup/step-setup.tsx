"use client";

import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupStore } from "./workspace-setup.store";

import { observer } from "mobx-react-lite";
import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { GenericPageLoading } from "@/components/page-state/generic-page-loading";

import { isClientTransportError } from "@/core/errors/client-transport-error";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { startBackgroundPoll } from "@/core/utils/background-poll";

import { SetupBuildFooter, SetupBuildView } from "./setup-build-view";
import { SetupFollowUps, SetupFollowUpsFooter } from "./setup-follow-ups";
import { SetupPlanReview, SetupPlanReviewFooter } from "./setup-plan-review";
import { SetupQuestions, SetupQuestionsFooter } from "./setup-questions";

const SETUP_POLL_INTERVAL_MS = 2_500;

function useSetupPolling(store: WorkspaceSetupStore) {
  const shouldPoll = store.shouldPoll;
  useEffect(() => {
    if (!shouldPoll) return;
    let reportedFailure = false;
    return startBackgroundPoll({
      refresh: () => store.poll(),
      intervalMs: SETUP_POLL_INTERVAL_MS,
      onError: (error) => {
        if (isClientTransportError(error) || reportedFailure) return;
        reportedFailure = true;
        reportApplicationError(error);
      },
    });
  }, [shouldPoll, store]);
}

export function useHydratedSetupStore(initialStatus: WorkspaceSetupStatusView) {
  const { workspaceSetupStore: store } = useRootStore();
  const signature = JSON.stringify(initialStatus);
  const [hydratedSignature, setHydratedSignature] = useState<string | null>(null);
  useLayoutEffect(() => {
    store.hydrate(JSON.parse(signature) as WorkspaceSetupStatusView);
    setHydratedSignature(signature);
  }, [signature, store]);
  useSetupPolling(store);
  return { store, ready: hydratedSignature === signature };
}

function SetupLoading() {
  const t = useTranslations();
  return (
    <div aria-busy="true" className="flex min-h-36">
      <GenericPageLoading label={t("Loading.text")} />
    </div>
  );
}

export const StepSetup = observer(function StepSetup() {
  const { workspaceSetupStore: store } = useRootStore();
  const stage = store.stage;

  useEffect(() => {
    if (stage === "start") runUserAction(store.start);
  }, [stage, store]);

  switch (stage) {
    case "interview":
      return <SetupQuestions />;
    case "followUps":
      return <SetupFollowUps />;
    case "planning":
    case "planFailed":
    case "plan":
      return <SetupPlanReview />;
    case "build":
      return <SetupBuildView />;
    case "start":
    case "unavailable":
      return <SetupLoading />;
  }
});

export const StepSetupFooter = observer(function StepSetupFooter() {
  const { workspaceSetupStore: store } = useRootStore();
  switch (store.stage) {
    case "interview":
      return <SetupQuestionsFooter />;
    case "followUps":
      return <SetupFollowUpsFooter />;
    case "planning":
    case "planFailed":
    case "plan":
      return <SetupPlanReviewFooter />;
    case "build":
      return <SetupBuildFooter />;
    case "start":
    case "unavailable":
      return null;
  }
});
