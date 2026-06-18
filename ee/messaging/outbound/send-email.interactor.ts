import type { Data, Validated } from "@/core/validation/validation.utils";

import type { ConnectedAccount, MessagingThread } from "../messaging.schema";
import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

const AttendeeSchema = z.object({
  identifier: z.email(),
  display_name: z.string().optional(),
});

const Schema = z
  .object({
    threadId: z.uuid().optional(),
    connectedAccountId: z.uuid().optional(),
    to: z.array(AttendeeSchema).min(1).max(100),
    cc: z.array(z.email()).max(100).optional(),
    bcc: z.array(z.email()).max(100).optional(),
    subject: z.string().min(1).max(998),
    body: z.string().min(1).max(100_000),
  })
  .superRefine((d, ctx) => {
    if (!d.threadId && !d.connectedAccountId) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.sendEmailTargetRequired },
        path: ["threadId"],
      });
    }
  });
export type SendEmailData = Data<typeof Schema>;

export abstract class SendEmailRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract findLatestUnipileMessageIdForThread(threadId: string): Promise<string | null>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SendEmailInteractor extends AuthenticatedInteractor<SendEmailData, null> {
  constructor(
    private repo: SendEmailRepo,
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Validate(Schema)
  async invoke(data: SendEmailData): Validated<null> {
    let account: ConnectedAccount;
    let replyTo: string | undefined;

    if (data.threadId) {
      const thread = await this.repo.findThreadByIdOrThrow(data.threadId);
      account = await this.accountRepo.findUsableAccountByIdOrThrow(thread.connectedAccountId);
      replyTo = (await this.repo.findLatestUnipileMessageIdForThread(thread.id)) ?? undefined;
    } else if (data.connectedAccountId)
      account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);
    else {
      throw new Error(
        "send-email reached with neither threadId nor connectedAccountId; schema validation should prevent this",
      );
    }

    const res = await this.messagingService.sendEmail({
      accountId: account.unipileAccountId,
      to: data.to,
      cc: data.cc?.map((identifier) => ({ identifier })),
      bcc: data.bcc?.map((identifier) => ({ identifier })),
      subject: data.subject,
      body: data.body,
      replyTo,
    });

    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<null>(t(`Common.errors.${res.error}`)),
      };
    }

    return { ok: true as const, data: null };
  }
}
