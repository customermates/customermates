"use client";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useRouter } from "@/i18n/navigation";

export const CREATE_LIST_HREF = "/configure?create=true";

export function useOpenCreateList(): (invoker: HTMLElement) => void {
  const router = useRouter();
  const { addPickerStore, agentChatEnabled, agentChatStore } = useRootStore();
  return (invoker) => {
    if (agentChatEnabled && agentChatStore.enabled === true) addPickerStore.openListFrom(invoker);
    else router.push(CREATE_LIST_HREF);
  };
}
