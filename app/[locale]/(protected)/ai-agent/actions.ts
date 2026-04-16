"use server";

import type { UpsertAgentKeysData } from "@/ee/agent/provision-agent.interactor";
import type { SetAgentEnvironmentVariableData } from "@/ee/agent/set-agent-environment-variable.interactor";

import {
  getCheckAgentHealthInteractor,
  getGetAgentControlUrlInteractor,
  getGetAgentProvisionedInteractor,
  getProvisionAgentInteractor,
  getResetAgentInteractor,
  getSetAgentEnvironmentVariableInteractor,
  getVerifyAgentMachineInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function checkAgentHealthAction(): Promise<{ healthy: boolean }> {
  const result = await getCheckAgentHealthInteractor().invoke();
  return { healthy: result.data };
}

export async function getAgentProvisionedAction(): Promise<{ provisioned: boolean }> {
  const result = await getGetAgentProvisionedInteractor().invoke();
  return { provisioned: result.data };
}

export async function upsertAgentKeysAction(data: UpsertAgentKeysData) {
  return serializeResult(getProvisionAgentInteractor().invoke(data));
}

export async function resetAgentAction() {
  return getResetAgentInteractor().invoke();
}

export async function verifyAgentMachineAction(): Promise<{ exists: boolean }> {
  const result = await getVerifyAgentMachineInteractor().invoke();
  return { exists: result.data };
}

export async function getAgentControlUrlAction(): Promise<{ url: string; token: string; machineId: string } | null> {
  const result = await getGetAgentControlUrlInteractor().invoke();
  return result.data;
}

export async function setAgentEnvironmentVariableAction(data: SetAgentEnvironmentVariableData) {
  return serializeResult(getSetAgentEnvironmentVariableInteractor().invoke(data));
}
