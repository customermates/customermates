import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ConnectedAccountDto } from "../messaging.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Resource } from "@/generated/prisma";

import { ConnectedAccountAppDtoSchema } from "../messaging.schema";
import { ConnectedAccountEmailSchema } from "../email-settings";
import { toConnectedAccountDto } from "./connected-account-dto";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { SetConnectedAccountSignatureRepo } from "./set-connected-account-signature.repo";

export const SetConnectedAccountSignatureFieldsSchema = z
  .object({
    signature: ConnectedAccountEmailSchema.shape.signature.optional(),
    settings: ConnectedAccountEmailSchema.shape.settings.optional(),
  })
  .strict();

const Schema = SetConnectedAccountSignatureFieldsSchema.extend({ id: z.uuid() })
  .strict()
  .refine((data) => data.signature !== undefined || data.settings !== undefined, {
    path: ["signature"],
    params: { error: CustomErrorCode.connectedAccountEmailChangeRequired },
  });
export type SetConnectedAccountSignatureData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
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

    return runInTransaction(async () => {
      const current = await this.repo.findOwnedAccountEmail(data.id);
      if (!current) return failNotFound(CustomErrorCode.connectedAccountNotFound, ["id"]);
      const updated = await this.repo.setAccountSignatureOrThrow({
        id: data.id,
        signature: data.signature === undefined ? current.signature : data.signature.trim() || null,
        settings: data.settings ?? current.settings,
      });
      return { ok: true as const, data: toConnectedAccountDto(updated) };
    });
  }
}
