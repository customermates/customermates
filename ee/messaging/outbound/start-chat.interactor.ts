import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingProvider, ConnectedAccount } from "@/generated/prisma";
import type { MessagingService } from "../messaging.service";

import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { normalizeChannelValue } from "@/features/contacts/channel-value";
import { isHandleProvider } from "../provider";
import { formatRetryAfter } from "../retry-after";

import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";

export const StartChatInputSchema = z.object({
  connectedAccountId: z.uuid(),
  attendeeIdentifiers: z.array(z.string().min(1)).min(1),
  text: z.string().min(1).max(20_000),
  subject: z.string().max(998).optional(),
});

export type StartChatData = Data<typeof StartChatInputSchema>;

export abstract class StartChatContactRepo {
  abstract findContactChannelCompanyWide(args: {
    provider: MessagingProvider;
    identifier: string;
  }): Promise<{ id: string; messagingId: string | null } | null>;
  abstract saveResolvedContactChannel(args: {
    id: string;
    messagingId: string;
    displayName: string | null;
    profileUrl: string | null;
  }): Promise<void>;
}

type ResolvedAttendees = { ok: true; ids: string[] } | { ok: false; error: string; retryAfterSeconds?: number };

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class StartChatInteractor extends AuthenticatedInteractor<StartChatData, null> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private contactRepo: StartChatContactRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Write({
    input: StartChatInputSchema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
    tx: false,
  })
  async invoke(data: StartChatData): Validated<null> {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    const attendees = isHandleProvider(account.provider)
      ? await this.resolveAttendees(account, data.attendeeIdentifiers)
      : { ok: true as const, ids: data.attendeeIdentifiers };

    if (!attendees.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<null>(
          t(`Common.errors.${attendees.error}`, {
            retryAfter: formatRetryAfter(await getLocale(), attendees.retryAfterSeconds),
          }),
        ),
      };
    }

    const res = await this.messagingService.startChat({
      accountId: account.unipileAccountId,
      usersIds: attendees.ids,
      text: data.text,
      name: data.subject,
    });

    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<null>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    return { ok: true as const, data: null };
  }

  private async precheck(data: StartChatData, ctx: z.RefinementCtx) {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);
    data.attendeeIdentifiers.forEach((raw, index) => {
      const normalized = normalizeChannelValue(account.provider, raw);
      if (!normalized) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.invalidChannelValue },
          path: ["attendeeIdentifiers", index],
        });
        return;
      }
      data.attendeeIdentifiers[index] = normalized;
    });
  }

  private async resolveAttendees(account: ConnectedAccount, identifiers: string[]): Promise<ResolvedAttendees> {
    const ids: string[] = [];

    for (const identifier of identifiers) {
      const channel = await this.contactRepo.findContactChannelCompanyWide({ provider: account.provider, identifier });

      if (channel?.messagingId) {
        ids.push(channel.messagingId);
        continue;
      }

      const res = await this.messagingService.getProviderProfile({
        accountId: account.unipileAccountId,
        identifier,
      });
      if (!res.ok) return { ok: false, error: res.error, retryAfterSeconds: res.retryAfterSeconds };

      if (channel) {
        await this.contactRepo.saveResolvedContactChannel({
          id: channel.id,
          messagingId: res.data.providerId,
          displayName: res.data.displayName,
          profileUrl: res.data.profileUrl,
        });
      }

      ids.push(res.data.providerId);
    }

    return { ok: true, ids };
  }
}
