import React from "react";
import { z } from "zod";

import { SupportTicketSource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import { env } from "@/env";
import SupportEscalation from "@/components/emails/support-escalation";

import type { EmailService } from "@/features/email/email.service";

import type { PrismaSupportRepo } from "./prisma-support.repository";

export const CreateSupportTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  source: z.enum(SupportTicketSource),
});

export type CreateSupportTicketData = Data<typeof CreateSupportTicketSchema>;

type CreatedTicket = { id: string; number: number };

@TenantInteractor()
export class CreateSupportTicketInteractor extends AuthenticatedInteractor<CreateSupportTicketData, CreatedTicket> {
  constructor(
    private repo: PrismaSupportRepo,
    private emailService: EmailService,
  ) {
    super();
  }

  @Validate(CreateSupportTicketSchema)
  async invoke(data: CreateSupportTicketData): Validated<CreatedTicket> {
    const user = getTenantUser();

    const ticket = await this.repo.createSupportTicket({ subject: data.subject, body: data.body, source: data.source });

    await this.emailService.send({
      to: env.RESEND_OPERATOR_EMAIL,
      subject: `Support ticket #${ticket.number} from ${user.firstName} ${user.lastName}`,
      react: React.createElement(SupportEscalation, {
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        companyName: user.companyId,
        conversationTitle: `#${ticket.number}: ${data.subject}`,
        lastMessages: data.body,
      }),
    });

    return { ok: true as const, data: ticket };
  }
}
