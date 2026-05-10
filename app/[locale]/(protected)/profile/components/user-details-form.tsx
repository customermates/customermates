"use client";

import type { UserDetails } from "@/features/user/get/get-user-details.interactor";

import { observer } from "mobx-react-lite";
import { useEffect, useId, useMemo } from "react";
import { Status } from "@/generated/prisma";

import { UserDetailsAvatar } from "./user-details-avatar";
import { VerifyEmailAction } from "./verify-email-action";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormActions } from "@/components/card/form-actions";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  userDetails: UserDetails;
  emailVerified: boolean;
};

export const UserDetailsForm = observer(({ userDetails, emailVerified }: Props) => {
  const formId = useId();
  const { userDetailsStore, userStore } = useRootStore();
  const { savedState } = userDetailsStore;

  useEffect(() => {
    userDetailsStore.onInitOrRefresh({
      firstName: userDetails.firstName,
      lastName: userDetails.lastName,
      country: userDetails.country,
      avatarUrl: userDetails.avatarUrl,
    });
  }, [userDetails]);

  const topBarActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {!emailVerified && <VerifyEmailAction />}

        <FormActions formId={formId} store={userDetailsStore} variant="topbar" />
      </div>
    ),
    [formId, userDetailsStore, emailVerified],
  );
  useSetTopBarActions(topBarActions);

  return (
    <AppForm id={formId} store={userDetailsStore}>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <UserDetailsAvatar
          avatarUrl={savedState.avatarUrl ?? undefined}
          email={userStore.user?.email ?? ""}
          emailVerified={emailVerified}
          firstName={savedState.firstName}
          lastName={savedState.lastName}
          roleName={userStore.user?.role?.name ?? ""}
          status={userStore.user?.status ?? Status.active}
        />

        <div className="flex flex-col gap-3">
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInput required id="firstName" />

            <FormInput required id="lastName" />
          </div>

          <FormAutocompleteCountry required id="country" />

          <FormInput id="avatarUrl" />
        </div>
      </div>
    </AppForm>
  );
});
