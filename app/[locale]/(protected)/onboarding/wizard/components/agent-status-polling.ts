import { useEffect } from "react";

import type { OnboardingWizardStore } from "./onboarding-wizard.store";

import { isClientTransportError } from "@/core/errors/client-transport-error";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { startBackgroundPoll } from "@/core/utils/background-poll";

export const AGENT_STATUS_POLL_INTERVAL_MS = 2_500;

export function useAgentStatusPolling(store: OnboardingWizardStore, active: boolean) {
  useEffect(() => {
    if (!active) return;
    let reportedFailure = false;
    return startBackgroundPoll({
      refresh: () => store.refreshAgentStatus(),
      intervalMs: AGENT_STATUS_POLL_INTERVAL_MS,
      immediate: true,
      onError: (error) => {
        if (isClientTransportError(error) || reportedFailure) return;
        reportedFailure = true;
        reportApplicationError(error);
      },
    });
  }, [active, store]);
}
