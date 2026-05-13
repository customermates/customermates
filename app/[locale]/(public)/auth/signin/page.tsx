import type { Metadata } from "next";

import { SignInForm } from "./sign-in-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getRouteGuardService } from "@/core/app-di";
import { env } from "@/env";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signin" });
}

export default async function SignInPage() {
  await getRouteGuardService().ensureUnauthenticatedOrRedirect();

  return (
    <CenteredCardPage>
      <SignInForm showSocialProviders={env.CLOUD_HOSTED} />
    </CenteredCardPage>
  );
}
