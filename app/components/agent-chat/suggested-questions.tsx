"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Compass, Globe2, Link2, Plus, Search, Sparkles } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { suggestionPageId, type SuggestionPageId } from "@/ee/agent-chat/agent-chat.schema";
import { agentPageActions, agentPageState, WIKI_WEBSITE_SETUP_ACTION_ID } from "@/ee/agent-chat/agent-page-actions";

import { usePathname } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";

import { Button } from "@/components/ui/button";

import { focusAgentComposer } from "./chat-ui";

const SUGGESTION_ICONS = [
  { icon: Compass, match: /tour|explain|capabilities/ },
  { icon: Link2, match: /connect/ },
  { icon: Plus, match: /create|first|import|setup/ },
  { icon: Search, match: /gaps|cleanup|relationships|needs-reply/ },
] as const;

function suggestionIcon(id: string) {
  if (id === WIKI_WEBSITE_SETUP_ACTION_ID) return Globe2;
  return SUGGESTION_ICONS.find((candidate) => candidate.match.test(id))?.icon ?? Sparkles;
}

type Props = {
  fallback?: ReactNode;
  pageId?: SuggestionPageId;
  state?: "data" | "empty";
  surface?: "chat" | "page";
};

const subscribeToHydration = () => () => undefined;
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

export const AgentStarterActions = observer(function AgentStarterActions({ fallback, ...props }: Props) {
  const { agentChatStore: store, userStore } = useRootStore();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  if (
    !hydrated ||
    store?.enabled !== true ||
    store.usage?.blockedReason ||
    !userStore ||
    (!props.state && !store.counts)
  )
    return fallback ?? null;

  return <AvailableAgentStarterActions {...props} />;
});

const AvailableAgentStarterActions = observer(function AvailableAgentStarterActions({
  pageId: explicitPageId,
  state: explicitState,
  surface = "chat",
}: Omit<Props, "fallback">) {
  const { agentChatStore: store, userStore, recordWorkspaceStore } = useRootStore();
  const t = useTranslations();
  const pathname = usePathname();

  const pageId = explicitPageId ?? suggestionPageId(pathname);
  const navigation = recordWorkspaceStore.navigation;
  const canSetupWorkspace =
    navigation?.canManageSchema === true &&
    userStore.can(Resource.company, Action.readOwn) &&
    userStore.can(Resource.company, Action.update);
  const canCreate =
    pageId === "dashboard"
      ? canSetupWorkspace
      : (pageId === "routines" && userStore.can(Resource.routines, Action.create)) ||
        (pageId === "wiki" && userStore.can(Resource.wiki, Action.create));
  let state = explicitState;
  if (!state) {
    const counts = store.counts;
    if (!counts) return null;
    state = agentPageState(pageId, counts);
  }
  const actions = agentPageActions(pageId, state, t, { canCreate });

  const choose = (prompt: string) => {
    store.openWithDraft(prompt);
    focusAgentComposer();
  };

  const buttons = ([1, 2, 3] as const).map((index) => {
    const action = actions[index - 1];
    if (!action) return null;
    const Icon = suggestionIcon(action.id);

    return (
      <Button
        key={index}
        className="h-auto gap-1.5 rounded-full px-3 py-2 text-xs font-normal whitespace-normal"
        data-agent-focus-return={surface === "page" ? "" : undefined}
        size="sm"
        variant="secondary"
        onClick={() => choose(action.prompt)}
      >
        <Icon aria-hidden="true" className="size-3.5" />

        {action.label}
      </Button>
    );
  });

  return surface === "chat" ? (
    <div
      className="flex flex-wrap items-center justify-center gap-2"
      data-testid="agent-suggestions"
      id="agent-suggestions"
    >
      {buttons}
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-center gap-2" data-testid="empty-page-agent-suggestions">
      {buttons}
    </div>
  );
});

export function SuggestedQuestions() {
  return <AgentStarterActions />;
}
