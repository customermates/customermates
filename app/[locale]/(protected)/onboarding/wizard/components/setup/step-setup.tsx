"use client";

import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupStore } from "./workspace-setup.store";

import { Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo } from "react";
import { useLocale } from "next-intl";

import { isClientTransportError } from "@/core/errors/client-transport-error";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { startBackgroundPoll } from "@/core/utils/background-poll";

import { SetupBuildView } from "./setup-build-view";
import { SetupFollowUps } from "./setup-follow-ups";
import { SetupInterview } from "./setup-interview";
import { SetupPlanFailed, SetupPlanPending, SetupPlanPreview } from "./setup-plan-preview";
import { SetupStart } from "./setup-start";

export const SETUP_POLL_INTERVAL_MS = 2_500;

export function useSetupPolling(store: WorkspaceSetupStore) {
  const shouldPoll = store.shouldPoll;
  useEffect(() => {
    if (!shouldPoll) return;
    let reportedFailure = false;
    return startBackgroundPoll({
      refresh: () => store.refresh(),
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
  const locale = useLocale();
  const signature = JSON.stringify(initialStatus);
  useMemo(() => {
    store.setLocale(locale);
    store.hydrate(JSON.parse(signature) as WorkspaceSetupStatusView);
  }, [locale, signature, store]);
  useSetupPolling(store);
  return store;
}

export const StepSetup = observer(function StepSetup() {
  const { workspaceSetupStore: store, onboardingWizardStore: wizard } = useRootStore();
  const stage = store.stage;
  const startWithStandardSetup = async () => {
    if (await store.applyStandardSetup()) await wizard.completeSetupStep();
  };

  useEffect(() => {
    if (stage === "unavailable" || stage === "done") runUserAction(wizard.completeSetupStep);
  }, [stage, wizard]);

  switch (stage) {
    case "start":
      return <SetupStart />;
    case "interview":
      return <SetupInterview />;
    case "followUps":
      return <SetupFollowUps />;
    case "planning":
      return <SetupPlanPending />;
    case "planFailed":
      return <SetupPlanFailed onStandard={startWithStandardSetup} />;
    case "plan":
      return <SetupPlanPreview onStandard={startWithStandardSetup} />;
    case "build":
      return <SetupBuildView onContinue={wizard.completeSetupStep} onStandard={startWithStandardSetup} />;
    case "unavailable":
    case "done":
      return (
        <div aria-busy="true" className="flex min-h-36 items-center justify-center">
          <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
        </div>
      );
  }
});
