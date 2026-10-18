"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { WorkspaceAvatar } from "@/app/components/workspaces/workspace-avatar";
import { workspaceListName } from "@/app/components/workspaces/workspace-identity";
import { WorkspaceStatusChip } from "@/app/components/workspaces/workspace-status-chip";
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useRootStore } from "@/core/stores/root-store.provider";

import { foldText } from "./command-palette-search";

type Props = {
  query: string;
  onSwitch: (companyId: string) => void;
};

export const WorkspaceCommandLevel = observer(function WorkspaceCommandLevel({ query, onSwitch }: Props) {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();
  const fallback = t("Workspaces.fallbackName");
  const folded = foldText(query);
  const matches = workspacesStore.others
    .map((workspace) => ({
      workspace,
      name: workspaceListName(workspace, workspacesStore.items, fallback, (date) =>
        t("Workspaces.unnamedCreated", { name: fallback, date }),
      ),
    }))
    .filter(({ name }) => !folded || foldText(name).includes(folded));

  if (matches.length === 0) return <CommandEmpty persistent>{t("GlobalSearch.noResults")}</CommandEmpty>;

  return (
    <CommandGroup>
      {matches.map(({ workspace, name }) => (
        <CommandItem
          key={workspace.companyId}
          value={`workspace:${workspace.companyId}`}
          onSelect={() => onSwitch(workspace.companyId)}
        >
          <WorkspaceAvatar companyId={workspace.companyId} name={name} size="sm" />

          <span className="min-w-0 flex-1 truncate">{name}</span>

          <WorkspaceStatusChip status={workspace.status} />
        </CommandItem>
      ))}
    </CommandGroup>
  );
});
