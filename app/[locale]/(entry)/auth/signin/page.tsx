import type { Metadata } from "next";

import { setRequestLocale } from "next-intl/server";

import { SignInEntryForm } from "./sign-in-entry-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { enabledSocialProviders } from "@/core/auth/better-auth";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signin" });
}

export default async function SignInPage({ params }: Props) {
  setRequestLocale((await params).locale);

  return (
    <CenteredCardPage>
      <SignInEntryForm socialProviders={enabledSocialProviders} />
    </CenteredCardPage>
  );
}
