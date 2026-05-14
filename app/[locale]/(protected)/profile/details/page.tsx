import { UserDetailsForm } from "../components/user-details-form";

import { getAuthService, getGetUserDetailsInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function ProfileDetailsPage() {
  await requireAccess();

  const [result, session] = await Promise.all([getGetUserDetailsInteractor().invoke(), getAuthService().getSession()]);

  return (
    <PageContainer>
      <UserDetailsForm emailVerified={session?.user?.emailVerified ?? false} userDetails={result.data} />
    </PageContainer>
  );
}
