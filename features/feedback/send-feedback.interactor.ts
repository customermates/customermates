import type { FeedbackType } from "./send-feedback.schema";
import type { EmailService } from "@/features/email/email.service";

import React from "react";

import { SendFeedbackSchema, type SendFeedbackData } from "./send-feedback.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import Feedback from "@/components/emails/feedback";
import { DEFAULT_EMAIL_LAYOUT_COPY } from "@/components/emails/base/email-layout-copy";
import { env } from "@/env";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

const SUBJECT_MAP: Record<FeedbackType, string> = {
  general: "General Feedback",
};

@TenantInteractor()
export class SendFeedbackInteractor extends AuthenticatedInteractor<SendFeedbackData, SendFeedbackData> {
  constructor(private emailService: EmailService) {
    super();
  }

  @Validate(SendFeedbackSchema)
  @ValidateOutput(SendFeedbackSchema)
  async invoke(data: SendFeedbackData): Validated<SendFeedbackData> {
    const { email, firstName, lastName } = this.user;
    const userName = `${firstName} ${lastName}`;

    const subject = SUBJECT_MAP[data.type];

    await this.emailService.send({
      to: env.RESEND_OPERATOR_EMAIL,
      subject: `${subject} from ${userName}`,
      react: React.createElement(Feedback, {
        feedback: data.feedback,
        layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
        locale: DEFAULT_LOCALE,
        userEmail: email,
        userName: userName,
        subject: subject,
      }),
    });

    return { ok: true as const, data };
  }
}
