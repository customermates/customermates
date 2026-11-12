import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAgentFirstCallRepo } from "./onboarding-agent.repo";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";

const MAX_REMEMBERED_WORKSPACES = 10_000;
const recordedWorkspaces = new Set<string>();

function remember(companyId: string) {
  if (recordedWorkspaces.size >= MAX_REMEMBERED_WORKSPACES) recordedWorkspaces.clear();
  recordedWorkspaces.add(companyId);
}

export function forgetRecordedAgentFirstCalls() {
  recordedWorkspaces.clear();
}

@TenantInteractor()
export class RecordAgentFirstCallInteractor extends AuthenticatedInteractor<void, { recorded: boolean }> {
  constructor(private readonly repo: RecordAgentFirstCallRepo) {
    super();
  }

  async invoke(): Validated<{ recorded: boolean }> {
    const companyId = this.companyId;
    if (recordedWorkspaces.has(companyId)) return { ok: true as const, data: { recorded: false } };
    const recorded = await this.repo.recordAgentFirstCall();
    remember(companyId);
    return { ok: true as const, data: { recorded } };
  }
}
