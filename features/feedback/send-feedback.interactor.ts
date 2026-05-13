import type { FeedbackType } from "./send-feedback.schema";
import type { EmailService } from "@/features/email/email.service";

import React from "react";

import { SendFeedbackSchema, type SendFeedbackData } from "./send-feedback.schema";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";
import Feedback from "@/components/emails/feedback";
import { env } from "@/env";

const SUBJECT_MAP: Record<FeedbackType, string> = {
  general: "General Feedback",
};

@TentantInteractor()
export class SendFeedbackInteractor extends BaseInteractor<SendFeedbackData, SendFeedbackData> {
  constructor(private emailService: EmailService) {
    super();
  }

  @Validate(SendFeedbackSchema)
  @ValidateOutput(SendFeedbackSchema)
  async invoke(data: SendFeedbackData): Validated<SendFeedbackData> {
    const { email, firstName, lastName } = getTenantUser();
    const userName = `${firstName} ${lastName}`;

    const subject = SUBJECT_MAP[data.type];

    await this.emailService.send({
      to: env.RESEND_OPERATOR_EMAIL,
      subject: `${subject} from ${userName}`,
      react: React.createElement(Feedback, {
        feedback: data.feedback,
        userEmail: email,
        userName: userName,
        subject: subject,
      }),
    });

    return { ok: true as const, data };
  }
}
