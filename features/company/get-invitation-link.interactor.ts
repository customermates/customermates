import type { Data, Validated } from "@/core/validation/validation.utils";
import type { GetOrCreateInviteTokenInteractor } from "@/features/company/get-or-create-invite-token.interactor";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { InvitationLinkRequestSchema, InvitationLinkSchema, invitationLink } from "@/features/company/invitation-link";

type InvitationLinkRequest = Data<typeof InvitationLinkRequestSchema>;
type InvitationLink = Data<typeof InvitationLinkSchema>;

@TenantInteractor({ resource: Resource.users, manage: "create" })
export class GetInvitationLinkInteractor extends AuthenticatedInteractor<InvitationLinkRequest, InvitationLink> {
  constructor(private readonly getOrCreateInviteToken: GetOrCreateInviteTokenInteractor) {
    super();
  }

  @Validate(InvitationLinkRequestSchema)
  @ValidateOutput(InvitationLinkSchema)
  async invoke(_input: InvitationLinkRequest): Validated<InvitationLink> {
    const token = await this.getOrCreateInviteToken.invoke();
    return {
      ok: true as const,
      data: { link: await invitationLink(token.data.token), expiresAt: token.data.expiresAt },
    };
  }
}
