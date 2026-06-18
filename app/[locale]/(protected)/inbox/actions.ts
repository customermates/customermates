"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { AssignContactToThreadData } from "@/ee/messaging/contact-assignment/assign-contact-to-thread.interactor";
import type { SetThreadStateData } from "@/ee/messaging/thread-state/set-thread-state.interactor";
import type { ShareThreadToCrmData } from "@/ee/messaging/thread-state/share-thread-to-crm.interactor";
import type { SendChatMessageData } from "@/ee/messaging/outbound/send-chat-message.interactor";
import type { SendEmailData } from "@/ee/messaging/outbound/send-email.interactor";
import type { StartChatData } from "@/ee/messaging/outbound/start-chat.interactor";
import type { ResolveProviderProfileData } from "@/ee/messaging/outbound/resolve-provider-profile.interactor";

import {
  getGetMessagingThreadsInteractor,
  getGetMessagingThreadInteractor,
  getAssignContactToThreadInteractor,
  getSetThreadStateInteractor,
  getShareThreadToCrmInteractor,
  getSendChatMessageInteractor,
  getSendEmailInteractor,
  getStartChatInteractor,
  getResolveProviderProfileInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getMessagingThreadsAction(params?: GetQueryParams) {
  const result = await getGetMessagingThreadsInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function getMessagingThreadAction(threadId: string) {
  const result = await getGetMessagingThreadInteractor().invoke({ threadId });
  return result.ok ? result.data : null;
}

export async function assignContactToThreadAction(data: AssignContactToThreadData) {
  return serializeResult(getAssignContactToThreadInteractor().invoke(data));
}

export async function setThreadStateAction(data: SetThreadStateData) {
  return serializeResult(getSetThreadStateInteractor().invoke(data));
}

export async function shareThreadToCrmAction(data: ShareThreadToCrmData) {
  return serializeResult(getShareThreadToCrmInteractor().invoke(data));
}

export async function sendChatMessageAction(data: SendChatMessageData) {
  return serializeResult(getSendChatMessageInteractor().invoke(data));
}

export async function sendEmailAction(data: SendEmailData) {
  return serializeResult(getSendEmailInteractor().invoke(data));
}

export async function startChatAction(data: StartChatData) {
  return serializeResult(getStartChatInteractor().invoke(data));
}

export async function resolveProviderProfileAction(data: ResolveProviderProfileData) {
  return serializeResult(getResolveProviderProfileInteractor().invoke(data));
}
