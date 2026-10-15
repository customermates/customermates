"use client";

import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupStore } from "./workspace-setup.store";

import { observer } from "mobx-react-lite";
import { useEffect, useLayoutEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { GenericPageLoading } from "@/components/page-state/generic-page-loading";

import { isClientTransportError } from "@/core/errors/client-transport-error";
import { reportApplicationError } from "@/core/errors/report-application-error";
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
  const [hydratedSignature, setHydratedSignature] = useState<string | null>(null);
  useLayoutEffect(() => {
    store.setLocale(locale);
    store.hydrate(JSON.parse(signature) as WorkspaceSetupStatusView);
    setHydratedSignature(signature);
  }, [locale, signature, store]);
  useSetupPolling(store);
  return { store, ready: hydratedSignature === signature };
}

export const StepSetup = observer(function StepSetup() {
  const t = useTranslations();
  const { workspaceSetupStore: store, onboardingWizardStore: wizard } = useRootStore();
  const stage = store.stage;

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
      return <SetupPlanFailed />;
    case "plan":
      return <SetupPlanPreview />;
    case "build":
      return <SetupBuildView onContinue={wizard.completeSetupStep} />;
    case "unavailable":
      return (
        <div aria-busy="true" className="flex min-h-36">
          <GenericPageLoading label={t("Loading.text")} />
        </div>
      );
  }
});
