import type { Metadata } from "next";

import { ForgotPasswordCard } from "./forgot-password-card";

import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/forgot-password" });
}

export default function ForgotPasswordPage() {
  return (
    <XPageCenter showGridBackground>
      <ForgotPasswordCard />
    </XPageCenter>
  );
}
