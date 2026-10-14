"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { focusAgentComposer } from "@/app/components/agent-chat/chat-ui";
import { isAiManageableDataViewSurface } from "@/core/data-view/ai-manageable-surfaces";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { SurfaceKeySchema } from "@/core/data-view/data-view-identity.schema";
import { useRootStore } from "@/core/stores/root-store.provider";

import { viewAiTypeLabel } from "./view-ai-type-label";

const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

type Options = {
  registerPageContext?: boolean;
  entry?: "view" | "filters" | "appearance";
};

function viewRoute(pathname: string, surfaceKey: string, viewKey: string, action?: "create" | "update") {
  const query = new URLSearchParams({ view: viewKey, viewSurface: surfaceKey });
  if (action) query.set("viewAction", action);
  return `${pathname}?${query}`;
}

export function useViewAi<E extends HasId>(
  store: BaseDataViewStore<E>,
  { registerPageContext = true, entry = "view" }: Options = {},
) {
  const { agentChatStore } = useRootStore();
  const pathname = usePathname();
  const t = useTranslations();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const releaseActionContext = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!registerPageContext || !store.p13nId || !agentChatStore) return;
    const registeredSurface = SurfaceKeySchema.safeParse(store.p13nId);
    if (!registeredSurface.success) return;
    const surfaceKey = registeredSurface.data;
    if (!isAiManageableDataViewSurface(surfaceKey)) return;

    const releaseView = agentChatStore.viewContext.register(
      pathname,
      () => (store.isReady && store.p13nId ? { surfaceKey: store.p13nId, viewKey: store.activeViewKey } : null),
      () => store.settleViewState(),
      store.viewPathname,
      store.applyViewProposal,
    );
    const releaseCandidates = agentChatStore.contextRegistry.register(pathname, () => {
      if (!store.isReady || store.p13nId !== surfaceKey) return [];
      const activeName = store.views.find((view) => view.id === store.activeViewKey)?.name ?? t("DataView.views.all");
      const currentViewType = viewAiTypeLabel(surfaceKey, t, "standalone", store.viewTypeLabel);
      const newViewType = viewAiTypeLabel(surfaceKey, t, "embedded", store.viewTypeLabel);
      const current: AgentContextAttachment = {
        reference: {
          kind: "dataView",
          surfaceKey,
          viewKey: store.activeViewKey,
          requestedAction: "update",
        },
        label: t("AgentChat.context.viewLabel", {
          name: activeName,
          viewType: currentViewType,
        }),
      };
      const create: AgentContextAttachment = {
        reference: {
          kind: "dataView",
          surfaceKey,
          requestedAction: "create",
        },
        label: t("AgentChat.context.newViewLabel", { viewType: newViewType }),
      };
      return [
        {
          context: current,
          pageRoute: viewRoute(store.viewPathname ?? pathname, surfaceKey, store.activeViewKey, "update"),
          starter: t("AgentChat.context.starter.update", {
            name: activeName,
          }),
        },
        {
          context: create,
          pageRoute: viewRoute(store.viewPathname ?? pathname, surfaceKey, store.activeViewKey, "create"),
          starter: t("AgentChat.context.starter.create"),
        },
      ];
    });

    return () => {
      releaseCandidates();
      releaseView();
    };
  }, [agentChatStore, pathname, registerPageContext, store, store.p13nId, store.viewPathname, t]);

  useEffect(
    () => () => {
      releaseActionContext.current?.();
      releaseActionContext.current = null;
    },
    [agentChatStore, pathname, store],
  );

  const surface = SurfaceKeySchema.safeParse(store.p13nId);
  const available =
    hydrated &&
    store.isReady &&
    surface.success &&
    isAiManageableDataViewSurface(surface.data) &&
    agentChatStore?.enabled === true;

  function open(mode: "create" | "update", name: string) {
    if (!available || !surface.success || !agentChatStore || !isAiManageableDataViewSurface(surface.data)) return;
    const viewKey = store.activeViewKey;
    const surfaceKey = surface.data;
    const viewType = viewAiTypeLabel(surfaceKey, t, mode === "update" ? "standalone" : "embedded", store.viewTypeLabel);
    const reference: AgentContextAttachment["reference"] =
      mode === "update"
        ? { kind: "dataView", surfaceKey, viewKey, requestedAction: "update" }
        : {
            kind: "dataView",
            surfaceKey,
            ...(name ? { proposedName: name } : {}),
            requestedAction: "create",
          };
    const context: AgentContextAttachment = {
      reference,
      label:
        mode === "create"
          ? name
            ? t("AgentChat.context.namedNewViewLabel", { name, viewType })
            : t("AgentChat.context.newViewLabel", { viewType })
          : t("AgentChat.context.viewLabel", { name, viewType }),
    };
    const starter =
      mode === "create"
        ? name
          ? t("AgentChat.context.starter.createNamed", { name })
          : t("AgentChat.context.starter.create")
        : surfaceKey === SURFACE.entityTimeline
          ? t("AgentChat.context.starter.timeline")
          : entry === "filters"
            ? t("AgentChat.context.starter.filters", { name })
            : entry === "appearance"
              ? t("AgentChat.context.starter.appearance", { name })
              : t("AgentChat.context.starter.update", { name });
    const pageRoute = viewRoute(store.viewPathname ?? pathname, surfaceKey, viewKey, mode);

    releaseActionContext.current?.();
    releaseActionContext.current = agentChatStore.viewContext.register(
      pathname,
      () =>
        store.isReady && store.p13nId === surfaceKey && store.activeViewKey === viewKey
          ? { surfaceKey, viewKey }
          : null,
      () => store.settleViewState(),
      store.viewPathname,
    );
    agentChatStore.openWithContextDraft({ context, draft: starter, pageRoute });
    if (surfaceKey === SURFACE.entityTimeline) {
      const record = agentChatStore.contextRegistry.candidates(pathname).find((candidate) => {
        const reference = candidate.context.reference;
        return (
          reference.kind === "record" &&
          (!store.viewPathname ||
            ("typeId" in reference &&
              store.viewPathname.endsWith(`/records/${reference.typeId}/${reference.recordId}`)))
        );
      });
      if (record)
        agentChatStore.addComposerContext(record.context, record.pageRoute, undefined, { replaceOldestAtLimit: true });
    }
    focusAgentComposer();
  }

  return {
    available,
    openCurrent: () => {
      const name = store.views.find((view) => view.id === store.activeViewKey)?.name ?? t("DataView.views.all");
      open("update", name);
    },
    openCreate: ({ name }: { name: string }) => open("create", name.trim()),
  };
}
