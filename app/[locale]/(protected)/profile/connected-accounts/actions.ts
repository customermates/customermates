"use server";

import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";

import { z } from "zod";

import {
  getCreateAuthLinkInteractor,
  getDeleteConnectedAccountInteractor,
  getGetMyConnectedAccountsInteractor,
  getReconnectConnectedAccountInteractor,
  getResyncConnectedAccountInteractor,
  getSetConnectedAccountVisibilityInteractor,
  getSetSelectedFoldersInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";

export async function startConnectAccountAction(channel: ConnectChannel) {
  const result = await getCreateAuthLinkInteractor().invoke({ channel });
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };
  return { ok: false as const, error: z.treeifyError(result.error) };
}

export async function disconnectConnectedAccountAction(id: string) {
  return serializeResult(getDeleteConnectedAccountInteractor().invoke({ id }));
}

export async function setConnectedAccountVisibilityAction(id: string, shared: boolean) {
  return serializeResult(getSetConnectedAccountVisibilityInteractor().invoke({ id, shared }));
}

export async function resyncConnectedAccountAction(id: string) {
  return serializeResult(getResyncConnectedAccountInteractor().invoke({ id }));
}

export async function setSelectedFoldersAction(id: string, selectedFolderIds: string[]) {
  return serializeResult(getSetSelectedFoldersInteractor().invoke({ id, selectedFolderIds }));
}

export async function startReconnectAccountAction(id: string) {
  const result = await getReconnectConnectedAccountInteractor().invoke({ id });
  return { ok: true as const, data: { url: result.redirect } };
}

export async function refreshConnectedAccountsAction() {
  const result = await getGetMyConnectedAccountsInteractor().invoke();
  return result.ok ? result.data : [];
}
