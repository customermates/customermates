import type { Metadata } from "next";

import { cookies } from "next/headers";

import { SignUpCard } from "./sign-up-card";

import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { di } from "@/core/dependency-injection/container";
import { InviteTokenValidationInteractor } from "@/features/company/invite-token-validation.interactor";
import { IS_CLOUD_HOSTED } from "@/constants/env";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signup" });
}

export default async function SignUpPage() {
  const cookiesStore = await cookies();
  const token = cookiesStore.get("inviteToken")?.value;
  const res = await di.get(InviteTokenValidationInteractor).invoke({ token });
  const companyName = res.valid ? res.companyName : null;

  return (
    <XPageCenter showGridBackground>
      <SignUpCard companyName={companyName} showSocialProviders={IS_CLOUD_HOSTED} />
    </XPageCenter>
  );
}
