"use server";

import type { RecordRef } from "@/features/records/record-model.schema";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { UpdateThreadData } from "@/ee/messaging/thread-state/update-thread.interactor";
import type { SendChatMessageData } from "@/ee/messaging/outbound/send-chat-message.interactor";
import type { SendEmailData } from "@/ee/messaging/outbound/send-email.interactor";
import type { SaveDraftData } from "@/ee/messaging/outbound/save-draft.interactor";
import type { DiscardDraftData } from "@/ee/messaging/outbound/discard-draft.interactor";
import type { StartChatData } from "@/ee/messaging/outbound/start-chat.interactor";
import type { ResolveProviderProfileData } from "@/ee/messaging/outbound/resolve-provider-profile.interactor";
import type { MoveEmailThreadData } from "@/ee/messaging/inbox/move-email-thread.interactor";

import {
  getGetMessagingThreadsInteractor,
  getGetMessagingThreadInteractor,
  getGetIdentityRecordChoicesInteractor,
  getUpdateThreadInteractor,
  getResyncThreadInteractor,
  getMoveEmailThreadInteractor,
  getSendChatMessageInteractor,
  getSendEmailInteractor,
  getSaveDraftInteractor,
  getDiscardDraftInteractor,
  getStartChatInteractor,
  getResolveProviderProfileInteractor,
  getRefreshInboxInteractor,
  getGetUnreadThreadCountInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getMessagingThreadsAction(params?: GetQueryParams) {
  return unwrapValidated(getGetMessagingThreadsInteractor().invoke(params));
}

export async function getUnreadThreadCountAction() {
  return unwrapValidated(getGetUnreadThreadCountInteractor().invoke());
}

export async function getMessagingThreadAction(threadId: string) {
  const result = await getGetMessagingThreadInteractor().invoke({ threadId });
  return result.ok ? result.data : null;
}

export async function refreshInboxAction() {
  return serializeResult(getRefreshInboxInteractor().invoke());
}

export async function getIdentityRecordChoicesAction(search: string, refs?: Array<RecordRef | string>) {
  return unwrapValidated(getGetIdentityRecordChoicesInteractor().invoke({ search, ...(refs ? { refs } : {}) }));
}

export async function updateThreadAction(data: UpdateThreadData) {
  return serializeResult(getUpdateThreadInteractor().invoke(data));
}

export async function resyncThreadAction(threadId: string) {
  return serializeResult(getResyncThreadInteractor().invoke({ threadId }));
}

export async function moveEmailThreadAction(data: MoveEmailThreadData) {
  return serializeResult(getMoveEmailThreadInteractor().invoke(data));
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
