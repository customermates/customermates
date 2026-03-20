"use server";

import type { UpsertAgentKeysData } from "@/ee/agent/provision-agent.interactor";
import type { SetAgentEnvironmentVariableData } from "@/ee/agent/set-agent-environment-variable.interactor";

import { di } from "@/core/dependency-injection/container";
import { CheckAgentHealthInteractor } from "@/ee/agent/check-agent-health.interactor";
import { GetAgentControlUrlInteractor } from "@/ee/agent/get-agent-control-url.interactor";
import { GetAgentProvisionedInteractor } from "@/ee/agent/get-agent-provisioned.interactor";
import { ProvisionAgentInteractor } from "@/ee/agent/provision-agent.interactor";
import { ResetAgentInteractor } from "@/ee/agent/reset-agent.interactor";
import { SetAgentEnvironmentVariableInteractor } from "@/ee/agent/set-agent-environment-variable.interactor";
import { VerifyAgentMachineInteractor } from "@/ee/agent/verify-agent-machine.interactor";
import { serializeResult } from "@/core/utils/action-result";

export async function checkAgentHealthAction(): Promise<{ healthy: boolean }> {
  const healthy = await di.get(CheckAgentHealthInteractor).invoke();
  return { healthy };
}

export async function getAgentProvisionedAction(): Promise<{ provisioned: boolean }> {
  const provisioned = await di.get(GetAgentProvisionedInteractor).invoke();
  return { provisioned };
}

export async function upsertAgentKeysAction(data: UpsertAgentKeysData) {
  return serializeResult(di.get(ProvisionAgentInteractor).invoke(data));
}

export async function resetAgentAction() {
  return di.get(ResetAgentInteractor).invoke();
}

export async function verifyAgentMachineAction(): Promise<{ exists: boolean }> {
  const exists = await di.get(VerifyAgentMachineInteractor).invoke();
  return { exists };
}

export async function getAgentControlUrlAction(): Promise<{ url: string; token: string; machineId: string } | null> {
  return await di.get(GetAgentControlUrlInteractor).invoke();
}

export async function setAgentEnvironmentVariableAction(data: SetAgentEnvironmentVariableData) {
  return serializeResult(di.get(SetAgentEnvironmentVariableInteractor).invoke(data));
}
