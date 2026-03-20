import { Action, Resource } from "@/generated/prisma/client";

import { UserDetailsCard } from "./components/user-details-card";
import { UserSettingsCard } from "./components/user-settings-card";
import { ApiKeysCard } from "./components/api-keys-card";

import { GetUserDetailsInteractor } from "@/features/user/get/get-user-details.interactor";
import { GetApiKeysInteractor } from "@/features/api-key/get-api-keys.interactor";
import { XPageRowContent } from "@/components/x-layout-primitives/x-page-row-content";
import { XPageRow } from "@/components/x-layout-primitives/x-page-row";
import { di } from "@/core/dependency-injection/container";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { UserService } from "@/features/user/user.service";

export default async function ProfilePage() {
  await di.get(RouteGuardService).ensureAccessOrRedirect();

  const canAccessApi = await di.get(UserService).hasPermission(Resource.api, Action.readAll);

  const [userDetails, apiKeys] = await Promise.all([
    di.get(GetUserDetailsInteractor).invoke(),
    canAccessApi ? di.get(GetApiKeysInteractor).invoke() : [],
  ]);

  return (
    <XPageContainer>
      <XPageRow columns="2/1">
        <XPageRowContent>
          <UserDetailsCard userDetails={userDetails} />
        </XPageRowContent>

        <XPageRowContent>
          <UserSettingsCard />

          {canAccessApi && <ApiKeysCard apiKeys={apiKeys} />}
        </XPageRowContent>
      </XPageRow>
    </XPageContainer>
  );
}
