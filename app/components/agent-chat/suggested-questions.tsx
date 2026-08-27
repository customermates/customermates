"use client";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import { Compass, Link2, Plus, Search, Sparkles } from "lucide-react";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { suggestionPageId } from "@/ee/agent-chat/agent-chat.schema";
import { agentPageActions, agentPageState } from "@/ee/agent-chat/agent-page-actions";

import { usePathname } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Button } from "@/components/ui/button";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

const SUGGESTION_ICONS = [
  { icon: Compass, match: /tour|explain|capabilities/ },
  { icon: Link2, match: /connect/ },
  { icon: Plus, match: /create|first|import|setup/ },
  { icon: Search, match: /gaps|cleanup|relationships|needs-reply/ },
] as const;

function suggestionIcon(id: string) {
  return SUGGESTION_ICONS.find((candidate) => candidate.match.test(id))?.icon ?? Sparkles;
}

export const SuggestedQuestions = observer(function SuggestedQuestions() {
  const { agentChatStore: store, userStore } = useRootStore();
  const { map } = useEntityTerminology();
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  if (!store.counts) return null;

  const pageId = suggestionPageId(pathname);
  const pageResource =
    pageId === "contacts"
      ? Resource.contacts
      : pageId === "organizations"
        ? Resource.organizations
        : pageId === "deals"
          ? Resource.deals
          : pageId === "services"
            ? Resource.services
            : pageId === "tasks"
              ? Resource.tasks
              : null;
  const canSetupWorkspace =
    [Resource.contacts, Resource.organizations, Resource.deals, Resource.services, Resource.tasks].every(
      (resource) => userStore.can(resource, Action.create) && userStore.can(resource, Action.readAll),
    ) &&
    userStore.can(Resource.company, Action.readOwn) &&
    userStore.can(Resource.company, Action.update);
  const canCreate =
    pageId === "dashboard" ? canSetupWorkspace : Boolean(pageResource && userStore.can(pageResource, Action.create));
  const terminology = map();
  const actions = agentPageActions(pageId, agentPageState(pageId, store.counts), t, locale, {
    canCreate,
    canSetupWorkspace,
    terminology: {
      contacts: terminology[EntityType.contact],
      organizations: terminology[EntityType.organization],
      deals: terminology[EntityType.deal],
      services: terminology[EntityType.service],
      tasks: terminology[EntityType.task],
    },
  });

  const choose = (prompt: string) => {
    store.setComposerDraft(prompt);
    requestAnimationFrame(() => {
      const composer = document.getElementById("agent-composer") as HTMLTextAreaElement | null;
      composer?.focus();
      composer?.setSelectionRange(prompt.length, prompt.length);
    });
  };

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2"
      data-testid="agent-suggestions"
      id="agent-suggestions"
    >
      {([1, 2, 3] as const).map((index) => {
        const action = actions[index - 1];
        if (!action) return null;
        const question = action.label;
        const prompt = action.prompt;
        const Icon = suggestionIcon(action.id);

        return (
          <Button
            key={index}
            className="h-auto gap-1.5 rounded-full px-3 py-2 text-xs font-normal whitespace-normal"
            size="sm"
            variant="secondary"
            onClick={() => choose(prompt)}
          >
            <Icon aria-hidden="true" className="size-3.5" />

            {question}
          </Button>
        );
      })}
    </div>
  );
});
