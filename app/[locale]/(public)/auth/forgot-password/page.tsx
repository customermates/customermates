import type { Metadata } from "next";

import { ForgotPasswordForm } from "./forgot-password-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getRouteGuardService } from "@/core/di";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/forgot-password" });
}

export default async function ForgotPasswordPage() {
  await getRouteGuardService().ensureUnauthenticatedOrRedirect();

  return (
    <CenteredCardPage>
      <ForgotPasswordForm />
    </CenteredCardPage>
  );
}
