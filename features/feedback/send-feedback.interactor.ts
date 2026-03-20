import React from "react";

import { FeedbackType, SendFeedbackSchema, type SendFeedbackData } from "./send-feedback.schema";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { EmailService } from "@/features/email/email.service";
import XFeedback from "@/components/x-emails/x-feedback";

const SUBJECT_MAP: Record<FeedbackType, string> = {
  general: "General Feedback",
};

@TentantInteractor()
export class SendFeedbackInteractor extends UserAccessor {
  constructor(private emailService: EmailService) {
    super();
  }

  @Validate(SendFeedbackSchema)
  async invoke(data: SendFeedbackData): Validated<SendFeedbackData> {
    const { email, firstName, lastName } = this.user;
    const userName = `${firstName} ${lastName}`;

    const subject = SUBJECT_MAP[data.type];

    await this.emailService.send({
      to: "feedback@customermates.com",
      subject: `${subject} from ${userName}`,
      react: React.createElement(XFeedback, {
        feedback: data.feedback,
        userEmail: email,
        userName: userName,
        subject: subject,
      }),
    });

    return { ok: true, data };
  }
}
