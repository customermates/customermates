import type { Metadata } from "next";

import { cookies } from "next/headers";

import { SignUpForm } from "./sign-up-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getInviteTokenValidationInteractor, getRouteGuardService } from "@/core/app-di";
import { env } from "@/env";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signup" });
}

export default async function SignUpPage() {
  await getRouteGuardService().ensureUnauthenticatedOrRedirect();

  const cookiesStore = await cookies();
  const token = cookiesStore.get("inviteToken")?.value;
  const result = await getInviteTokenValidationInteractor().invoke({ token });
  const companyName = result.data.valid ? result.data.companyName : null;

  return (
    <CenteredCardPage>
      <SignUpForm companyName={companyName} showSocialProviders={env.CLOUD_HOSTED} />
    </CenteredCardPage>
  );
}
