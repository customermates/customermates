import { UserDetailsForm } from "../components/user-details-form";

import { getAuthService, getGetUserDetailsInteractor, getRouteGuardService } from "@/core/di";
import { PageContainer } from "@/components/shared/page-container";

export default async function ProfileDetailsPage() {
  await getRouteGuardService().ensureAccessOrRedirect();

  const [result, session] = await Promise.all([getGetUserDetailsInteractor().invoke(), getAuthService().getSession()]);

  return (
    <PageContainer>
      <UserDetailsForm emailVerified={session?.user?.emailVerified ?? false} userDetails={result.data} />
    </PageContainer>
  );
}
