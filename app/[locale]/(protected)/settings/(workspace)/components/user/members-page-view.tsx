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
import { RecordRowActions } from "@/app/[locale]/(protected)/records/[typeId]/components/record-row-actions";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Action } from "@/generated/prisma";
import { runUserAction } from "@/core/errors/report-application-error";

import { MembersPageSkeleton } from "./members-page-skeleton";
import { memberName, useMemberDeleteConfirmation } from "./user-modal";
import { isRemovableMember } from "./user-modal.store";
import { useMemberColumns } from "./use-member-columns";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

type Props = {
  initialRoles: GetResult<RoleDto>;
  initialUsers: GetResult<UserDto>;
};

const MembersPageViewContent = observer(function MembersPageView({ initialRoles, initialUsers }: Props) {
  const { companyInviteModalStore, rolesStore, userModalStore, usersStore, userStore } = useRootStore();
  const confirmDelete = useMemberDeleteConfirmation();

  useDataViewSync(usersStore, initialUsers);
  const columns = useMemberColumns();
  const t = useTranslations();

  useLayoutEffect(() => rolesStore.setItems(initialRoles), [initialRoles, rolesStore]);

  const view = resolveDataViewView(usersStore.viewMode, usersStore.canBoard);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(usersStore.searchTerm?.trim()) || (usersStore.filters?.length ?? 0) > 0,
    isGrouped: usersStore.isGrouped,
    itemCount: usersStore.items.length,
    request: usersStore.dataRequest,
    total: usersStore.pagination?.total,
  });
  const handleAdd = useCallback(() => {
    runUserAction(() => companyInviteModalStore.generateInviteLink());
    companyInviteModalStore.open();
  }, [companyInviteModalStore]);
  const allowedAdd = usersStore.canManage ? handleAdd : undefined;
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? t("Common.actions.add") : undefined}
        anchorScope="settings-members"
        searchLabel={t("Common.filters.searchFields.members")}
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
          rowActions={(user) => (
            <RecordRowActions
              name={memberName(user)}
              onDelete={
                userModalStore.allows(Action.update) && user.id !== userStore.user?.id && isRemovableMember(user)
                  ? async () => {
                      await userModalStore.loadById(user.id);
                      if (userModalStore.loadedUserId === user.id && userModalStore.canRemove)
                        confirmDelete(memberName(user), user.id);
                    }
                  : undefined
              }
              onOpen={() => runUserAction(() => userModalStore.loadById(user.id))}
            />
          )}
          store={usersStore}
          view={view}
          onRowClick={(user) => runUserAction(() => userModalStore.loadById(user.id))}
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout
      showPagination={pageState === "content" && view !== "board" && !usersStore.isGrouped}
      store={usersStore}
    >
      {body}
    </DataViewLayout>
  );
});

export const MembersPageView = serverRenderedClient(MembersPageViewContent);
