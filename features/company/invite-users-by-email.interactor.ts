import type { Validated, Data } from "@/core/validation/validation.utils";
import type { EmailService } from "@/features/email/email.service";
import type { GetOrCreateInviteTokenInteractor } from "@/features/company/get-or-create-invite-token.interactor";

import { z } from "zod";

import { createHash } from "node:crypto";
import { createElement } from "react";
import { getTranslations } from "next-intl/server";
import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import CompanyInvite from "@/components/emails/company-invite";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { getRequestAppLocale } from "@/i18n/request-app-locale";
import { invitationLink } from "@/features/company/invitation-link";

export const InviteUsersByEmailSchema = z.object({
  emails: z.array(z.email()).min(1).max(20),
});

export const InviteUsersByEmailResultSchema = z.object({
  sent: z.number(),
  failed: z.number(),
  failedEmails: z.array(z.email()),
});

export type InviteUsersByEmailData = Data<typeof InviteUsersByEmailSchema>;
type InviteUsersByEmailResult = Data<typeof InviteUsersByEmailResultSchema>;

@TenantInteractor({ resource: Resource.users, manage: "create" })
export class InviteUsersByEmailInteractor extends AuthenticatedInteractor<
  InviteUsersByEmailData,
  InviteUsersByEmailResult
> {
  constructor(
    private readonly emailService: EmailService,
    private readonly getOrCreateInviteToken: GetOrCreateInviteTokenInteractor,
  ) {
    super();
  }

  @Validate(InviteUsersByEmailSchema)
  @ValidateOutput(InviteUsersByEmailResultSchema)
  async invoke(data: InviteUsersByEmailData): Validated<InviteUsersByEmailResult> {
    const user = this.user;
    const tokenResult = await this.getOrCreateInviteToken.invoke();

    const inviteLink = await invitationLink(tokenResult.data.token);
    const inviterName = `${user.firstName} ${user.lastName}`.trim();

    const t = await getTranslations();
    const locale = await getRequestAppLocale();
    const subject = t("CompanyInvite.subject");
    const preview = t("CompanyInvite.preview", { inviterName });
    const intro = t("CompanyInvite.intro", { inviterName });
    const cta = t("CompanyInvite.cta");
    const fallback = t("CompanyInvite.fallback");
    const layoutCopy = await getEmailLayoutCopy(locale);

    const uniqueEmails = Array.from(new Set(data.emails.map((e) => e.toLowerCase())));

    const accepted = await Promise.all(
      uniqueEmails.map((email) =>
        this.emailService.send({
          to: email,
          subject,
          react: createElement(CompanyInvite, {
            locale,
            layoutCopy,
            inviteLink,
            subject,
            preview,
            intro,
            cta,
            fallback,
          }),
          deduplicationKey: `company-invite/${createHash("sha256")
            .update(JSON.stringify([inviteLink, email, locale, inviterName]))
            .digest("hex")}`,
        }),
      ),
    );

    const failedEmails = uniqueEmails.filter((_, index) => !accepted[index]);

    return {
      ok: true as const,
      data: { sent: uniqueEmails.length - failedEmails.length, failed: failedEmails.length, failedEmails },
    };
  }
}
