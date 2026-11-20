"use client";

import type { AgentProviderKeyDto } from "@/ee/agent-keys/agent-provider-key.schema";
import type { AgentJobPage } from "@/features/agent-jobs/agent-job.schema";
import type { ListedAgentRunner } from "@/features/agent-runners/get-agent-runners.interactor";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";

import { observer } from "mobx-react-lite";
import { useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AgentRunsCard } from "@/components/agent-jobs/agent-runs-card";
import { AgentRunnersCard } from "@/components/agent-runners/agent-runners-card";
import { Alert } from "@/components/shared/alert";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { AgentKeyModal } from "./agent-key-modal";
import { AgentKeysCard } from "./agent-keys-card";
import { agentRuntimeWithKeys } from "./agent-runtime-with-keys";
import { AgentRuntimesCard } from "./agent-runtimes-card";

type Props = {
  availability: AgentRuntimeAvailability;
  keys: AgentProviderKeyDto[];
  runners: ListedAgentRunner[] | null;
  runs: AgentJobPage | null;
};

const AgentsPageViewContent = observer(({ availability, keys, runners, runs }: Props) => {
  const t = useTranslations();
  const { agentKeysStore } = useRootStore();

  useState(() => agentKeysStore.setItems(keys));
  useLayoutEffect(() => agentKeysStore.setItems(keys), [agentKeysStore, keys]);

  return (
    <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-4 motion-reduce:animate-none">
      <Alert description={t("AgentKeys.intro")} variant="neutral" />

      <AgentRuntimesCard availability={agentRuntimeWithKeys(availability, agentKeysStore.items.length)} />

      <AgentKeysCard planAllowed={availability.ownKey.reason !== "plan"} />

      <AgentRunnersCard runners={runners} />

      {runs ? <AgentRunsCard page={runs} /> : null}

      <AgentKeyModal />
    </div>
  );
});

export const AgentsPageView = serverRenderedClient(AgentsPageViewContent);
