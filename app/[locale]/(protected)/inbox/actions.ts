"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { MessagingProvider } from "@/generated/prisma";
import type { ContactDto, ContactIdentifierDto, IdentifierInput } from "@/features/contacts/contact.schema";
import type { UpdateThreadData } from "@/ee/messaging/thread-state/update-thread.interactor";
import type { SendChatMessageData } from "@/ee/messaging/outbound/send-chat-message.interactor";
import type { SendEmailData } from "@/ee/messaging/outbound/send-email.interactor";
import type { SaveDraftData } from "@/ee/messaging/outbound/save-draft.interactor";
import type { DiscardDraftData } from "@/ee/messaging/outbound/discard-draft.interactor";
import type { StartChatData } from "@/ee/messaging/outbound/start-chat.interactor";
import type { ResolveProviderProfileData } from "@/ee/messaging/outbound/resolve-provider-profile.interactor";

import { z } from "zod";

import {
  getGetMessagingThreadsInteractor,
  getGetMessagingThreadInteractor,
  getGetContactByIdInteractor,
  getUpdateContactInteractor,
  getUpdateThreadInteractor,
  getResyncThreadInteractor,
  getSendChatMessageInteractor,
  getSendEmailInteractor,
  getSaveDraftInteractor,
  getDiscardDraftInteractor,
  getStartChatInteractor,
  getResolveProviderProfileInteractor,
  getRefreshInboxInteractor,
} from "@/core/di";
import { channelClass, isHandleProvider } from "@/ee/messaging/provider";
import { serializeResult } from "@/core/utils/action-result";

export async function getMessagingThreadsAction(params?: GetQueryParams) {
  const result = await getGetMessagingThreadsInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function getMessagingThreadAction(threadId: string) {
  const result = await getGetMessagingThreadInteractor().invoke({ threadId });
  return result.ok ? result.data : null;
}

export async function refreshInboxAction() {
  return serializeResult(getRefreshInboxInteractor().invoke());
}

export async function linkContactToThreadAction(data: {
  contactId: string;
  provider: MessagingProvider;
  identifier: string;
  displayName?: string;
  profileUrl?: string;
}) {
  const contactResult = await getGetContactByIdInteractor().invoke({ id: data.contactId });
  if (!contactResult.ok) return serializeResult(contactResult);
  const contact = contactResult.data.contact;
  if (!contact) return { ok: false as const, error: z.treeifyError(new z.ZodError([])) };

  const linked: IdentifierInput = {
    provider: data.provider,
    value: data.identifier,
    messagingId: isHandleProvider(data.provider) ? data.identifier : undefined,
    displayName: data.displayName,
    profileUrl: data.profileUrl,
  };

  return serializeResult(
    getUpdateContactInteractor().invoke({
      id: data.contactId,
      identifiers: [...identifiersExcept(contact, data.provider, data.identifier), linked],
    }),
  );
}

export async function unlinkContactFromThreadAction(data: {
  contactId: string;
  provider: MessagingProvider;
  identifier: string;
}) {
  const contactResult = await getGetContactByIdInteractor().invoke({ id: data.contactId });
  if (!contactResult.ok) return serializeResult(contactResult);
  const contact = contactResult.data.contact;
  if (!contact) return { ok: false as const, error: z.treeifyError(new z.ZodError([])) };

  return serializeResult(
    getUpdateContactInteractor().invoke({
      id: data.contactId,
      identifiers: identifiersExcept(contact, data.provider, data.identifier),
    }),
  );
}

export async function updateThreadAction(data: UpdateThreadData) {
  return serializeResult(getUpdateThreadInteractor().invoke(data));
}

export async function resyncThreadAction(threadId: string) {
  return serializeResult(getResyncThreadInteractor().invoke({ threadId }));
}

export async function sendChatMessageAction(data: SendChatMessageData) {
  return serializeResult(getSendChatMessageInteractor().invoke(data));
}

export async function sendEmailAction(data: SendEmailData) {
  return serializeResult(getSendEmailInteractor().invoke(data));
}

export async function saveDraftAction(data: SaveDraftData) {
  return serializeResult(getSaveDraftInteractor().invoke(data));
}

export async function discardDraftAction(data: DiscardDraftData) {
  return serializeResult(getDiscardDraftInteractor().invoke(data));
}

export async function startChatAction(data: StartChatData) {
  return serializeResult(getStartChatInteractor().invoke(data));
}

export async function resolveProviderProfileAction(data: ResolveProviderProfileData) {
  return serializeResult(getResolveProviderProfileInteractor().invoke(data));
}

function identifiersExcept(contact: ContactDto, provider: MessagingProvider, value: string): IdentifierInput[] {
  const targetClass = channelClass(provider);
  return contact.identifiers
    .filter(
      (dto) => !(channelClass(dto.provider) === targetClass && (dto.value === value || dto.messagingId === value)),
    )
    .map(toIdentifierInput);
}

function toIdentifierInput(dto: ContactIdentifierDto): IdentifierInput {
  return {
    provider: dto.provider,
    value: dto.value,
    messagingId: dto.messagingId ?? undefined,
    displayName: dto.displayName ?? undefined,
    profileUrl: dto.profileUrl ?? undefined,
  };
}
