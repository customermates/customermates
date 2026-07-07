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

export const CompanyUserModal = observer(() => {
  const t = useTranslations();
  const { userModalStore: store, rolesStore } = useRootStore();
  const { form, savedState, isOwnProfile, isDisabledOrOwnProfile } = store;

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
            <FormInput readOnly id="email" label={t("Common.email")} type="email" />

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              <FormInput autoFocus required id="firstName" />

              <FormInput required id="lastName" />
            </div>

            <FormAutocompleteCountry required disabled={isDisabledOrOwnProfile} id="country" value={form.country} />

            <FormSelect
              required
              id="roleId"
              items={rolesStore.items.map((item) => ({ value: item.id, label: item.name }))}
            />

            <FormInput description={t("Common.avatarUrlDescription")} id="avatarUrl" />

            <FormSelectChip
              required
              disabled={isDisabledOrOwnProfile}
              disabledKeys={new Set([Status.pendingAuthorization])}
              id="status"
              items={USER_STATUS_OPTIONS}
              translateFn={(key) => t(`Common.userStatuses.${key}`)}
            />

            {isOwnProfile && (
              <Alert color="warning">
                <p className="text-x-sm">
                  {t.rich("CompanyUserModal.activeUserWarning", {
                    settingsLink: (chunks) => (
                      <AppLink inheritSize className="text-current" href="/profile/details">
                        {chunks}
                      </AppLink>
                    ),
                  })}
                </p>
              </Alert>
            )}
          </AppCardBody>

          <FormActions anchorScope="member-modal" overrideDisabled={isDisabledOrOwnProfile} store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
