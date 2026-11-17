"use server";

import type {
  DeleteAgentProviderKeyData,
  SaveAgentProviderKeyInput,
  TestAgentProviderKeyData,
} from "@/ee/agent-keys/agent-provider-key.schema";
import type { GetAgentJobData, GetAgentJobsData } from "@/features/agent-jobs/agent-job.schema";

import {
  getDeleteAgentProviderKeyInteractor,
  getGetAgentJobInteractor,
  getGetAgentJobsInteractor,
  getGetAgentProviderKeysInteractor,
  getSaveAgentProviderKeyInteractor,
  getTestAgentProviderKeyInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";

export async function saveAgentProviderKeyAction(data: SaveAgentProviderKeyInput) {
  return serializeResult(getSaveAgentProviderKeyInteractor().invoke(data));
}

export async function testAgentProviderKeyAction(data: TestAgentProviderKeyData) {
  return serializeResult(getTestAgentProviderKeyInteractor().invoke(data));
}

export async function deleteAgentProviderKeyAction(data: DeleteAgentProviderKeyData) {
  return serializeResult(getDeleteAgentProviderKeyInteractor().invoke(data));
}

export async function refreshAgentProviderKeysAction() {
  return serializeTypedResult(getGetAgentProviderKeysInteractor().invoke());
}

export async function getAgentJobsAction(data: GetAgentJobsData) {
  return serializeTypedResult(getGetAgentJobsInteractor().invoke(data));
}

export async function getAgentJobAction(data: GetAgentJobData) {
  return serializeTypedResult(getGetAgentJobInteractor().invoke(data));
}
