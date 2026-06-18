import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { MessagingProvider, Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { normalizeChannelValue } from "@/features/contacts/channel-value";
import { getConnectedAccountRepo } from "@/core/di";
import { getProviderProfileUrl, isHandleProvider } from "../provider-icon";

const Schema = z
  .object({
    connectedAccountId: z.uuid(),
    identifier: z.string().min(1),
  })
  .superRefine(async (data, ctx) => {
    const account = await getConnectedAccountRepo().findUsableAccountByIdOrThrow(data.connectedAccountId);

    const normalized = normalizeChannelValue(account.provider, data.identifier);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.invalidChannelValue },
        path: ["identifier"],
      });
      return;
    }
    data.identifier = normalized;
  });
export type ResolveProviderProfileData = Data<typeof Schema>;

const OutputSchema = z.object({
  provider: z.enum(MessagingProvider),
  providerId: z.string(),
  publicIdentifier: z.string().nullable(),
  displayName: z.string().nullable(),
  profileUrl: z.string().nullable(),
});
type ResolvedProviderProfile = Data<typeof OutputSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class ResolveProviderProfileInteractor extends AuthenticatedInteractor<
  ResolveProviderProfileData,
  ResolvedProviderProfile
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: ResolveProviderProfileData): Validated<ResolvedProviderProfile> {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);
    const t = await getTranslations();

    if (!isHandleProvider(account.provider)) {
      return {
        ok: false,
        error: createZodError<ResolvedProviderProfile>(t("Common.errors.generic")),
      };
    }

    const res = await this.messagingService.getProviderProfile({
      accountId: account.unipileAccountId,
      identifier: data.identifier,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: createZodError<ResolvedProviderProfile>(t(`Common.errors.${res.error}`)),
      };
    }

    const profileUrl =
      res.data.profileUrl ?? getProviderProfileUrl(account.provider, res.data.publicIdentifier ?? data.identifier);

    return {
      ok: true as const,
      data: {
        provider: account.provider,
        providerId: res.data.providerId,
        publicIdentifier: res.data.publicIdentifier,
        displayName: res.data.displayName,
        profileUrl,
      },
    };
  }
}
