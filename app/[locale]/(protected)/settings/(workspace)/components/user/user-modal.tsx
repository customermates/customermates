"use client";

import type { MemberRemovalBlock } from "./user-modal.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { UserMinus } from "lucide-react";
import { Status } from "@/generated/prisma";

import { UserDetailsAvatar } from "@/app/[locale]/(protected)/settings/(account)/components/user-details-avatar";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormSelectChip } from "@/components/forms/form-select-chip";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { USER_STATUS_OPTIONS } from "@/constants/user-statuses";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppLink } from "@/components/shared/app-link";
import { Alert } from "@/components/shared/alert";
import { roleDisplayName } from "@/features/role/role-display-name";
import { settingsHref } from "@/app/components/navigation/settings-routes";
import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";

function memberRemovalBlocker(
  t: ReturnType<typeof useTranslations>,
  block: MemberRemovalBlock | null,
  name: string,
): string | undefined {
  if (block === "lastAdmin") return t("MemberRemoval.blocked.lastAdmin", { name });
  if (block === "platformOperator") return t("MemberRemoval.blocked.platformOperator");
  return undefined;
}

export function useMemberRemovalConfirmation() {
  const t = useTranslations();
  const { userModalStore, workspacesStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();

  return (member: { name: string; pending: boolean }, memberId: string) => {
    const { name, pending } = member;
    const workspace = workspaceDisplayName(workspacesStore.current?.name, t("Workspaces.fallbackName"));
    const blocker = memberRemovalBlocker(t, userModalStore.removalBlockedBy, name);

    showConfirmation({
      title: t("MemberRemoval.confirmTitle", { name, workspace }),
      message: pending
        ? t("MemberRemoval.pendingDescription", { name })
        : t("MemberRemoval.confirmDescription", { name }),
      details: blocker
        ? undefined
        : pending
          ? [t("MemberRemoval.consequences.rejoin")]
          : [
              t("MemberRemoval.consequences.credentials"),
              t("MemberRemoval.consequences.channels"),
              t("MemberRemoval.consequences.records"),
              t("MemberRemoval.consequences.rejoin"),
              t("MemberRemoval.consequences.notified"),
            ],
      blockers: blocker ? [blocker] : undefined,
      confirmLabel: t("Common.actions.remove"),
      confirmVariant: "destructive",
      successKey: "MemberRemoval.removed",
      onConfirm: () => userModalStore.remove(memberId),
    });
  };
}

export function memberName(member: { firstName: string; lastName: string; email: string }) {
  return [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
}

export const CompanyUserModal = observer(() => {
  const t = useTranslations();
  const { userModalStore: store, rolesStore, appMode } = useRootStore();
  const { form, savedState, isOwnProfile, showsRemoval, removalBlockedBy, isLoading, loadedUserId, loadedLeftAt } =
    store;
  const confirmRemoval = useMemberRemovalConfirmation();
  const name = memberName({ ...savedState, email: form.email });
  const blockedReason = memberRemovalBlocker(t, removalBlockedBy, name);

  return (
    <AppModal
      actions={
        showsRemoval && loadedUserId
          ? [
              {
                id: "remove-member",
                anchorId: "member-modal-remove",
                label: t("MemberRemoval.action"),
                tooltip: blockedReason,
                icon: UserMinus,
                variant: "destructive",
                disabled: isLoading || blockedReason !== undefined,
                onClick: () =>
                  confirmRemoval({ name, pending: store.loadedStatus === Status.pendingAuthorization }, loadedUserId),
              },
            ]
          : []
      }
      store={store}
      title={t("CompanyUserModal.title")}
    >
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <UserDetailsAvatar
              avatarUrl={savedState.avatarUrl ?? undefined}
              email={form.email}
              firstName={savedState.firstName}
              lastName={savedState.lastName}
              status={savedState.status}
            />
          </AppCardHeader>

          <AppCardBody>
            {loadedLeftAt ? (
              <Alert color="warning">
                <p className="text-x-sm">{t("WorkspaceMembership.leftNotice", { name })}</p>
              </Alert>
            ) : null}

            {isOwnProfile && (
              <Alert color="warning">
                <p className="text-x-sm">
                  {t.rich("CompanyUserModal.activeUserWarning", {
                    settingsLink: (chunks) => (
                      <AppLink inheritSize appearance="inline" href={settingsHref("profile")}>
                        {chunks}
                      </AppLink>
                    ),
                  })}
                </p>

                {appMode === "demo" ? null : (
                  <p className="text-x-sm">
                    {t.rich("MemberRemoval.ownHint", {
                      generalLink: (chunks) => (
                        <AppLink inheritSize appearance="inline" href={settingsHref("general")}>
                          {chunks}
                        </AppLink>
                      ),
                    })}
                  </p>
                )}
              </Alert>
            )}

            <FormInput readOnly id="email" inputId="member-modal-email" label={t("Common.email")} type="email" />

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              <FormInput autoFocus required id="firstName" inputId="member-modal-first-name" />

              <FormInput required id="lastName" inputId="member-modal-last-name" />
            </div>

            <FormAutocompleteCountry required id="country" inputId="member-modal-country" value={form.country} />

            <FormSelect
              required
              showErrorMessage
              disabled={isOwnProfile}
              id="roleId"
              inputId="member-modal-role"
              items={rolesStore.items.map((item) => ({
                value: item.id,
                label: roleDisplayName(item, t("RoleModal.systemName")),
              }))}
              optionsLoading={!rolesStore.isReady}
            />

            <FormInput
              description={t("Common.avatarUrlDescription")}
              id="avatarUrl"
              inputId="member-modal-avatar-url"
            />

            <FormSelectChip
              required
              disabled={isOwnProfile || Boolean(loadedLeftAt)}
              disabledKeys={new Set([Status.pendingAuthorization])}
              id="status"
              inputId="member-modal-status"
              items={USER_STATUS_OPTIONS}
              translateFn={(key) => t(`Common.userStatuses.${key}`)}
            />
          </AppCardBody>

          <FormFooterActions anchorScope="member-modal" store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
