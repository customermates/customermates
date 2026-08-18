import React from "react";
import { z } from "zod";

import { SupportTicketSource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import { env } from "@/env";
import SupportEscalation from "@/components/emails/support-escalation";
import { DEFAULT_EMAIL_LAYOUT_COPY } from "@/components/emails/base/email-layout-copy";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import type { EmailService } from "@/features/email/email.service";

import type { PrismaSupportRepo } from "./prisma-support.repository";

export const CreateSupportTicketSchema = z
  .object({
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(10000),
    source: z.enum(SupportTicketSource),
    idempotencyId: z.uuid().optional(),
    agentConversationId: z.uuid().optional(),
    transcript: z.string().max(40000).optional(),
  })
  .refine((data) => !data.agentConversationId || data.source === SupportTicketSource.chat, {
    path: ["agentConversationId"],
    message: "Only hosted Assistant tickets can reference a conversation.",
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
    const user = this.user;

    const creation = await this.repo.createSupportTicketOrThrow({
      subject: data.subject,
      body: data.body,
      source: data.source,
      ...(data.idempotencyId ? { idempotencyId: data.idempotencyId } : {}),
      ...(data.agentConversationId ? { agentConversationId: data.agentConversationId } : {}),
    });

    if (creation.created) {
      await this.emailService.send({
        to: env.RESEND_OPERATOR_EMAIL,
        subject: `Support ticket #${creation.number} from ${user.firstName} ${user.lastName}`,
        react: React.createElement(SupportEscalation, {
          userName: `${user.firstName} ${user.lastName}`,
          userEmail: user.email,
          companyName: user.companyId,
          conversationTitle: `#${creation.number}: ${data.subject}`,
          layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
          lastMessages: data.transcript?.trim() || data.body,
          locale: DEFAULT_LOCALE,
        }),
      });
    }

    return { ok: true as const, data: { id: creation.id, number: creation.number } };
  }
}
