import type { EmailService } from "@/features/email/email.service";

import { createElement } from "react";

import { SendContactInquirySchema, type SendContactInquiryData } from "./send-contact-inquiry.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import type { Validated } from "@/core/validation/validation.utils";
import ContactInquiry from "@/components/emails/contact-inquiry";
import { DEFAULT_EMAIL_LAYOUT_COPY } from "@/components/emails/base/email-layout-copy";
import { env } from "@/env";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

@SystemInteractor
export class SendContactInquiryInteractor {
  constructor(private readonly emailService: EmailService) {}

  @Validate(SendContactInquirySchema)
  @ValidateOutput(SendContactInquirySchema)
  async invoke(data: SendContactInquiryData): Validated<SendContactInquiryData> {
    await this.emailService.send({
      to: env.RESEND_OPERATOR_EMAIL,
      subject: `Contact inquiry from ${data.name}`,
      react: createElement(ContactInquiry, {
        name: data.name,
        email: data.email,
        company: data.company,
        layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
        locale: DEFAULT_LOCALE,
        message: data.message,
      }),
    });

    return { ok: true as const, data };
  }
}
