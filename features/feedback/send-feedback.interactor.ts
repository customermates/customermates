import type { FeedbackType } from "./send-feedback.schema";
import type { FeedbackCreator } from "./feedback.creator";

import { SendFeedbackSchema, type SendFeedbackData } from "./send-feedback.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const SUBJECT_MAP: Record<FeedbackType, string> = {
  general: "General Feedback",
};

@TenantInteractor()
export class SendFeedbackInteractor extends AuthenticatedInteractor<SendFeedbackData, SendFeedbackData> {
  constructor(private feedbackCreator: FeedbackCreator) {
    super();
  }

  @Validate(SendFeedbackSchema)
  @ValidateOutput(SendFeedbackSchema)
  async invoke(data: SendFeedbackData): Validated<SendFeedbackData> {
    const subject = SUBJECT_MAP[data.type];
    await this.feedbackCreator.create({
      details: data.feedback,
      subject,
      user: this.user,
    });

    return { ok: true as const, data };
  }
}
