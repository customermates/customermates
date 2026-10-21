import type { CountPendingMembersRepo } from "./count-pending-members.repo";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.users, manage: "update" })
export class CountPendingMembersInteractor extends AuthenticatedInteractor<void, number> {
  constructor(private repo: CountPendingMembersRepo) {
    super();
  }

  @ValidateOutput(z.number())
  async invoke(): Promise<{ ok: true; data: number }> {
    return { ok: true as const, data: await this.repo.countPendingMembers() };
  }
}
