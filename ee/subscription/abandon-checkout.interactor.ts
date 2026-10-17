import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { AbandonCheckoutRepo } from "./abandon-checkout.repo";

@TenantInteractor({ resource: Resource.company, manage: "update" })
export class AbandonCheckoutInteractor extends AuthenticatedInteractor<void, null> {
  constructor(private repo: AbandonCheckoutRepo) {
    super();
  }

  async invoke(): Promise<{ ok: true; data: null }> {
    await this.repo.clearCheckoutStart();

    return { ok: true, data: null };
  }
}
