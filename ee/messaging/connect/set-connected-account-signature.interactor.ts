import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ConnectedAccountDto } from "../messaging.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { ConnectedAccountDtoSchema } from "../messaging.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({
  id: z.uuid(),
  signature: z.string().max(2_000),
});
export type SetConnectedAccountSignatureData = Data<typeof Schema>;

export abstract class SetConnectedAccountSignatureRepo {
  abstract setAccountSignatureOrThrow(args: { id: string; signature: string | null }): Promise<ConnectedAccountDto>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class SetConnectedAccountSignatureInteractor extends AuthenticatedInteractor<
  SetConnectedAccountSignatureData,
  ConnectedAccountDto
> {
  constructor(
    private repo: SetConnectedAccountSignatureRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(ConnectedAccountDtoSchema)
  async invoke(data: SetConnectedAccountSignatureData): Validated<ConnectedAccountDto> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const signature = data.signature.trim();
    const updated = await this.repo.setAccountSignatureOrThrow({ id: data.id, signature: signature || null });

    return { ok: true as const, data: updated };
  }
}
