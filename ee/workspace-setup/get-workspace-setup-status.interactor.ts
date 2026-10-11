import type { Validated } from "@/core/validation/validation.utils";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupStatusView } from "./workspace-setup-status";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";

import { workspaceSetupUnavailability } from "./workspace-setup-availability";
import { WORKSPACE_SETUP_PLATFORM_PURPOSE, WORKSPACE_SETUP_SPEND_CAP_MICROCENTS } from "./workspace-setup-spend";
import { workspaceSetupView } from "./workspace-setup-status";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class GetWorkspaceSetupStatusInteractor extends AuthenticatedInteractor<void, WorkspaceSetupStatusView> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private usage: Pick<AgentUsageService, "workspacePlatformSpend">,
  ) {
    super();
  }

  async invoke(): Validated<WorkspaceSetupStatusView> {
    const unavailable = workspaceSetupUnavailability();
    if (unavailable) return { ok: true, data: { available: false, reason: unavailable, setup: null } };
    const setup = await this.repo.findCurrent();
    if (!setup) return { ok: true, data: { available: true, setup: null } };
    const [crawl, spend] = await Promise.all([
      setup.crawlId ? this.repo.crawlState(setup.crawlId) : Promise.resolve(null),
      this.usage.workspacePlatformSpend({ companyId: this.companyId, purpose: WORKSPACE_SETUP_PLATFORM_PURPOSE }),
    ]);
    return {
      ok: true,
      data: { available: true, setup: workspaceSetupView(setup, crawl, spend, WORKSPACE_SETUP_SPEND_CAP_MICROCENTS) },
    };
  }
}
