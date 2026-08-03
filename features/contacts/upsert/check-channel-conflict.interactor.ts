import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ContactIdentifierOwnersRepo } from "../contact-identifier-owners.repo";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";

import { IdentifierInputSchema } from "../contact.schema";

import { channelStrings, identifierKey } from "./validate-identifiers";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";
import { normalizeChannelValue } from "@/features/contacts/channel-value";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = IdentifierInputSchema.pick({
  provider: true,
  value: true,
  messagingId: true,
})
  .extend({ contactId: z.string().optional() })
  .superRefine((data, ctx) => {
    const normalized = normalizeChannelValue(data.provider, data.value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.invalidChannelValue }, path: ["value"] });
      return;
    }
    data.value = normalized;
  });
export type CheckChannelConflictData = Data<typeof Schema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.create },
    { resource: Resource.contacts, action: Action.update },
  ],
  condition: "OR",
})
export class CheckChannelConflictInteractor extends AuthenticatedInteractor<CheckChannelConflictData, boolean> {
  constructor(private owners: ContactIdentifierOwnersRepo) {
    super();
  }

  @Validate(Schema)
  async invoke(data: CheckChannelConflictData): Validated<boolean> {
    const identifier = { value: data.value, messagingId: data.messagingId };
    const owners = await this.owners.findIdentifierOwnersCompanyWide(
      channelStrings(identifier).map((value) => ({ provider: data.provider, value })),
    );

    const conflict = channelStrings(identifier).some((value) => {
      const owner = owners.get(identifierKey(data.provider, value));
      return owner !== undefined && owner !== data.contactId;
    });

    if (conflict) {
      const t = await getTranslations();
      return { ok: false, error: createZodError<boolean>(t("Common.errors.channelAlreadyLinked"), ["value"]) };
    }

    return { ok: true as const, data: true };
  }
}
