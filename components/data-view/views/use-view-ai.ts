"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { createElement, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";
import { SURFACE, type DataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import { SurfaceKeySchema } from "@/core/data-view/data-view-identity.schema";
import { isAiManageableDataViewSurface } from "@/core/data-view/ai-manageable-surfaces";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { focusAgentComposer } from "@/app/components/agent-chat/chat-ui";

import { ViewAiRequestDialog } from "./view-ai-request-dialog";
import { viewAiLocation } from "./view-ai-location";

const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

type Options = {
  registerPageContext?: boolean;
  entry?: "view" | "filters" | "appearance";
  getTrigger?: () => HTMLElement | null;
  getCreateTrigger?: () => HTMLElement | null;
};

type RequestTarget = {
  mode: "create" | "edit";
  name: string;
  viewKey: string;
  surfaceKey: DataViewSurfaceKey;
  location: string;
  pathname: string;
  opener: HTMLElement | null;
};

export function useViewAi<E extends HasId>(
  store: BaseDataViewStore<E>,
  { registerPageContext = true, entry = "view", getTrigger, getCreateTrigger }: Options = {},
) {
  const { agentChatStore } = useRootStore();
  const pathname = usePathname();
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const releaseActionContext = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const [target, setTarget] = useState<RequestTarget | null>(null);
  const [requestText, setRequestText] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    if (!registerPageContext || !store.p13nId) return;
    const registeredSurface = SurfaceKeySchema.safeParse(store.p13nId);
    if (!registeredSurface.success || !isAiManageableDataViewSurface(registeredSurface.data)) return;
    return agentChatStore?.viewContext.register(
      pathname,
      () => (store.isReady && store.p13nId ? { surfaceKey: store.p13nId, viewKey: store.activeViewKey } : null),
      () => store.settleViewState(),
    );
  }, [agentChatStore, pathname, registerPageContext, store, store.p13nId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseActionContext.current?.();
      releaseActionContext.current = null;
    };
  }, [agentChatStore, pathname, store]);

  const surface = SurfaceKeySchema.safeParse(store.p13nId);
  const available =
    hydrated &&
    store.isReady &&
    surface.success &&
    isAiManageableDataViewSurface(surface.data) &&
    agentChatStore?.enabled === true;
  function getDisabledReason() {
    if (
      target &&
      (target.pathname !== pathname || target.surfaceKey !== store.p13nId || target.viewKey !== store.activeViewKey)
    )
      return t("DataView.views.aiRequest.contextChanged");
    if (
      !hydrated ||
      !store.isReady ||
      !store.p13nId ||
      agentChatStore?.enabled !== true ||
      agentChatStore.usage?.blockedReason
    )
      return t("DataView.views.aiRequest.unavailable");
    if (
      agentChatStore.isWorking ||
      agentChatStore.queuedPrompt ||
      agentChatStore.conversationLoadPendingId ||
      agentChatStore.historyMutationPending
    )
      return t("DataView.views.aiRequest.busy");
    return undefined;
  }

  function openRequest(mode: RequestTarget["mode"], name: string, opener: HTMLElement | null) {
    if (!available || !surface.success) return;
    setTarget({
      mode,
      name,
      viewKey: store.activeViewKey,
      surfaceKey: surface.data,
      location: viewAiLocation(surface.data, t, plural),
      pathname,
      opener,
    });
    setRequestText("");
    setPromptOpen(true);
  }

  function sendRequest(text: string) {
    if (!mounted.current || getDisabledReason() || !target || !agentChatStore || !text.trim()) return false;
    releaseActionContext.current?.();
    releaseActionContext.current = agentChatStore.viewContext.register(
      target.pathname,
      () => (store.isReady && store.p13nId ? { surfaceKey: store.p13nId, viewKey: store.activeViewKey } : null),
      () => store.settleViewState(),
    );
    const prefix =
      target.mode === "create"
        ? target.name
          ? t("DataView.views.aiCreateNamedPrompt", { name: target.name })
          : t("DataView.views.aiCreatePrompt")
        : target.surfaceKey === SURFACE.entityTimeline
          ? t("DataView.views.aiRequest.timelinePrompt", { name: target.name })
          : entry === "filters"
            ? t("DataView.views.aiRequest.filtersPrompt", { name: target.name })
            : entry === "appearance"
              ? t("DataView.views.aiRequest.appearancePrompt", { name: target.name })
              : t("DataView.views.aiEditPrompt", { name: target.name });
    const context = t("DataView.views.aiRequest.contextPrompt", { location: target.location });
    const query = new URLSearchParams({
      view: target.viewKey,
      viewSurface: target.surfaceKey,
      viewAction: target.mode === "create" ? "create" : "update",
    });
    agentChatStore.openWithDraft(agentChatStore.composerDraft);
    void agentChatStore.sendMessage(`${context}\n${prefix}\n\n${text.trim()}`, {
      pageRoute: `${target.pathname}?${query}`,
    });
    focusAgentComposer();
    return true;
  }

  const inputCopy =
    target?.surfaceKey === SURFACE.entityTimeline
      ? {
          label: t("DataView.views.aiRequest.timelineLabel"),
          placeholder: t("DataView.views.aiRequest.timelinePlaceholder"),
        }
      : target?.mode === "create"
        ? {
            label: t("DataView.views.aiRequest.createLabel"),
            placeholder: t("DataView.views.aiRequest.createPlaceholder"),
          }
        : entry === "filters"
          ? {
              label: t("DataView.views.aiRequest.filtersLabel"),
              placeholder: t("DataView.views.aiRequest.filtersPlaceholder"),
            }
          : entry === "appearance"
            ? {
                label: t("DataView.views.aiRequest.appearanceLabel"),
                placeholder: t("DataView.views.aiRequest.appearancePlaceholder"),
              }
            : {
                label: t("DataView.views.aiRequest.viewLabel"),
                placeholder: t("DataView.views.aiRequest.viewPlaceholder"),
              };

  return {
    available,
    dialog:
      target &&
      createElement(ViewAiRequestDialog, {
        open: promptOpen,
        title: target.mode === "create" ? t("DataView.views.createWithAi") : t("DataView.views.askAi"),
        description:
          target.mode === "edit"
            ? t("DataView.views.aiRequest.existingContext", {
                name: target.name,
                location: target.location,
              })
            : target.name
              ? t("DataView.views.aiRequest.namedContext", {
                  name: target.name,
                  location: target.location,
                })
              : t("DataView.views.aiRequest.newContext", { location: target.location }),
        ...inputCopy,
        value: requestText,
        disabledReason: getDisabledReason(),
        focusReturnTarget: target.opener,
        onChange: setRequestText,
        onClose: () => setPromptOpen(false),
        onReopen: () => setPromptOpen(true),
        onSend: sendRequest,
      }),
    openCurrent: () => {
      const name = store.views.find((view) => view.id === store.activeViewKey)?.name ?? t("DataView.views.all");
      openRequest("edit", name, getTrigger?.() ?? null);
    },
    openCreate: ({ name }: { name: string }) => {
      openRequest("create", name.trim(), getCreateTrigger?.() ?? getTrigger?.() ?? null);
    },
  };
}
