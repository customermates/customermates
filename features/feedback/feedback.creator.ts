import type { EmailService } from "@/features/email/email.service";
import type { TenantUser } from "@/features/user/user.schema";

import React from "react";

import Feedback from "@/components/emails/feedback";
import { DEFAULT_EMAIL_LAYOUT_COPY } from "@/components/emails/base/email-layout-copy";
import { env } from "@/env";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

type FeedbackSender = Pick<TenantUser, "email" | "firstName" | "lastName">;

export type FeedbackCreatorData = {
  details: string;
  subject: string;
  user: FeedbackSender;
};

export class FeedbackCreator {
  constructor(private readonly emailService: EmailService) {}

  async create(data: FeedbackCreatorData): Promise<void> {
    const userName = `${data.user.firstName} ${data.user.lastName}`;

    await this.emailService.send(
      {
        to: env.RESEND_OPERATOR_EMAIL,
        subject: `${data.subject} from ${userName}`,
        react: React.createElement(Feedback, {
          feedback: data.details,
          layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
          locale: DEFAULT_LOCALE,
          userEmail: data.user.email,
          userName,
          subject: data.subject,
        }),
      },
      { throwOnProviderError: true },
    );
  }
}
