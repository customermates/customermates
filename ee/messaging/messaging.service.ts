import { UnsuccessfulRequestError } from "unipile-node-sdk";

import { MessagingProvider } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";

import { getUnipileClient } from "./unipile.client";
import { isEmailProvider } from "./provider-icon";
import {
  UnipileAccountSchema,
  UnipileCursorPageSchema,
  UnipileOwnerProfileSchema,
  UnipileProviderProfileSchema,
  type UnipileAccount,
  type UnipileOwnerProfile,
} from "./unipile.schema";
import { env } from "@/env";

type MessagingSendResult<T> = { ok: true; data: T } | { ok: false; error: CustomErrorCode };

const HOSTED_AUTH_EXPIRY_MINUTES = 30;

const RESYNC_PROVIDERS = new Set<MessagingProvider>([MessagingProvider.linkedin, MessagingProvider.telegram]);

type HostedAuthProviderCode = "GOOGLE" | "OUTLOOK" | "MAIL" | "LINKEDIN" | "WHATSAPP" | "INSTAGRAM" | "TELEGRAM";

const HOSTED_AUTH_PROVIDERS: HostedAuthProviderCode[] = [
  "GOOGLE",
  "OUTLOOK",
  "MAIL",
  "LINKEDIN",
  "WHATSAPP",
  "INSTAGRAM",
  "TELEGRAM",
];

interface HostedAuthLinkOptions {
  userId: string;
  successUrl: string;
  failureUrl: string;
  notifyUrl: string;
}

export class MessagingService {
  private get unipile() {
    return getUnipileClient();
  }

  async createHostedAuthLink({ userId, successUrl, failureUrl, notifyUrl }: HostedAuthLinkOptions) {
    if (!env.UNIPILE_DSN) throw new Error("UNIPILE_DSN env var is not set");

    const expiresOn = new Date(Date.now() + HOSTED_AUTH_EXPIRY_MINUTES * 60_000).toISOString();

    return this.unipile.account.createHostedAuthLink({
      type: "create",
      api_url: env.UNIPILE_DSN,
      expiresOn,
      providers: HOSTED_AUTH_PROVIDERS,
      // Unipile echoes `name` back verbatim in the account-callback webhook; we stash the
      // user's id here so the callback can resolve who connected the account.
      name: userId,
      success_redirect_url: successUrl,
      failure_redirect_url: failureUrl,
      notify_url: notifyUrl,
    });
  }

  async createReconnectHostedAuthLink(input: {
    userId: string;
    unipileAccountId: string;
    successUrl: string;
    failureUrl: string;
    notifyUrl: string;
  }) {
    if (!env.UNIPILE_DSN) throw new Error("UNIPILE_DSN env var is not set");

    const expiresOn = new Date(Date.now() + HOSTED_AUTH_EXPIRY_MINUTES * 60_000).toISOString();

    return this.unipile.account.createHostedAuthLink({
      type: "reconnect",
      api_url: env.UNIPILE_DSN,
      expiresOn,
      reconnect_account: input.unipileAccountId,
      name: input.userId,
      success_redirect_url: input.successUrl,
      failure_redirect_url: input.failureUrl,
      notify_url: input.notifyUrl,
    });
  }

  async getAccountSnapshot(unipileAccountId: string): Promise<UnipileAccount> {
    return UnipileAccountSchema.parse(await this.unipile.account.getOne(unipileAccountId));
  }

  async getOwnerAvatarUrl(unipileAccountId: string): Promise<string | null> {
    const profile = await this.getOwnerProfile(unipileAccountId);
    return profile?.profile_picture_url ?? null;
  }

  private async getOwnerProfile(unipileAccountId: string): Promise<UnipileOwnerProfile | null> {
    try {
      return UnipileOwnerProfileSchema.parse(
        await this.unipile.request.send({
          method: "GET",
          path: ["users", "me"],
          parameters: { account_id: unipileAccountId },
        }),
      );
    } catch {
      return null;
    }
  }

  async deleteRemoteAccount(unipileAccountId: string) {
    try {
      await this.unipile.account.delete(unipileAccountId);
    } catch (err) {
      const e = err as { status?: number; body?: { status?: number } } | null;
      const status = e?.status ?? e?.body?.status;

      if (status === 404) return;

      throw err;
    }
  }

  async listEmails(input: { accountId: string; after?: string; limit?: number; cursor?: string }) {
    return this.unipile.email.getAll({
      account_id: input.accountId,
      after: input.after,
      limit: input.limit,
      cursor: input.cursor,
    });
  }

  async fetchMessageAttachment(input: {
    provider: MessagingProvider;
    unipileMessageId: string;
    attachmentId: string;
  }): Promise<{
    body: ReadableStream<Uint8Array>;
    contentType: string | null;
  }> {
    const resource = isEmailProvider(input.provider) ? "emails" : "messages";

    const blob = await this.unipile.request.send<Blob>({
      method: "GET",
      path: [resource, input.unipileMessageId, "attachments", input.attachmentId],
      parameters: {},
    });

    return { body: blob.stream(), contentType: blob.type || null };
  }

  async listChats(input: { accountId: string; limit?: number; cursor?: string }) {
    return this.unipile.messaging.getAllChats({
      account_id: input.accountId,
      limit: input.limit,
      cursor: input.cursor,
    });
  }

  async listMessages(input: { accountId: string; limit?: number; cursor?: string; after?: string }) {
    return this.unipile.messaging.getAllMessages({
      account_id: input.accountId,
      limit: input.limit,
      cursor: input.cursor,
      after: input.after,
    });
  }

  async listAccountAttendees(input: { accountId: string; limit?: number; cursor?: string }) {
    return this.unipile.messaging.getAllAttendees({
      account_id: input.accountId,
      limit: input.limit,
      cursor: input.cursor,
    });
  }

  async resyncLinkedinAccount(accountId: string, product: "classic" | "sales_navigator" | "recruiter"): Promise<void> {
    await this.unipile.account.resyncLinkedinAccount({
      account_id: accountId,
      linkedin_product: product,
    });
  }

  async resyncAccount(accountId: string): Promise<void> {
    await this.unipile.request.send({
      method: "GET",
      path: ["accounts", accountId, "sync"],
      parameters: {},
    });
  }

  async triggerHistoryResync(input: { accountId: string; provider: MessagingProvider }): Promise<void> {
    if (!RESYNC_PROVIDERS.has(input.provider)) return;

    if (input.provider === MessagingProvider.linkedin) {
      for (const product of await this.linkedinResyncProducts(input.accountId))
        await this.resyncLinkedinAccount(input.accountId, product);

      return;
    }

    await this.resyncAccount(input.accountId);
  }

  private async linkedinResyncProducts(accountId: string): Promise<Array<"classic" | "sales_navigator" | "recruiter">> {
    const snapshot = await this.getAccountSnapshot(accountId);

    const premium = new Set(snapshot.connection_params?.im?.premiumFeatures ?? []);
    const products: Array<"classic" | "sales_navigator" | "recruiter"> = ["classic"];
    if (premium.has("sales_navigator")) products.push("sales_navigator");
    if (premium.has("recruiter")) products.push("recruiter");

    return products;
  }

  async listCalendars(input: {
    accountId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: unknown[]; cursor: string | null }> {
    const raw = UnipileCursorPageSchema.parse(
      await this.unipile.request.send({
        method: "GET",
        path: ["calendars"],
        parameters: {
          account_id: input.accountId,
          ...(input.cursor ? { cursor: input.cursor } : {}),
          ...(input.limit ? { limit: String(input.limit) } : {}),
        },
      }),
    );

    return { items: raw.data ?? [], cursor: raw.next_cursor ?? null };
  }

  async listCalendarEvents(input: {
    accountId: string;
    calendarId: string;
    cursor?: string;
    limit?: number;
    start?: string;
    expandRecurring?: boolean;
  }): Promise<{ items: unknown[]; cursor: string | null }> {
    const raw = UnipileCursorPageSchema.parse(
      await this.unipile.request.send({
        method: "GET",
        path: ["calendars", input.calendarId, "events"],
        parameters: {
          account_id: input.accountId,
          ...(input.cursor ? { cursor: input.cursor } : {}),
          ...(input.limit ? { limit: String(input.limit) } : {}),
          ...(input.start ? { start: input.start } : {}),
          ...(input.expandRecurring ? { expand_recurring: "true" } : {}),
        },
      }),
    );

    return { items: raw.data ?? [], cursor: raw.next_cursor ?? null };
  }

  async sendChatMessage(input: { chatId: string; text: string }): Promise<MessagingSendResult<unknown>> {
    try {
      const data = await this.unipile.messaging.sendMessage({
        chat_id: input.chatId,
        text: input.text,
      });
      return { ok: true, data };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async getProviderProfile(input: { accountId: string; identifier: string }): Promise<
    MessagingSendResult<{
      providerId: string;
      publicIdentifier: string | null;
      displayName: string | null;
      profileUrl: string | null;
      pictureUrl: string | null;
      headline: string | null;
    }>
  > {
    try {
      const profile = UnipileProviderProfileSchema.parse(
        await this.unipile.users.getProfile({
          account_id: input.accountId,
          identifier: input.identifier,
        }),
      );
      const providerId = profile.provider_id ?? profile.provider_messaging_id ?? null;
      if (!providerId) return { ok: false, error: CustomErrorCode.unipileResourceNotFound };

      const displayName =
        profile.name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();

      return {
        ok: true,
        data: {
          providerId,
          publicIdentifier: profile.public_identifier ?? null,
          displayName: displayName || null,
          profileUrl: profile.public_profile_url ?? null,
          pictureUrl: profile.profile_picture_url ?? null,
          headline: profile.headline ?? null,
        },
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async startChat(input: {
    accountId: string;
    attendeesIds: string[];
    text: string;
    subject?: string;
  }): Promise<MessagingSendResult<{ chat_id: string | null }>> {
    try {
      const data = await this.unipile.messaging.startNewChat({
        account_id: input.accountId,
        attendees_ids: input.attendeesIds,
        text: input.text,
        ...(input.subject ? { subject: input.subject } : {}),
      });
      return { ok: true, data };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async sendEmail(input: {
    accountId: string;
    to: Array<{ identifier: string; display_name?: string }>;
    cc?: Array<{ identifier: string; display_name?: string }>;
    bcc?: Array<{ identifier: string; display_name?: string }>;
    subject: string;
    body: string;
    replyTo?: string;
  }): Promise<MessagingSendResult<unknown>> {
    try {
      const data = await this.unipile.email.send({
        account_id: input.accountId,
        to: input.to,
        ...(input.cc ? { cc: input.cc } : {}),
        ...(input.bcc ? { bcc: input.bcc } : {}),
        subject: input.subject,
        body: input.body,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      });
      return { ok: true, data };
    } catch (err) {
      return this.handleError(err);
    }
  }

  private handleError(source: unknown): { ok: false; error: CustomErrorCode } {
    const ERROR_MAP: Record<string, CustomErrorCode> = {
      "errors/resource_not_found": CustomErrorCode.unipileResourceNotFound,
      "errors/provider_error": CustomErrorCode.unipileProviderError,
      "errors/disconnected_account": CustomErrorCode.unipileDisconnectedAccount,
      "errors/disconnected_feature": CustomErrorCode.unipileDisconnectedAccount,
      "errors/authentication_intent_error": CustomErrorCode.unipileProviderError,
      "errors/no_client_session": CustomErrorCode.unipileServiceUnavailable,
      "errors/no_channel": CustomErrorCode.unipileServiceUnavailable,
      "errors/no_handler": CustomErrorCode.unipileServiceUnavailable,
      "errors/network_down": CustomErrorCode.unipileServiceUnavailable,
      "errors/service_unavailable": CustomErrorCode.unipileServiceUnavailable,
      "errors/request_timeout": CustomErrorCode.unipileRequestTimeout,
      "errors/unexpected_error": CustomErrorCode.unipileUnknown,
    };

    if (!(source instanceof UnsuccessfulRequestError)) throw source;

    const type = (source.body as { type?: string } | undefined)?.type ?? "";
    return {
      ok: false,
      error: ERROR_MAP[type] ?? CustomErrorCode.unipileUnknown,
    };
  }
}
