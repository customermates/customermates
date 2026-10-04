import { fail } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";

import { z } from "zod";

import { Action, MessagingProvider, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { normalizeChannelValue } from "@/features/records/channel-value";
import { getProviderProfileUrl, isHandleProvider } from "../provider";
import { retryAfterPhrase } from "../retry-after.server";

const Schema = z.object({
  connectedAccountId: z.uuid(),
  identifier: z.string().min(1),
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
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({
    input: Schema,
    output: OutputSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
    tx: false,
  })
  async invoke(data: ResolveProviderProfileData): Validated<ResolvedProviderProfile> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);
    if (!isHandleProvider(account.provider)) return fail(CustomErrorCode.generic);

    const res = await this.messagingService.getProviderProfile({
      accountId: account.unipileAccountId,
      identifier: data.identifier,
    });
    if (!res.ok) return fail(res.error, [], { retryAfter: await retryAfterPhrase(res.retryAfterSeconds) });

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

  private async precheck(data: ResolveProviderProfileData, ctx: z.RefinementCtx) {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);
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
  }
}
