"use client";

import { Check, Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useRootStore } from "@/core/stores/root-store.provider";

import { WorkspaceAvatar } from "./workspace-avatar";
import { workspaceListName } from "./workspace-identity";
import { WorkspaceStatusChip } from "./workspace-status-chip";

type Props = {
  onSwitch: (companyId: string) => void;
  onCreate: () => void;
};

export const WorkspaceSwitcherItems = observer(({ onSwitch, onCreate }: Props) => {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();
  const fallback = t("Workspaces.fallbackName");

  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {t("SettingsNav.workspaces")}
      </DropdownMenuLabel>

      {workspacesStore.items.map((workspace) => {
        const name = workspaceListName(workspace, workspacesStore.items, fallback, (date) =>
          t("Workspaces.unnamedCreated", { name: fallback, date }),
        );

        return (
          <DropdownMenuItem
            key={workspace.companyId}
            aria-current={workspace.isCurrent ? "true" : undefined}
            data-workspace-id={workspace.companyId}
            onSelect={() => {
              if (!workspace.isCurrent) onSwitch(workspace.companyId);
            }}
          >
            <WorkspaceAvatar companyId={workspace.companyId} name={name} size="sm" />

            <span className="min-w-0 flex-1 truncate">{name}</span>

            <WorkspaceStatusChip status={workspace.status} />

            {workspace.isCurrent ? <Check aria-hidden className="size-4 text-foreground" /> : null}
          </DropdownMenuItem>
        );
      })}

      {workspacesStore.canCreate ? (
        <DropdownMenuItem id="workspace-menu-create" onSelect={onCreate}>
          <Plus />

          <span>{t("Workspaces.create")}</span>
        </DropdownMenuItem>
      ) : null}
    </>
  );
});
