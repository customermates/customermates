"use client";

import type { ListedAgentRunner } from "@/features/agent-runners/get-agent-runners.interactor";

import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { AgentRunnersCard } from "./agent-runners-card";

type Props = { runners: ListedAgentRunner[] | null };

function AgentRunnersPageViewContent({ runners }: Props) {
  return <AgentRunnersCard runners={runners} />;
}

export const AgentRunnersPageView = serverRenderedClient(AgentRunnersPageViewContent);
