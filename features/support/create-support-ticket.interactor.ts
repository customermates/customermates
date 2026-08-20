import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import type { FeedbackCreator } from "@/features/feedback/feedback.creator";

export const CreateSupportTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export type CreateSupportTicketData = Data<typeof CreateSupportTicketSchema>;

const OutputSchema = z.object({ sent: z.literal(true) });
type SupportRequestResult = Data<typeof OutputSchema>;

@TenantInteractor()
export class CreateSupportTicketInteractor extends AuthenticatedInteractor<
  CreateSupportTicketData,
  SupportRequestResult
> {
  constructor(private feedbackCreator: FeedbackCreator) {
    super();
  }

  @Validate(CreateSupportTicketSchema)
  @ValidateOutput(OutputSchema)
  async invoke(data: CreateSupportTicketData): Validated<SupportRequestResult> {
    await this.feedbackCreator.create({
      details: data.body,
      subject: `Support request: ${data.subject}`,
      user: this.user,
    });

    return { ok: true as const, data: { sent: true as const } };
  }
}
