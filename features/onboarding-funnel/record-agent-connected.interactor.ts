import type { OnboardingFunnelRepo } from "./onboarding-funnel.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";

export const AGENT_RECORD_WRITE_TOOLS: ReadonlySet<string> = new Set(["mutate_crm_record", "import_crm_records"]);

@TenantInteractor()
export class RecordAgentConnectedInteractor {
  constructor(private readonly repo: OnboardingFunnelRepo) {}

  async invoke(): Promise<{ ok: true; data: { recorded: boolean } }> {
    const recorded = await this.repo.recordFunnelEvent({ type: "agentConnected", occurredAt: new Date() });
    return { ok: true as const, data: { recorded } };
  }
}
