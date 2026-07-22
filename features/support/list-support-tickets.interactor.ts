import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Validated } from "@/core/validation/validation.utils";

import type { PrismaSupportRepo } from "./prisma-support.repository";

type TicketList = Awaited<ReturnType<PrismaSupportRepo["listMySupportTickets"]>>;

@TenantInteractor({ resource: Resource.api, action: Action.readOwn })
export class ListSupportTicketsInteractor extends AuthenticatedInteractor<void, TicketList> {
  constructor(private repo: PrismaSupportRepo) {
    super();
  }

  async invoke(): Validated<TicketList> {
    return { ok: true as const, data: await this.repo.listMySupportTickets() };
  }
}
