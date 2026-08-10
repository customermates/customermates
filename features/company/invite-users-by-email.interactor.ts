import type { Validated, Data } from "@/core/validation/validation.utils";
import type { EmailService } from "@/features/email/email.service";
import type { GetOrCreateInviteTokenInteractor } from "@/features/company/get-or-create-invite-token.interactor";

import { z } from "zod";

import { createElement } from "react";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { resolveRequestOrigin } from "@/core/config/environment";
import { env } from "@/env";
import CompanyInvite from "@/components/emails/company-invite";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

export const InviteUsersByEmailSchema = z.object({
  emails: z.array(z.email()).min(1).max(20),
});

const OutputSchema = z.object({
  sent: z.number(),
});

export type InviteUsersByEmailData = Data<typeof InviteUsersByEmailSchema>;
type InviteUsersByEmailResult = Data<typeof OutputSchema>;

@TenantInteractor({ resource: Resource.users, action: Action.create })
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
  @ValidateOutput(OutputSchema)
  async invoke(data: InviteUsersByEmailData): Validated<InviteUsersByEmailResult> {
    const user = getTenantUser();
    const tokenResult = await this.getOrCreateInviteToken.invoke();

    const requestOrigin = (await headers()).get("origin") ?? env.BASE_URL;
    const baseUrl = resolveRequestOrigin(requestOrigin, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);
    const inviteLink = `${baseUrl}/invitation/${tokenResult.data.token}`;
    const inviterName = `${user.firstName} ${user.lastName}`.trim();

    const t = await getTranslations();
    const locale = appLocaleOrDefault(await getLocale());
    const subject = t("CompanyInvite.subject");
    const preview = t("CompanyInvite.preview", { inviterName });
    const intro = t("CompanyInvite.intro", { inviterName });
    const cta = t("CompanyInvite.cta");
    const fallback = t("CompanyInvite.fallback");

    const uniqueEmails = Array.from(new Set(data.emails.map((e) => e.toLowerCase())));

    await Promise.all(
      uniqueEmails.map((email) =>
        this.emailService.send({
          to: email,
          subject,
          react: createElement(CompanyInvite, {
            locale,
            inviteLink,
            subject,
            preview,
            intro,
            cta,
            fallback,
          }),
        }),
      ),
    );

    return { ok: true as const, data: { sent: uniqueEmails.length } };
  }
}
