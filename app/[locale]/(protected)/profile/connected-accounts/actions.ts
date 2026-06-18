"use server";

import { redirect } from "next/navigation";

import {
  getCreateHostedAuthLinkInteractor,
  getDeleteConnectedAccountInteractor,
  getGetMyConnectedAccountsInteractor,
  getReconnectConnectedAccountInteractor,
  getResyncConnectedAccountInteractor,
  getSetConnectedAccountVisibilityInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";

export async function startConnectAccountAction() {
  return serializeResult(getCreateHostedAuthLinkInteractor().invoke());
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

export async function startReconnectAccountAction(id: string) {
  const result = await getReconnectConnectedAccountInteractor().invoke({ id });
  if (isRedirect(result)) redirect(result.redirect);
}

export async function refreshConnectedAccountsAction() {
  const result = await getGetMyConnectedAccountsInteractor().invoke();
  return result.ok ? result.data : [];
}
