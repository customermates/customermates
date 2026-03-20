import type { Metadata } from "next";

import { SignInCard } from "./sign-in-card";

import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { IS_CLOUD_HOSTED } from "@/constants/env";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/signin" });
}

export default function SignInPage() {
  return (
    <XPageCenter showGridBackground>
      <SignInCard showSocialProviders={IS_CLOUD_HOSTED} />
    </XPageCenter>
  );
}
