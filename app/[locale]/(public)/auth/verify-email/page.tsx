import { redirect } from "next/navigation";

import { VerifyEmailCard } from "./verify-email-card";

import { di } from "@/core/dependency-injection/container";
import { AuthService } from "@/features/auth/auth.service";
import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";

export default async function VerifyEmailPage() {
  const session = await di.get(AuthService).getSession();

  if (!session) redirect("/auth/signin");

  if (session?.user?.emailVerified) redirect("/");

  return (
    <XPageCenter>
      <VerifyEmailCard email={session?.user?.email} />
    </XPageCenter>
  );
}
