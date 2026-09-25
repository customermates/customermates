"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Status } from "@/generated/prisma";

import { UserDetailsAvatar } from "../../../profile/components/user-details-avatar";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormSelectChip } from "@/components/forms/form-select-chip";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { FormActions } from "@/components/card/form-actions";
import { USER_STATUS_OPTIONS } from "@/constants/user-statuses";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppLink } from "@/components/shared/app-link";
import { Alert } from "@/components/shared/alert";
import { roleDisplayName } from "@/features/role/role-display-name";

export const CompanyUserModal = observer(() => {
  const t = useTranslations();
  const { userModalStore: store, rolesStore } = useRootStore();
  const { form, savedState, isOwnProfile } = store;

  return (
    <AppModal store={store} title={t("CompanyUserModal.title")}>
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
            {isOwnProfile && (
              <Alert color="warning">
                <p className="text-x-sm">
                  {t.rich("CompanyUserModal.activeUserWarning", {
                    settingsLink: (chunks) => (
                      <AppLink inheritSize appearance="inline" href="/profile/settings">
                        {chunks}
                      </AppLink>
                    ),
                  })}
                </p>
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
              disabledKeys={new Set([Status.pendingAuthorization])}
              id="status"
              inputId="member-modal-status"
              items={USER_STATUS_OPTIONS}
              translateFn={(key) => t(`Common.userStatuses.${key}`)}
            />
          </AppCardBody>

          <FormActions showInitially anchorScope="member-modal" store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
