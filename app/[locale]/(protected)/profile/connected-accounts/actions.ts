"use server";

import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";

import { z } from "zod";

import {
  getCreateAuthLinkInteractor,
  getDeleteConnectedAccountInteractor,
  getGetMyConnectedAccountsInteractor,
  getReconnectConnectedAccountInteractor,
  getResyncConnectedAccountInteractor,
  getSetConnectedAccountSignatureInteractor,
  getSetConnectedAccountVisibilityInteractor,
  getSetSelectedFoldersInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function startConnectAccountAction(channel: ConnectChannel) {
  const result = await getCreateAuthLinkInteractor().invoke({ channel });
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };
  return { ok: false as const, error: z.treeifyError(result.error), code: result.code };
}

export async function disconnectConnectedAccountAction(id: string) {
  return serializeResult(getDeleteConnectedAccountInteractor().invoke({ id }));
}

export async function setConnectedAccountVisibilityAction(id: string, shared: boolean) {
  return serializeResult(getSetConnectedAccountVisibilityInteractor().invoke({ id, shared }));
}

export async function setConnectedAccountSignatureAction(id: string, signature: string) {
  return serializeResult(getSetConnectedAccountSignatureInteractor().invoke({ id, signature }));
}

export async function resyncConnectedAccountAction(id: string) {
  return serializeResult(getResyncConnectedAccountInteractor().invoke({ id }));
}

export async function setSelectedFoldersAction(id: string, selectedFolderIds: string[]) {
  return serializeResult(getSetSelectedFoldersInteractor().invoke({ id, selectedFolderIds }));
}

export async function startReconnectAccountAction(id: string) {
  const result = await getReconnectConnectedAccountInteractor().invoke({ id });
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };
  return { ok: false as const, error: z.treeifyError(result.error) };
}

export async function refreshConnectedAccountsAction() {
  return unwrapValidated(getGetMyConnectedAccountsInteractor().invoke());
}
