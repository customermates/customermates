import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ConnectedAccountDto, ConnectedAccountRecord } from "../messaging.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { EmailSettings } from "../email-settings";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { ConnectedAccountAppDtoSchema } from "../messaging.schema";
import { ConnectedAccountEmailSchema } from "../email-settings";
import { toConnectedAccountDto } from "./connected-account-dto";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = ConnectedAccountEmailSchema.extend({
  id: z.uuid(),
});
export type SetConnectedAccountSignatureData = Data<typeof Schema>;

export abstract class SetConnectedAccountSignatureRepo {
  abstract setAccountSignatureOrThrow(args: {
    id: string;
    signature: string | null;
    settings: EmailSettings;
  }): Promise<ConnectedAccountRecord>;
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

  @Validate(Schema)
  @ValidateOutput(ConnectedAccountAppDtoSchema)
  async invoke(data: SetConnectedAccountSignatureData): Validated<ConnectedAccountDto> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const signature = data.signature.trim();
    const updated = await this.repo.setAccountSignatureOrThrow({
      id: data.id,
      signature: signature || null,
      settings: data.settings,
    });

    return { ok: true as const, data: toConnectedAccountDto(updated) };
  }
}
