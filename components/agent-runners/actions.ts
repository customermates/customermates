"use server";

import type { CreateAgentRunnerData, RevokeAgentRunnerData } from "@/features/agent-runners/agent-runner.schema";

import {
  getCreateAgentRunnerInteractor,
  getGetAgentRunnersInteractor,
  getRevokeAgentRunnerInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";

export async function createAgentRunnerAction(data: CreateAgentRunnerData) {
  return serializeResult(getCreateAgentRunnerInteractor().invoke(data));
}

export async function revokeAgentRunnerAction(data: RevokeAgentRunnerData) {
  return serializeResult(getRevokeAgentRunnerInteractor().invoke(data));
}

export async function refreshAgentRunnersAction() {
  return serializeTypedResult(getGetAgentRunnersInteractor().invoke());
}
