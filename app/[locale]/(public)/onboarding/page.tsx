import { redirect } from "next/navigation";

import { OnboardingCard } from "./components/onboarding-card";

import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { di } from "@/core/dependency-injection/container";
import { AuthService } from "@/features/auth/auth.service";
import { UserService } from "@/features/user/user.service";

export default async function OnboardingPage() {
  const isRegistered = await di.get(UserService).isRegistered();

  if (isRegistered) redirect("/");

  const session = await di.get(AuthService).getSessionOrRedirect();

  const name = session.user?.name ?? "";
  const isEmail = name.includes("@");
  const spaceIndex = name.indexOf(" ");
  const firstName = isEmail ? undefined : spaceIndex === -1 ? name : name.slice(0, spaceIndex);
  const lastName = isEmail ? undefined : spaceIndex === -1 ? undefined : name.slice(spaceIndex + 1);
  const avatarUrl = session.user?.image?.startsWith("https:") ? session.user.image : "";

  return (
    <XPageCenter>
      <OnboardingCard
        avatarUrl={avatarUrl}
        email={session.user?.email ?? ""}
        firstName={firstName}
        lastName={lastName}
      />
    </XPageCenter>
  );
}
