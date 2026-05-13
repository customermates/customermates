import { redirect } from "next/navigation";

import { VerifyEmailCard } from "./verify-email-card";

import { getAuthService } from "@/core/app-di";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

export default async function VerifyEmailPage() {
  const session = await getAuthService().getSession();

  if (!session) redirect("/auth/signin");

  if (session?.user?.emailVerified) redirect("/");

  return (
    <CenteredCardPage>
      <VerifyEmailCard email={session?.user?.email} />
    </CenteredCardPage>
  );
}
