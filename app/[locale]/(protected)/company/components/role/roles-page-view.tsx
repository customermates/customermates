"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RoleDto } from "@/features/role/get-roles.interactor";

import { observer } from "mobx-react-lite";
import { useLayoutEffect, useMemo } from "react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

import { RoleModal } from "./role-modal";
import { RolesPageSkeleton } from "./roles-page-skeleton";
import { useRoleColumns } from "./use-role-columns";

type Props = { initialRoles: GetResult<RoleDto> };

export const RolesPageView = observer(function RolesPageView({ initialRoles }: Props) {
  const { roleModalStore, rolesStore } = useRootStore();
  const columns = useRoleColumns();
  const t = useTranslations();
  useLayoutEffect(() => rolesStore.setItems(initialRoles), [initialRoles, rolesStore]);

  const view = resolveDataViewView(rolesStore.viewMode, rolesStore.isGrouped);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: (rolesStore.filters?.length ?? 0) > 0,
    isGrouped: rolesStore.isGrouped,
    itemCount: rolesStore.items.length,
    request: rolesStore.dataRequest,
    total: rolesStore.pagination?.total,
  });
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? t("Common.actions.add") : undefined}
        anchorScope="company-roles"
        isSearchable={false}
        store={rolesStore}
        onAdd={roleModalStore.add}
      />
    ),
    [pageState, roleModalStore.add, rolesStore, t],
  );
  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runUserAction(() => rolesStore.refreshQuery().catch(() => undefined))}
            >
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "loading":
      body = (
        <PageState background={<RolesPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty reason="filtered" store={rolesStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={t("Common.actions.add")}
          background={<RolesPageSkeleton animated={false} view={view} />}
          reason="true-empty"
          store={rolesStore}
          onAdd={roleModalStore.add}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          store={rolesStore}
          view={view}
          onRowClick={(role) => {
            roleModalStore.setRole(role);
            roleModalStore.open();
          }}
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <>
      <DataViewLayout
        showPagination={pageState === "content" && view !== "board" && !rolesStore.isGrouped}
        store={rolesStore}
      >
        {body}
      </DataViewLayout>

      <RoleModal store={roleModalStore} />
    </>
  );
});
