"use client";

import { ChevronRight, Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { Button } from "@/components/ui/button";
import { SectionRows } from "@/components/ui/section-rows";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { WorkspaceAvatar } from "./workspace-avatar";
import { workspaceDisplayName } from "./workspace-identity";
import { WorkspaceStatusChip } from "./workspace-status-chip";

const RestrictedWorkspaceSwitchContent = observer(() => {
  const t = useTranslations();
  const { createWorkspaceModalStore, workspacesStore } = useRootStore();
  const { canCreate, others } = workspacesStore;
  const fallback = t("Workspaces.fallbackName");

  if (others.length === 0 && !canCreate) return null;

  return (
    <AppCard className="max-w-md" data-slot="restricted-workspace-switch">
      <AppCardBody className="gap-3 py-4">
        <h2 className="text-xs font-medium text-muted-foreground">
          {others.length > 0 ? t("Workspaces.switchWorkspace") : t("Workspaces.restrictedCreateHint")}
        </h2>

        {others.length > 0 ? (
          <SectionRows asChild>
            <ul className="flex flex-col">
              {others.map((workspace) => {
                const name = workspaceDisplayName(workspace.name, fallback);

                return (
                  <li key={workspace.companyId}>
                    <button
                      className="flex w-full items-center gap-3 py-2.5 text-left text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-sm"
                      data-workspace-id={workspace.companyId}
                      type="button"
                      onClick={() => workspacesStore.requestSwitch(workspace.companyId)}
                    >
                      <WorkspaceAvatar companyId={workspace.companyId} name={name} />

                      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>

                      <WorkspaceStatusChip status={workspace.status} />

                      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </SectionRows>
        ) : null}

        {canCreate ? (
          <Button
            className="w-full"
            id="restricted-create-workspace"
            type="button"
            variant="secondary"
            onClick={(event) => createWorkspaceModalStore.start(event.currentTarget)}
          >
            <Plus aria-hidden />

            {t("Workspaces.create")}
          </Button>
        ) : null}
      </AppCardBody>
    </AppCard>
  );
});

export const RestrictedWorkspaceSwitch = serverRenderedClient(RestrictedWorkspaceSwitchContent);
