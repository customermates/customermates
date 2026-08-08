import type { Metadata } from "next";

import { cookies } from "next/headers";

import { SignInForm } from "./sign-in-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { requireUnauthenticated } from "@/features/auth/next/require";
import { enabledSocialProviders } from "@/core/auth/better-auth";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { getInviteTokenValidationInteractor } from "@/core/di";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signin" });
}

export default async function SignInPage() {
  await requireUnauthenticated();
  const cookiesStore = await cookies();
  const token = cookiesStore.get("inviteToken")?.value;
  const result = await getInviteTokenValidationInteractor().invoke({ token });

  return (
    <CenteredCardPage>
      <SignInForm isInvited={result.data.valid} socialProviders={enabledSocialProviders} />
    </CenteredCardPage>
  );
}
