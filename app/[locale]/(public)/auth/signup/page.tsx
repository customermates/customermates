import type { Metadata } from "next";

import { cookies } from "next/headers";

import { SignUpForm } from "./sign-up-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getInviteTokenValidationInteractor } from "@/core/di";
import { requireUnauthenticated } from "@/features/auth/next/require";
import { enabledSocialProviders } from "@/core/auth/better-auth";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signup" });
}

export default async function SignUpPage() {
  await requireUnauthenticated();

  const cookiesStore = await cookies();
  const token = cookiesStore.get("inviteToken")?.value;
  const result = await getInviteTokenValidationInteractor().invoke({ token });

  return (
    <CenteredCardPage>
      <SignUpForm isInvited={result.ok && result.data.valid} socialProviders={enabledSocialProviders} />
    </CenteredCardPage>
  );
}
