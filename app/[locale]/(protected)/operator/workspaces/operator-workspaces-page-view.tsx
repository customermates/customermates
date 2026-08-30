"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

import { OperatorDataViewPage } from "../operator-data-view-page";
import { useOperatorWorkspaceColumns } from "./use-operator-workspace-columns";

type Props = { initialWorkspaces: GetResult<OperatorWorkspaceRowDto> };

export const OperatorWorkspacesPageView = observer(function OperatorWorkspacesPageView({ initialWorkspaces }: Props) {
  const { operatorWorkspaceModalStore, operatorWorkspacesStore } = useRootStore();
  const columns = useOperatorWorkspaceColumns();
  const t = useTranslations();

  return (
    <OperatorDataViewPage
      anchorScope="operator-workspaces"
      columns={columns}
      emptyBody={t("OperatorWorkspaces.emptyBody")}
      emptyTitle={t("OperatorWorkspaces.emptyTitle")}
      initialData={initialWorkspaces}
      searchPlaceholder={t("OperatorWorkspaces.searchPlaceholder")}
      store={operatorWorkspacesStore}
      onRowClick={(item) => operatorWorkspaceModalStore.openForWorkspace(item)}
    />
  );
});
