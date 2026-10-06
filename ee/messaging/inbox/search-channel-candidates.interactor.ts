import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { MessagingProvider, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { zx } from "@/core/validation/validation.utils";

const OutputSchema = z.object({
  provider: z.enum(MessagingProvider),
  value: z.string(),
  displayName: z.string().nullable(),
  profileUrl: z.string().nullable(),
  messagingId: z.string().nullable(),
});
export type ChannelCandidateDto = Data<typeof OutputSchema>;

const Schema = z.object({
  query: zx.nulFreeText().trim().min(2),
});
export type SearchChannelCandidatesData = Data<typeof Schema>;

export abstract class SearchChannelCandidatesRepo {
  abstract searchChannelCandidates(query: string): Promise<ChannelCandidateDto[]>;
}

@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class SearchChannelCandidatesInteractor extends AuthenticatedInteractor<
  SearchChannelCandidatesData,
  ChannelCandidateDto[]
> {
  constructor(
    private repo: SearchChannelCandidatesRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: SearchChannelCandidatesData): Validated<ChannelCandidateDto[]> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const candidates = await this.repo.searchChannelCandidates(data.query);
    return { ok: true as const, data: candidates };
  }
}
