"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RoleDto } from "@/features/role/get-roles.interactor";
import type { UserDto } from "@/features/user/user.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useLayoutEffect, useMemo } from "react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { MembersPageSkeleton } from "./members-page-skeleton";
import { useMemberColumns } from "./use-member-columns";

type Props = { initialRoles: GetResult<RoleDto>; initialUsers: GetResult<UserDto> };

export const MembersPageView = observer(function MembersPageView({ initialRoles, initialUsers }: Props) {
  const { companyInviteModalStore, rolesStore, userModalStore, usersStore } = useRootStore();

  useDataViewSync(usersStore, initialUsers);
  const columns = useMemberColumns();
  const t = useTranslations();

  useLayoutEffect(() => rolesStore.setItems(initialRoles), [initialRoles, rolesStore]);

  const view = resolveDataViewView(usersStore.viewMode, usersStore.groupingColumnId);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(usersStore.searchTerm?.trim()) || (usersStore.filters?.length ?? 0) > 0,
    itemCount: usersStore.items.length,
    request: usersStore.dataRequest,
    total: usersStore.pagination?.total,
  });
  const handleAdd = useCallback(() => {
    void companyInviteModalStore.generateInviteLink();
    companyInviteModalStore.open();
  }, [companyInviteModalStore]);
  const allowedAdd = usersStore.canManage ? handleAdd : undefined;
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? t("Common.actions.add") : undefined}
        anchorScope="company-members"
        store={usersStore}
        onAdd={allowedAdd}
      />
    ),
    [allowedAdd, pageState, t, usersStore],
  );
  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => usersStore.setQueryOptions({ forceRefresh: true })}>
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
        <PageState background={<MembersPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty reason="filtered" store={usersStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={t("Common.actions.add")}
          background={<MembersPageSkeleton animated={false} view={view} />}
          reason="true-empty"
          store={usersStore}
          onAdd={allowedAdd}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          store={usersStore}
          view={view}
          onRowClick={(user) => void userModalStore.loadById(user.id)}
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={usersStore}>
      {body}
    </DataViewLayout>
  );
});
