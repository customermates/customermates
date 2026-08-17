import { VerifyEmailCard } from "./verify-email-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { requireAccountState } from "@/features/auth/next/require";

export default async function VerifyEmailPage() {
  const resolution = await requireAccountState("overdueVerification");

  return (
    <CenteredCardPage>
      <VerifyEmailCard email={resolution.sessionUser?.email} />
    </CenteredCardPage>
  );
}
