import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { MessagingProvider, Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const OutputSchema = z.object({
  provider: z.enum(MessagingProvider),
  value: z.string(),
  displayName: z.string().nullable(),
  profileUrl: z.string().nullable(),
  messagingId: z.string().nullable(),
});
export type ChannelCandidateDto = Data<typeof OutputSchema>;

const Schema = z.object({
  query: z.string().trim().min(2),
});
export type SearchChannelCandidatesData = Data<typeof Schema>;

export abstract class SearchChannelCandidatesRepo {
  abstract searchChannelCandidates(query: string): Promise<ChannelCandidateDto[]>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class SearchChannelCandidatesInteractor extends AuthenticatedInteractor<
  SearchChannelCandidatesData,
  ChannelCandidateDto[]
> {
  constructor(private repo: SearchChannelCandidatesRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: SearchChannelCandidatesData): Validated<ChannelCandidateDto[]> {
    const candidates = await this.repo.searchChannelCandidates(data.query);
    return { ok: true as const, data: candidates };
  }
}
