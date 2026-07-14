import type { MessagingProvider } from "@/generated/prisma";
import type { CreateAuthLinkData } from "@unipile/sdk";
import type { UnipileAccount, UnipileAttachment } from "./unipile.schema";
import type {
  SocialPost,
  SocialPostList,
  SocialCommentList,
  SocialReactionList,
  SocialProfile,
  RelationRequestList,
  RelationRequestResult,
} from "./posts/social-posts.schema";
import type {
  SalesCompanyFilters,
  SalesCompanyPage,
  SalesListItemPage,
  SalesListKind,
  SalesListPage,
  SalesPeopleFilters,
  SalesSearchParameterPage,
  SalesSearchParameterType,
  LinkedinSaveToSalesListResult,
} from "./sales-navigator/sales-navigator.schema";

import {
  UnipileAccounts,
  UnipileCalendar,
  UnipileEmails,
  UnipileHostedAuth,
  UnipileLinkedIn,
  UnipileMessaging,
  UnipilePosts,
  UnipileUsers,
} from "@unipile/sdk";
import { createClient, createConfig } from "@unipile/sdk/dist/client";

import { z } from "zod";
import * as Sentry from "@sentry/node";

import { CustomErrorCode } from "@/core/validation/validation.types";

import { env } from "@/env";
import { isEmailProvider } from "./provider";
import { UnipileAccountSchema, UnipileAttachmentSchema, UnipileUserSchema } from "./unipile.schema";
import {
  SocialPostSchema,
  SocialPostListSchema,
  SocialCommentListSchema,
  SocialReactionListSchema,
  SocialProfileSchema,
  RelationRequestListSchema,
  RelationRequestResultSchema,
} from "./posts/social-posts.schema";
import {
  SalesCompanyPageSchema,
  SalesListItemPageSchema,
  SalesListPageSchema,
  SalesSearchParameterPageSchema,
  LinkedinSaveToSalesListResultSchema,
} from "./sales-navigator/sales-navigator.schema";

const UNIPILE_BASE_URL = "https://api.unipile.com";
const UNIPILE_REQUEST_TIMEOUT_MS = 30_000;
const OUTBOUND_SEND_TIMEOUT_MS = 90_000;

type MessageFile = { filename: string; content_type: string; content: string };

export type StartChatSpecifics = {
  linkedin: {
    classic?: { inmail?: boolean };
    sales_navigator?: { subject: string };
    recruiter?: { subject: string; signature: string };
  };
};

type EmailAttendee = { email: string; display_name?: string };

type MessagingSendResult<T> = { ok: true; data: T } | { ok: false; error: CustomErrorCode; retryAfterSeconds?: number };

type ProviderProfile = {
  providerId: string;
  publicIdentifier: string | null;
  displayName: string | null;
  profileUrl: string | null;
  pictureUrl: string | null;
  headline: string | null;
};

export class UnipileRequestError extends Error {
  constructor(
    readonly status: number,
    readonly errorType: string | null,
    readonly bodyText: string,
    readonly retryAfterSeconds: number | null = null,
    readonly url: string | null = null,
  ) {
    super(`Unipile v2 request failed: ${status} ${bodyText}`);
    this.name = "UnipileRequestError";
  }
}

export function isUnipileRateLimit(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ((err as { status?: number }).status === 429) return true;

  const message = (err as { message?: string }).message;
  return typeof message === "string" && message.includes("request failed: 429");
}

function parseRetryAfter(headers: Headers): number | null {
  const value = Number(headers.get("retry-after"));

  return Number.isFinite(value) && value > 0 ? value : null;
}

const UNIPILE_ERROR_CODES: Record<string, CustomErrorCode> = {
  "provider/invalid_authorization": CustomErrorCode.unipileDisconnectedAccount,
  "provider/invalid_credentials": CustomErrorCode.unipileDisconnectedAccount,
  "provider/unknown_authentication_context": CustomErrorCode.unipileDisconnectedAccount,
  "api/account_restricted": CustomErrorCode.unipileDisconnectedAccount,
  "api/internal_error": CustomErrorCode.unipileServiceUnavailable,
  "api/proxy_error": CustomErrorCode.unipileServiceUnavailable,
  "api/proxy_timeout": CustomErrorCode.unipileServiceUnavailable,
  "api/proxy_auth_error": CustomErrorCode.unipileServiceUnavailable,
  "api/inactive_subscription": CustomErrorCode.unipileServiceUnavailable,
  "api/not_implemented": CustomErrorCode.unipileServiceUnavailable,
  "provider/invalid_parameters": CustomErrorCode.unipileInvalidRequest,
};

const UNIPILE_BAD_IMPL_TYPES = new Set([
  "api/invalid_parameters",
  "api/invalid_auth_format",
  "api/missing_authorization",
  "api/expired_authorization",
  "api/insufficient_permissions",
  "api/conflict",
  "api/already_exists",
]);

const UNIPILE_TRANSIENT_5XX_TYPES = new Set(["api/proxy_error", "api/proxy_timeout", "api/proxy_auth_error"]);

function endpointHint(url: string | null): string {
  if (!url) return "unknown";
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean).slice(2);

    return segments.map((segment) => (segment.length > 20 || segment.includes("@") ? "{id}" : segment)).join("/");
  } catch {
    return "unknown";
  }
}

function unipileErrorCode(err: UnipileRequestError): CustomErrorCode {
  const type = err.errorType ?? "";

  if (err.status === 429) return CustomErrorCode.unipileRateLimit;
  if (type.endsWith("/resource_not_found")) return CustomErrorCode.unipileResourceNotFound;
  if (UNIPILE_ERROR_CODES[type]) return UNIPILE_ERROR_CODES[type];
  if (type.startsWith("provider/")) return CustomErrorCode.unipileProviderError;

  return err.status >= 500 ? CustomErrorCode.unipileServiceUnavailable : CustomErrorCode.unipileUnknown;
}

export function getRetryAfterSeconds(err: unknown): number | null {
  return err instanceof UnipileRequestError ? err.retryAfterSeconds : null;
}

export function isUnipileTimeout(err: unknown): boolean {
  return err instanceof UnipileRequestError && err.status === 0;
}

export function isUnipileResourceNotFound(err: unknown): boolean {
  if (!(err instanceof UnipileRequestError)) return false;

  return err.status === 404 || (err.errorType ?? "").endsWith("/resource_not_found");
}

export function getUnipileStatus(err: unknown): number | null {
  return err instanceof UnipileRequestError ? err.status : null;
}

const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(UNIPILE_REQUEST_TIMEOUT_MS) });

function isMessageFile(value: unknown): value is MessageFile {
  return (
    typeof value === "object" && value !== null && "content" in value && "content_type" in value && "filename" in value
  );
}

function appendMultipartField(form: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) return;

  if (isMessageFile(value)) {
    const bytes = new Uint8Array(Buffer.from(value.content, "base64"));
    form.append(key, new Blob([bytes], { type: value.content_type }), value.filename);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => appendMultipartField(form, `${key}[${index}]`, item));
    return;
  }

  if (typeof value === "object") {
    for (const [nestedKey, nestedValue] of Object.entries(value))
      appendMultipartField(form, `${key}[${nestedKey}]`, nestedValue);
    return;
  }

  form.append(key, String(value));
}

const multipartBodySerializer = (body: unknown): FormData => {
  const form = new FormData();
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) appendMultipartField(form, key, value);

  return form;
};

function multipartOptions(attachments: MessageFile[] | undefined) {
  return attachments?.length ? { bodySerializer: multipartBodySerializer, headers: { "Content-Type": null } } : {};
}

async function requestData<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<NonNullable<T>> {
  const result = await call;

  if (result.error !== undefined || !result.response?.ok) {
    const errorType = (result.error as { type?: string } | null | undefined)?.type ?? null;
    const bodyText = result.error === undefined ? "" : JSON.stringify(result.error);

    throw new UnipileRequestError(
      result.response?.status ?? 0,
      errorType,
      bodyText,
      result.response ? parseRetryAfter(result.response.headers) : null,
      result.response?.url ?? null,
    );
  }

  return result.data as NonNullable<T>;
}

export class MessagingService {
  private sdkInstance?: {
    accounts: UnipileAccounts;
    messaging: UnipileMessaging;
    emails: UnipileEmails;
    calendar: UnipileCalendar;
    users: UnipileUsers;
    hostedAuth: UnipileHostedAuth;
    posts: UnipilePosts;
    linkedin: UnipileLinkedIn;
  };

  private get sdk() {
    if (!this.sdkInstance) {
      if (!env.UNIPILE_API_KEY) throw new Error("UNIPILE_API_KEY env var is not set");

      const client = createClient(
        createConfig({
          baseUrl: UNIPILE_BASE_URL,
          headers: { "X-API-KEY": env.UNIPILE_API_KEY },
          fetch: fetchWithTimeout,
        }),
      );

      this.sdkInstance = {
        accounts: new UnipileAccounts({ client }),
        messaging: new UnipileMessaging({ client }),
        emails: new UnipileEmails({ client }),
        calendar: new UnipileCalendar({ client }),
        users: new UnipileUsers({ client }),
        hostedAuth: new UnipileHostedAuth({ client }),
        posts: new UnipilePosts({ client }),
        linkedin: new UnipileLinkedIn({ client }),
      };
    }

    return this.sdkInstance;
  }

  private mapError(source: unknown): { ok: false; error: CustomErrorCode; retryAfterSeconds?: number } {
    if (!(source instanceof UnipileRequestError)) throw source;

    const type = source.errorType ?? "";
    if (source.status === 429 && type.startsWith("provider/")) {
      Sentry.captureMessage("Unipile provider rate limit reached; the dashboard limit may be too high", {
        level: "warning",
        tags: { unipileErrorType: type },
      });
    } else if (UNIPILE_BAD_IMPL_TYPES.has(type)) Sentry.captureException(source);
    else if (source.status >= 500 && !UNIPILE_TRANSIENT_5XX_TYPES.has(type)) {
      Sentry.captureException(source, {
        tags: {
          unipileStatus: String(source.status),
          unipileErrorType: type || "none",
          unipileEndpoint: endpointHint(source.url),
        },
      });
    }

    const error = unipileErrorCode(source);

    return source.retryAfterSeconds !== null
      ? { ok: false, error, retryAfterSeconds: source.retryAfterSeconds }
      : { ok: false, error };
  }

  async getAccount(accountId: string): Promise<UnipileAccount> {
    const raw = await requestData(this.sdk.accounts.getAccount({ path: { account_id: accountId } }));

    return UnipileAccountSchema.parse(raw);
  }

  async listChats(input: { accountId: string; cursor?: string; offset?: number; limit?: number }) {
    return requestData(
      this.sdk.messaging.getChatsList({
        path: { account_id: input.accountId },
        query:
          input.cursor != null
            ? { cursor: input.cursor, limit: input.limit }
            : { offset: input.offset, limit: input.limit },
      }),
    );
  }

  async listInboxes(input: { accountId: string }) {
    return requestData(this.sdk.messaging.getInboxesList({ path: { account_id: input.accountId } }));
  }

  async listInboxChats(input: {
    accountId: string;
    inboxId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
  }) {
    return requestData(
      this.sdk.messaging.getInboxChatsList({
        path: { account_id: input.accountId, inbox_id: input.inboxId },
        query:
          input.cursor != null
            ? { cursor: input.cursor, limit: input.limit }
            : { offset: input.offset, limit: input.limit },
      }),
    );
  }

  async listChatMessages(input: {
    accountId: string;
    chatId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
    timeoutMs?: number;
  }) {
    return requestData(
      this.sdk.messaging.getMessagesList({
        path: { account_id: input.accountId, chat_id: input.chatId },
        query:
          input.cursor != null
            ? { cursor: input.cursor, limit: input.limit }
            : { offset: input.offset, limit: input.limit },
        ...(input.timeoutMs != null ? { signal: AbortSignal.timeout(input.timeoutMs) } : {}),
      }),
    );
  }

  async listChatParticipants(input: {
    accountId: string;
    chatId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
  }) {
    return requestData(
      this.sdk.messaging.getParticipantsList({
        path: { account_id: input.accountId, chat_id: input.chatId },
        query:
          input.cursor != null
            ? { cursor: input.cursor, limit: input.limit }
            : { offset: input.offset, limit: input.limit },
      }),
    );
  }

  async listEmails(input: {
    accountId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
    after?: string;
    before?: string;
    metaOnly?: boolean;
    timeoutMs?: number;
  }) {
    return requestData(
      this.sdk.emails.getEmailsList({
        path: { account_id: input.accountId },
        query:
          input.cursor != null
            ? { cursor: input.cursor, limit: input.limit }
            : {
                offset: input.offset,
                limit: input.limit,
                after: input.after,
                before: input.before,
                meta_only: input.metaOnly,
              },
        ...(input.timeoutMs != null ? { signal: AbortSignal.timeout(input.timeoutMs) } : {}),
      }),
    );
  }

  async listFolders(input: { accountId: string; timeoutMs?: number }) {
    return requestData(
      this.sdk.emails.getFoldersList({
        path: { account_id: input.accountId },
        ...(input.timeoutMs != null ? { signal: AbortSignal.timeout(input.timeoutMs) } : {}),
      }),
    );
  }

  async listFolderEmails(input: {
    accountId: string;
    folderId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
    after?: string;
    before?: string;
    metaOnly?: boolean;
    timeoutMs?: number;
  }) {
    return requestData(
      this.sdk.emails.getFolderEmailsList({
        path: { account_id: input.accountId, folder_id: input.folderId },
        query:
          input.cursor != null
            ? { cursor: input.cursor, limit: input.limit }
            : {
                offset: input.offset,
                limit: input.limit,
                after: input.after,
                before: input.before,
                meta_only: input.metaOnly,
              },
        ...(input.timeoutMs != null ? { signal: AbortSignal.timeout(input.timeoutMs) } : {}),
      }),
    );
  }

  async getThread(input: { accountId: string; threadId: string }): Promise<{ emails: unknown[] }> {
    const raw = await requestData(
      this.sdk.emails.getThread({ path: { account_id: input.accountId, thread_id: input.threadId } }),
    );
    const parsed = z.looseObject({ emails: z.array(z.unknown()).nullish() }).parse(raw);

    return { emails: parsed.emails ?? [] };
  }

  async getEmail(input: { accountId: string; emailId: string; timeoutMs?: number }): Promise<unknown> {
    return requestData(
      this.sdk.emails.getEmail({
        path: { account_id: input.accountId, email_id: input.emailId },
        ...(input.timeoutMs != null ? { signal: AbortSignal.timeout(input.timeoutMs) } : {}),
      }),
    );
  }

  async getEmailAttachments(input: {
    accountId: string;
    emailId: string;
  }): Promise<MessagingSendResult<UnipileAttachment[]>> {
    try {
      const raw = await requestData(
        this.sdk.emails.getEmail({ path: { account_id: input.accountId, email_id: input.emailId } }),
      );
      const parsed = z.looseObject({ attachments: z.array(UnipileAttachmentSchema).nullish() }).parse(raw);

      return { ok: true, data: parsed.attachments ?? [] };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async listCalendars(input: { accountId: string; cursor?: string; offset?: number; limit?: number }) {
    return requestData(
      this.sdk.calendar.getCalendarsList({
        path: { account_id: input.accountId },
        query:
          input.cursor != null
            ? { cursor: input.cursor, limit: input.limit }
            : { offset: input.offset, limit: input.limit },
      }),
    );
  }

  async listCalendarEvents(input: {
    accountId: string;
    calendarId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
    start?: string;
    expandRecurring?: boolean;
  }) {
    return requestData(
      this.sdk.calendar.getCalendarEventList({
        path: { account_id: input.accountId, calendar_id: input.calendarId },
        query:
          input.cursor != null
            ? { cursor: input.cursor, limit: input.limit }
            : { offset: input.offset, limit: input.limit, start: input.start, expand_recurring: input.expandRecurring },
      }),
    );
  }

  async getProviderProfile(input: {
    accountId: string;
    identifier: string;
  }): Promise<MessagingSendResult<ProviderProfile>> {
    try {
      const profile = UnipileUserSchema.parse(
        await requestData(
          this.sdk.users.getUserProfile({ path: { account_id: input.accountId, user_id: input.identifier } }),
        ),
      );

      if (!profile.id) return { ok: false, error: CustomErrorCode.unipileResourceNotFound };

      const displayName =
        profile.display_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();

      return {
        ok: true,
        data: {
          providerId: profile.id,
          publicIdentifier: profile.public_identifier ?? null,
          displayName: displayName || null,
          profileUrl: profile.profile_url ?? null,
          pictureUrl: profile.public_picture_url ?? null,
          headline: profile.specifics?.headline ?? null,
        },
      };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async downloadAttachment(input: {
    accountId: string;
    provider: MessagingProvider;
    chatId: string | null;
    messageId: string;
    attachmentId: string;
    fileName?: string | null;
    size?: number | null;
  }): Promise<{ body: ReadableStream<Uint8Array>; contentType: string | null }> {
    if (isEmailProvider(input.provider)) return this.downloadEmailAttachment(input);

    return this.streamAttachment(
      this.sdk.messaging.getAttachment({
        path: {
          account_id: input.accountId,
          chat_id: input.chatId ?? "",
          message_id: input.messageId,
          attachment_id: input.attachmentId,
        },
        parseAs: "stream",
      }),
    );
  }

  private async downloadEmailAttachment(input: {
    accountId: string;
    messageId: string;
    attachmentId: string;
    fileName?: string | null;
    size?: number | null;
  }): Promise<{ body: ReadableStream<Uint8Array>; contentType: string | null }> {
    try {
      return await this.streamAttachment(
        this.sdk.emails.getAttachment1({
          path: { account_id: input.accountId, email_id: input.messageId, attachment_id: input.attachmentId },
          parseAs: "stream",
        }),
      );
    } catch (err) {
      if (!isUnipileResourceNotFound(err)) throw err;

      const resolvedId = await this.resolveEmailAttachmentId(input);
      if (resolvedId === null || resolvedId === input.attachmentId) throw err;

      return this.streamAttachment(
        this.sdk.emails.getAttachment1({
          path: { account_id: input.accountId, email_id: input.messageId, attachment_id: resolvedId },
          parseAs: "stream",
        }),
      );
    }
  }

  private async resolveEmailAttachmentId(input: {
    accountId: string;
    messageId: string;
    attachmentId: string;
    fileName?: string | null;
    size?: number | null;
  }): Promise<string | null> {
    const raw = await requestData(
      this.sdk.emails.getEmail({ path: { account_id: input.accountId, email_id: input.messageId } }),
    );
    const parsed = z.looseObject({ attachments: z.array(UnipileAttachmentSchema).nullish() }).safeParse(raw);
    const attachments = parsed.success ? (parsed.data.attachments ?? []) : [];

    const byId = attachments.find((a) => a.id === input.attachmentId);
    if (byId?.id) return byId.id;

    const byNameAndSize = attachments.find(
      (a) => a.filename === input.fileName && (input.size == null || a.file_size === input.size),
    );
    if (byNameAndSize?.id) return byNameAndSize.id;

    return null;
  }

  private async streamAttachment(
    call: Promise<{ error?: unknown; response: Response }>,
  ): Promise<{ body: ReadableStream<Uint8Array>; contentType: string | null }> {
    const result = await call;

    if (result.error !== undefined || !result.response?.ok) {
      const errorType = (result.error as { type?: string } | null | undefined)?.type ?? null;
      const bodyText = result.error === undefined ? "" : JSON.stringify(result.error);

      throw new UnipileRequestError(
        result.response?.status ?? 0,
        errorType,
        bodyText,
        result.response ? parseRetryAfter(result.response.headers) : null,
      );
    }

    const blob = await result.response.blob();

    return { body: blob.stream(), contentType: blob.type || null };
  }

  async listAccounts(): Promise<{ id: string; createdAt: Date }[]> {
    const raw = await requestData(this.sdk.accounts.listAccounts({ query: { limit: "250" } }));

    return raw.data.map((account) => ({ id: account.id, createdAt: new Date(account.created_at) }));
  }

  async deleteAccount(input: { accountId: string }): Promise<void> {
    try {
      await requestData(this.sdk.accounts.removeAccount({ path: { account_id: input.accountId } }));
    } catch (err) {
      if (err instanceof UnipileRequestError && (err.status === 404 || err.status === 410)) return;

      throw err;
    }
  }

  async createAuthLink(input: {
    providers: string | string[];
    redirectUri: string;
    expiresOn: string;
    state: string;
    config?: Record<string, unknown>;
  }): Promise<string> {
    return this.requestAuthLink({
      providers: input.providers,
      redirect_uri: input.redirectUri,
      expires_on: input.expiresOn,
      state: input.state,
      ...(input.config ? { config: input.config } : {}),
    } as CreateAuthLinkData["body"]);
  }

  async createReconnectAuthLink(input: {
    accountId: string;
    redirectUri: string;
    expiresOn: string;
    state: string;
    config?: Record<string, unknown>;
  }): Promise<string> {
    return this.requestAuthLink({
      account_id: input.accountId,
      redirect_uri: input.redirectUri,
      expires_on: input.expiresOn,
      state: input.state,
      ...(input.config ? { config: input.config } : {}),
    } as CreateAuthLinkData["body"]);
  }

  private async requestAuthLink(body: CreateAuthLinkData["body"]): Promise<string> {
    const domain = env.UNIPILE_HOSTED_AUTH_DOMAIN;
    const result = await requestData(
      this.sdk.hostedAuth.createAuthLink({ body: (domain ? { ...body, domain } : body) as CreateAuthLinkData["body"] }),
    );

    return z.looseObject({ link: z.string().min(1) }).parse(result).link;
  }

  async sendChatMessage(input: {
    accountId: string;
    chatId: string;
    text: string;
    attachments?: MessageFile[];
  }): Promise<MessagingSendResult<{ messageId: string | null }>> {
    try {
      const raw = await requestData(
        this.sdk.messaging.sendMessage({
          path: { account_id: input.accountId, chat_id: input.chatId },
          body: { text: input.text, ...(input.attachments ? { attachments: input.attachments } : {}) },
          signal: AbortSignal.timeout(OUTBOUND_SEND_TIMEOUT_MS),
          ...multipartOptions(input.attachments),
        }),
      );
      const data = z.looseObject({ message_id: z.union([z.string(), z.array(z.string())]).nullish() }).parse(raw);

      const messageId = Array.isArray(data.message_id) ? (data.message_id[0] ?? null) : (data.message_id ?? null);

      return { ok: true, data: { messageId } };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async startChat(input: {
    accountId: string;
    usersIds: string | string[];
    text: string;
    name?: string;
    attachments?: MessageFile[];
    inboxId?: string;
    specifics?: StartChatSpecifics;
  }): Promise<MessagingSendResult<{ chatId: string | null; messageId: string | null }>> {
    try {
      const body = {
        text: input.text,
        users_ids: input.usersIds,
        ...(input.name ? { name: input.name } : {}),
        ...(input.attachments ? { attachments: input.attachments } : {}),
        ...(input.specifics ? { specifics: input.specifics } : {}),
      };
      const raw = await requestData(
        input.inboxId
          ? this.sdk.messaging.startChatFromInbox({
              path: { account_id: input.accountId, inbox_id: input.inboxId },
              body,
              signal: AbortSignal.timeout(OUTBOUND_SEND_TIMEOUT_MS),
              ...multipartOptions(input.attachments),
            })
          : this.sdk.messaging.startChat({
              path: { account_id: input.accountId },
              body,
              signal: AbortSignal.timeout(OUTBOUND_SEND_TIMEOUT_MS),
              ...multipartOptions(input.attachments),
            }),
      );
      const data = z
        .looseObject({
          chat_id: z.string().nullish(),
          message_id: z.union([z.string(), z.array(z.string())]).nullish(),
        })
        .parse(raw);

      const messageId = Array.isArray(data.message_id) ? (data.message_id[0] ?? null) : (data.message_id ?? null);

      return { ok: true, data: { chatId: data.chat_id ?? null, messageId } };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async sendEmail(input: {
    accountId: string;
    from?: EmailAttendee;
    to: EmailAttendee[];
    cc?: EmailAttendee[];
    bcc?: EmailAttendee[];
    subject: string;
    body: string;
    inReplyTo?: string;
    attachments?: MessageFile[];
  }): Promise<MessagingSendResult<{ id: string; messageId: string }>> {
    try {
      const raw = await requestData(
        this.sdk.emails.sendEmail({
          path: { account_id: input.accountId },
          body: {
            ...(input.from ? { from: input.from } : {}),
            to: input.to,
            ...(input.cc ? { cc: input.cc } : {}),
            ...(input.bcc ? { bcc: input.bcc } : {}),
            subject: input.subject,
            html: input.body,
            ...(input.inReplyTo
              ? {
                  custom_headers: [
                    { name: "In-Reply-To", value: input.inReplyTo },
                    { name: "References", value: input.inReplyTo },
                  ],
                }
              : {}),
            ...(input.attachments ? { attachments: input.attachments } : {}),
          },
          signal: AbortSignal.timeout(OUTBOUND_SEND_TIMEOUT_MS),
          ...multipartOptions(input.attachments),
        }),
      );
      const data = z.looseObject({ id: z.string().min(1), message_id: z.string().min(1) }).parse(raw);

      return { ok: true, data: { id: data.id, messageId: data.message_id } };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async listUserPosts(input: {
    accountId: string;
    userId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SocialPostList>> {
    try {
      const raw = await requestData(
        this.sdk.posts.getPostsList({
          path: { account_id: input.accountId, user_id: input.userId },
          query:
            input.cursor != null
              ? { cursor: input.cursor, limit: input.limit }
              : { offset: input.offset, limit: input.limit },
        }),
      );

      return { ok: true, data: SocialPostListSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async getPost(input: { accountId: string; postId: string }): Promise<MessagingSendResult<SocialPost>> {
    try {
      const raw = await requestData(
        this.sdk.posts.getPost({ path: { account_id: input.accountId, post_id: input.postId } }),
      );

      return { ok: true, data: SocialPostSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async listPostComments(input: {
    accountId: string;
    postId: string;
    sortBy?: "MOST_RECENT" | "MOST_RELEVANT";
    cursor?: string;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SocialCommentList>> {
    try {
      const raw = await requestData(
        this.sdk.posts.getPostCommentsList({
          path: { account_id: input.accountId, post_id: input.postId },
          query:
            input.cursor != null
              ? { cursor: input.cursor, limit: input.limit }
              : { offset: input.offset, limit: input.limit, sort_by: input.sortBy },
        }),
      );

      return { ok: true, data: SocialCommentListSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async listCommentReactions(input: {
    accountId: string;
    postId: string;
    commentId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SocialReactionList>> {
    try {
      const raw = await requestData(
        this.sdk.posts.getPostCommentReactionsList({
          path: { account_id: input.accountId, post_id: input.postId, comment_id: input.commentId },
          query:
            input.cursor != null
              ? { cursor: input.cursor, limit: input.limit }
              : { offset: input.offset, limit: input.limit },
        }),
      );

      return { ok: true, data: SocialReactionListSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async listPostReactions(input: {
    accountId: string;
    postId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SocialReactionList>> {
    try {
      const raw = await requestData(
        this.sdk.posts.getPostReactionsList({
          path: { account_id: input.accountId, post_id: input.postId },
          query:
            input.cursor != null
              ? { cursor: input.cursor, limit: input.limit }
              : { offset: input.offset, limit: input.limit },
        }),
      );

      return { ok: true, data: SocialReactionListSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async getSocialProfile(input: {
    accountId: string;
    identifier: string;
  }): Promise<MessagingSendResult<SocialProfile>> {
    try {
      const raw = await requestData(
        this.sdk.users.getUserProfile({ path: { account_id: input.accountId, user_id: input.identifier } }),
      );

      return { ok: true, data: SocialProfileSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async listRelationRequests(input: {
    accountId: string;
    direction: "received" | "sent";
    cursor?: string;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<RelationRequestList>> {
    try {
      const raw = await requestData(
        this.sdk.users.getRelationRequestsList({
          path: { account_id: input.accountId },
          query:
            input.cursor != null
              ? { type: input.direction, cursor: input.cursor, limit: input.limit }
              : { type: input.direction, offset: input.offset, limit: input.limit },
        }),
      );

      return { ok: true, data: RelationRequestListSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async createRelationRequest(input: {
    accountId: string;
    userId: string;
    message?: string;
  }): Promise<MessagingSendResult<RelationRequestResult>> {
    try {
      const raw = await requestData(
        this.sdk.users.createRelationRequest({
          path: { account_id: input.accountId },
          body: { user_id: input.userId, message: input.message },
        }),
      );

      return { ok: true, data: RelationRequestResultSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async acceptRelationRequest(input: {
    accountId: string;
    invitationId: string;
  }): Promise<MessagingSendResult<RelationRequestResult>> {
    try {
      const raw = await requestData(
        this.sdk.users.acceptRelationRequest({
          path: { account_id: input.accountId, request_id: input.invitationId },
        }),
      );

      return { ok: true, data: RelationRequestResultSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async cancelRelationRequest(input: {
    accountId: string;
    invitationId: string;
  }): Promise<MessagingSendResult<RelationRequestResult>> {
    try {
      const raw = await requestData(
        this.sdk.users.cancelRelationRequest({
          path: { account_id: input.accountId, request_id: input.invitationId },
        }),
      );

      return { ok: true, data: RelationRequestResultSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async listSalesLists(input: {
    accountId: string;
    kind: SalesListKind;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SalesListPage>> {
    try {
      const options = { path: { account_id: input.accountId }, query: { offset: input.offset, limit: input.limit } };
      const raw = await (input.kind === "leads"
        ? requestData(this.sdk.linkedin.getSalesLeadLists(options))
        : requestData(this.sdk.linkedin.getSalesAccountLists(options)));

      return { ok: true, data: SalesListPageSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async browseSalesList(input: {
    accountId: string;
    kind: SalesListKind;
    listId: string;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SalesListItemPage>> {
    try {
      const options = {
        path: { account_id: input.accountId, list_id: input.listId },
        query: { offset: input.offset, limit: input.limit },
        body: {},
      };
      const raw = await (input.kind === "leads"
        ? requestData(this.sdk.linkedin.browseSalesLeadList(options))
        : requestData(this.sdk.linkedin.browseSalesAccountList(options)));

      return { ok: true, data: SalesListItemPageSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async saveToSalesList(input: {
    accountId: string;
    kind: SalesListKind;
    listId: string;
    providerId: string;
  }): Promise<MessagingSendResult<LinkedinSaveToSalesListResult>> {
    try {
      const path = { account_id: input.accountId, list_id: input.listId };
      const raw = await (input.kind === "leads"
        ? requestData(this.sdk.linkedin.saveSalesLeadToList({ path, body: { user_id: input.providerId } }))
        : requestData(this.sdk.linkedin.saveSalesAccountToList({ path, body: { company_id: input.providerId } })));

      return { ok: true, data: LinkedinSaveToSalesListResultSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async searchSalesNavigator(input: {
    accountId: string;
    url: string;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SalesListItemPage>> {
    try {
      const raw = await requestData(
        this.sdk.linkedin.performSalesSearchFromUrl({
          path: { account_id: input.accountId },
          query: { offset: input.offset, limit: input.limit },
          body: { url: input.url },
        }),
      );

      return { ok: true, data: SalesListItemPageSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async searchSalesPeople(input: {
    accountId: string;
    filters?: SalesPeopleFilters;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SalesListItemPage>> {
    try {
      const raw = await requestData(
        this.sdk.linkedin.performSalesPeopleSearch({
          path: { account_id: input.accountId },
          query: { offset: input.offset, limit: input.limit },
          body: input.filters ?? {},
        }),
      );

      return { ok: true, data: SalesListItemPageSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async searchSalesCompanies(input: {
    accountId: string;
    filters?: SalesCompanyFilters;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SalesCompanyPage>> {
    try {
      const raw = await requestData(
        this.sdk.linkedin.performSalesCompaniesSearch({
          path: { account_id: input.accountId },
          query: { offset: input.offset, limit: input.limit },
          body: input.filters ?? {},
        }),
      );

      return { ok: true, data: SalesCompanyPageSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }

  async listSalesSearchParameters(input: {
    accountId: string;
    type: SalesSearchParameterType;
    keywords?: string;
    offset?: number;
    limit?: number;
  }): Promise<MessagingSendResult<SalesSearchParameterPage>> {
    try {
      const raw = await requestData(
        this.sdk.linkedin.getSalesSearchParameters({
          path: { account_id: input.accountId },
          query: { type: input.type, keywords: input.keywords, offset: input.offset, limit: input.limit },
        }),
      );

      return { ok: true, data: SalesSearchParameterPageSchema.parse(raw) };
    } catch (err) {
      return this.mapError(err);
    }
  }
}
