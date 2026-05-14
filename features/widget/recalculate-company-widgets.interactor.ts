import type { WidgetService } from "./widget.service";
import type { ExtendedUser } from "@/features/user/user.types";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { runWithTenant } from "@/core/decorators/tenant-context";

export const RecalculateCompanyWidgetsPayloadSchema = z.object({
  companyId: z.uuid(),
});
export type RecalculateCompanyWidgetsPayload = z.infer<typeof RecalculateCompanyWidgetsPayloadSchema>;

export abstract class FindCompanyWidgetOwnersRepo {
  abstract findActiveWidgetOwnersInCompany(companyId: string): Promise<ExtendedUser[]>;
}

@SystemInteractor
export class RecalculateCompanyWidgetsInteractor {
  constructor(
    private userRepo: FindCompanyWidgetOwnersRepo,
    private widgetService: WidgetService,
  ) {}

  @Enforce(RecalculateCompanyWidgetsPayloadSchema)
  async invoke(payload: RecalculateCompanyWidgetsPayload): Promise<{ ok: true; recalculatedOwners: number }> {
    const owners = await this.userRepo.findActiveWidgetOwnersInCompany(payload.companyId);

    for (const owner of owners) await runWithTenant(owner, () => this.widgetService.recalculateUserWidgets());

    return { ok: true, recalculatedOwners: owners.length };
  }
}
