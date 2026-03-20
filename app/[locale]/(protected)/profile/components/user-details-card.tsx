"use client";

import type { UserDetails } from "@/features/user/get/get-user-details.interactor";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Status } from "@/generated/prisma";

import { UserDetailsAvatar } from "./user-details-avatar";

import { XInput } from "@/components/x-inputs/x-input";
import { XCard } from "@/components/x-card/x-card";
import { XForm } from "@/components/x-inputs/x-form";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XAutocompleteCountry } from "@/components/x-inputs/x-autocomplete/x-autocomplete-country";
import { XSelectChip } from "@/components/x-inputs/x-select-chip";
import { XCardFormFooter } from "@/components/x-card/x-card-form-footer";
import { USER_STATUS_OPTIONS } from "@/constants/user-statuses";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  userDetails: UserDetails;
};

export const UserDetailsCard = observer(({ userDetails }: Props) => {
  const t = useTranslations("");
  const { userDetailsCardStore, userStore } = useRootStore();
  const { savedState } = userDetailsCardStore;

  useEffect(() => {
    userDetailsCardStore.onInitOrRefresh({
      firstName: userDetails.firstName,
      lastName: userDetails.lastName,
      country: userDetails.country,
      avatarUrl: userDetails.avatarUrl,
    });
  }, [userDetails]);

  return (
    <XForm store={userDetailsCardStore}>
      <XCard>
        <XCardHeader>
          <UserDetailsAvatar
            avatarUrl={savedState.avatarUrl ?? undefined}
            email={userStore.user?.email ?? ""}
            firstName={savedState.firstName}
            lastName={savedState.lastName}
            roleName={userStore.user?.role?.name ?? ""}
            status={userStore.user?.status ?? Status.active}
          />
        </XCardHeader>

        <XCardBody>
          <XInput isDisabled id="email" type="email" value={userStore.user?.email} />

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <XInput isRequired id="firstName" />

            <XInput isRequired id="lastName" />
          </div>

          <XAutocompleteCountry isRequired allowsEmptyCollection={false} id="country" />

          <XInput description={t("Common.avatarUrlDescription")} id="avatarUrl" />

          <XSelectChip
            disallowEmptySelection
            isDisabled
            isRequired
            id="status"
            items={USER_STATUS_OPTIONS}
            translateFn={(key) => t(`Common.userStatuses.${key}`)}
            value={userStore.user?.status}
          />
        </XCardBody>

        <XCardFormFooter />
      </XCard>
    </XForm>
  );
});
