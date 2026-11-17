"use client";

import type { AgentRunnerDto } from "@/features/agent-runners/agent-runner.schema";

import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { AgentRunnersCard } from "./agent-runners-card";

type Props = { runners: AgentRunnerDto[] };

function AgentRunnersPageViewContent({ runners }: Props) {
  return <AgentRunnersCard runners={runners} />;
}

export const AgentRunnersPageView = serverRenderedClient(AgentRunnersPageViewContent);
