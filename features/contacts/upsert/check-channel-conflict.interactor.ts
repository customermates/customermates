import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { IdentifierInputSchema } from "../contact.schema";

import { channelStrings, identifierKey } from "./validate-identifiers";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { normalizeChannelValue } from "@/features/contacts/channel-value";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getContactRepo } from "@/core/di";

export const CheckChannelConflictSchema = IdentifierInputSchema.pick({
  provider: true,
  value: true,
  messagingId: true,
})
  .extend({ contactId: z.string().optional() })
  .superRefine(async (data, ctx) => {
    const normalized = normalizeChannelValue(data.provider, data.value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.invalidChannelValue }, path: ["value"] });
      return;
    }

    const identifier = { value: normalized, messagingId: data.messagingId };
    const owners = await getContactRepo().findIdentifierOwners(
      channelStrings(identifier).map((value) => ({ provider: data.provider, value })),
    );

    const conflict = channelStrings(identifier).some((value) => {
      const owner = owners.get(identifierKey(data.provider, value));
      return owner !== undefined && owner !== data.contactId;
    });

    if (conflict)
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.channelAlreadyLinked }, path: ["value"] });
  });
export type CheckChannelConflictData = Data<typeof CheckChannelConflictSchema>;

@TenantInteractor({
  resource: Resource.contacts,
  action: Action.update,
})
export class CheckChannelConflictInteractor extends AuthenticatedInteractor<CheckChannelConflictData, boolean> {
  @Validate(CheckChannelConflictSchema)
  invoke(_data: CheckChannelConflictData): Validated<boolean> {
    return Promise.resolve({ ok: true, data: true });
  }
}
