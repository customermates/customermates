"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Status } from "@/generated/prisma";

import { UserDetailsAvatar } from "../../../profile/components/user-details-avatar";

import { XForm } from "@/components/x-inputs/x-form";
import { XSelect } from "@/components/x-inputs/x-select";
import { XSelectItem } from "@/components/x-inputs/x-select-item";
import { XInput } from "@/components/x-inputs/x-input";
import { XAutocompleteCountry } from "@/components/x-inputs/x-autocomplete/x-autocomplete-country";
import { XSelectChip } from "@/components/x-inputs/x-select-chip";
import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardModalDefaultFooter } from "@/components/x-card/x-card-modal-default-footer";
import { USER_STATUS_OPTIONS } from "@/constants/user-statuses";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XLink } from "@/components/x-link";
import { XAlert } from "@/components/x-alert";
import { XChip } from "@/components/x-chip/x-chip";

export const CompanyUserModal = observer(() => {
  const t = useTranslations("");
  const { userModalStore: store, rolesStore } = useRootStore();
  const { form, savedState, isOwnProfile, isDisabledOrOwnProfile } = store;

  return (
    <XModal store={store}>
      <XForm store={store}>
        <XCard>
          <XCardHeader>
            <UserDetailsAvatar
              avatarUrl={savedState.avatarUrl ?? undefined}
              email={form.email}
              firstName={savedState.firstName}
              lastName={savedState.lastName}
              status={savedState.status}
            />
          </XCardHeader>

          <XCardBody>
            <XInput isDisabled id="email" label={t("Common.email")} value={form.email} />

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              <XInput autoFocus isRequired id="firstName" isDisabled={isDisabledOrOwnProfile} value={form.firstName} />

              <XInput isRequired id="lastName" isDisabled={isDisabledOrOwnProfile} value={form.lastName} />
            </div>

            <XAutocompleteCountry
              isRequired
              allowsEmptyCollection={false}
              id="country"
              isDisabled={isDisabledOrOwnProfile}
              value={form.country}
            />

            <XSelect
              disallowEmptySelection
              isMultiline
              isRequired
              id="roleId"
              isDisabled={isDisabledOrOwnProfile}
              items={rolesStore.items}
              renderValue={(items) => items.map((item) => <XChip key={item.key}>{item.data?.name}</XChip>)}
              value={form.roleId}
            >
              {(item) =>
                XSelectItem({
                  key: item.id,
                  textValue: item.name,
                  children: (
                    <div className="flex flex-col gap-2">
                      <XChip className="max-w-fit">{item.name}</XChip>

                      {item.description && <span className="text-x-sm text-subdued">{item.description}</span>}
                    </div>
                  ),
                })
              }
            </XSelect>

            <XInput description={t("Common.avatarUrlDescription")} id="avatarUrl" isDisabled={isDisabledOrOwnProfile} />

            <XSelectChip
              disallowEmptySelection
              isRequired
              disabledKeys={new Set([Status.pendingAuthorization])}
              id="status"
              isDisabled={isDisabledOrOwnProfile}
              items={USER_STATUS_OPTIONS}
              translateFn={(key) => t(`Common.userStatuses.${key}`)}
            />

            {isOwnProfile && (
              <XAlert color="warning">
                <p className="text-x-sm">
                  {t.rich("CompanyUserModal.activeUserWarning", {
                    settingsLink: (chunks) => (
                      <XLink inheritSize color="warning" href="/profile" underline="always">
                        {chunks}
                      </XLink>
                    ),
                  })}
                </p>
              </XAlert>
            )}
          </XCardBody>

          <XCardModalDefaultFooter overrideDisabled={isDisabledOrOwnProfile} store={store} />
        </XCard>
      </XForm>
    </XModal>
  );
});
