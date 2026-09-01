"use server";

import type { UpdateHostedAiEnterpriseAllowanceData } from "@/ee/operator/operator.schema";

import { getUpdateHostedAiEnterpriseAllowanceInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function updateOperatorEnterpriseAllowanceAction(data: UpdateHostedAiEnterpriseAllowanceData) {
  return serializeResult(getUpdateHostedAiEnterpriseAllowanceInteractor().invoke(data));
}
