import type { Metadata } from "next";

import { cookies } from "next/headers";

import { SignUpCard } from "./sign-up-card";

import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getInviteTokenValidationInteractor } from "@/core/di";
import { IS_CLOUD_HOSTED } from "@/constants/env";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signup" });
}

export default async function SignUpPage() {
  const cookiesStore = await cookies();
  const token = cookiesStore.get("inviteToken")?.value;
  const result = await getInviteTokenValidationInteractor().invoke({ token });
  const companyName = result.data.valid ? result.data.companyName : null;

  return (
    <XPageCenter>
      <SignUpCard companyName={companyName} showSocialProviders={IS_CLOUD_HOSTED} />
    </XPageCenter>
  );
}
