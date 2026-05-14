import type { Validated, Data } from "@/core/validation/validation.utils";
import type { EmailService } from "@/features/email/email.service";
import type { GetOrCreateInviteTokenInteractor } from "@/features/company/get-or-create-invite-token.interactor";
import type { GetCompanyDetailsInteractor } from "@/features/company/get-company-details.interactor";

import { z } from "zod";

import { createElement } from "react";
import { getTranslations } from "next-intl/server";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { env } from "@/env";
import CompanyInvite from "@/components/emails/company-invite";

const Schema = z.object({
  emails: z.array(z.email()).min(1).max(20),
});

const ResultSchema = z.object({
  sent: z.number(),
});

export type InviteUsersByEmailData = Data<typeof Schema>;
export type InviteUsersByEmailResult = Data<typeof ResultSchema>;

@TenantInteractor({ resource: Resource.users, action: Action.create })
export class InviteUsersByEmailInteractor extends AuthenticatedInteractor<
  InviteUsersByEmailData,
  InviteUsersByEmailResult
> {
  constructor(
    private readonly emailService: EmailService,
    private readonly getOrCreateInviteToken: GetOrCreateInviteTokenInteractor,
    private readonly getCompanyDetails: GetCompanyDetailsInteractor,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(ResultSchema)
  async invoke(data: InviteUsersByEmailData): Validated<InviteUsersByEmailResult> {
    const user = getTenantUser();
    const [tokenResult, companyResult] = await Promise.all([
      this.getOrCreateInviteToken.invoke(),
      this.getCompanyDetails.invoke(),
    ]);

    const inviteLink = `${env.BASE_URL}/invitation/${tokenResult.data.token}`;
    const companyName = companyResult.data.name ?? "Customermates";
    const inviterName = `${user.firstName} ${user.lastName}`.trim();

    const t = await getTranslations("CompanyInvite");
    const subject = t("subject", { companyName });
    const preview = t("preview", { inviterName, companyName });
    const intro = t("intro", { inviterName });
    const cta = t("cta");
    const fallback = t("fallback");

    const uniqueEmails = Array.from(new Set(data.emails.map((e) => e.toLowerCase())));

    await Promise.all(
      uniqueEmails.map((email) =>
        this.emailService.send({
          to: email,
          subject,
          react: createElement(CompanyInvite, { inviteLink, subject, preview, intro, cta, fallback }),
        }),
      ),
    );

    return { ok: true as const, data: { sent: uniqueEmails.length } };
  }
}
