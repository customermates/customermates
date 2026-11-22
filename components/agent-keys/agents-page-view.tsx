"use client";

import type { AgentProviderKeyDto } from "@/ee/agent-keys/agent-provider-key.schema";
import type { AgentJobPage } from "@/features/agent-jobs/agent-job.schema";
import type { ListedAgentRunner } from "@/features/agent-runners/get-agent-runners.interactor";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { AgentRuntimeKind } from "@/features/automation-rules/automation-rule.schema";

import { observer } from "mobx-react-lite";
import { useLayoutEffect, useState } from "react";

import { AgentRunsCard } from "@/components/agent-jobs/agent-runs-card";
import { AgentRunnersCard } from "@/components/agent-runners/agent-runners-card";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { AgentKeyModal } from "./agent-key-modal";
import { AgentKeysCard } from "./agent-keys-card";
import { AgentMatePanel } from "./agent-mate-panel";
import { AgentRuntimeCards } from "./agent-runtime-cards";
import { agentRuntimeStatus, initialAgentRuntime } from "./agent-runtime-status";
import { agentRuntimeWithKeys } from "./agent-runtime-with-keys";

type Props = {
  availability: AgentRuntimeAvailability;
  keys: AgentProviderKeyDto[];
  runners: ListedAgentRunner[] | null;
  runs: AgentJobPage | null;
};

const NO_RUNNERS: ListedAgentRunner[] = [];

const AgentsPageViewContent = observer(({ availability, keys, runners, runs }: Props) => {
  const { agentKeysStore, agentRunnersStore } = useRootStore();

  useState(() => agentKeysStore.setItems(keys));
  useLayoutEffect(() => agentKeysStore.setItems(keys), [agentKeysStore, keys]);
  useLayoutEffect(() => agentRunnersStore.setItems({ items: runners ?? NO_RUNNERS }), [agentRunnersStore, runners]);

  const keyCount = agentKeysStore.items.length;
  const effective = agentRuntimeWithKeys(availability, keyCount);
  const runnerItems = agentRunnersStore.items.length > 0 ? agentRunnersStore.items : (runners ?? NO_RUNNERS);
  const context = { keyCount, runners: runnerItems };
  const [selected, setSelected] = useState<AgentRuntimeKind>(() =>
    initialAgentRuntime(agentRuntimeWithKeys(availability, keys.length), {
      keyCount: keys.length,
      runners: runnerItems,
    }),
  );
  const statuses = {
    mate: agentRuntimeStatus("mate", effective, context),
    ownKey: agentRuntimeStatus("ownKey", effective, context),
    runner: agentRuntimeStatus("runner", effective, context),
  };

  return (
    <div
      className="animate-page-result-in flex w-full max-w-4xl flex-col gap-8 motion-reduce:animate-none"
      data-agents-page=""
    >
      <AgentRuntimeCards selected={selected} statuses={statuses} onSelect={setSelected} />

      <div data-agent-runtime-details={selected}>
        {selected === "mate" ? <AgentMatePanel option={effective.mate} /> : null}

        {selected === "ownKey" ? <AgentKeysCard planAllowed={availability.ownKey.reason !== "plan"} /> : null}

        {selected === "runner" ? <AgentRunnersCard runners={runners} /> : null}
      </div>

      {runs ? <AgentRunsCard page={runs} /> : null}

      <AgentKeyModal />
    </div>
  );
});

export const AgentsPageView = serverRenderedClient(AgentsPageViewContent);
