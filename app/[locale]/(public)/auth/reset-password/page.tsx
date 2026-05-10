import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { ResetPasswordForm } from "./reset-password-form";

import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { getRouteGuardService } from "@/core/di";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/reset-password" });
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  await getRouteGuardService().ensureUnauthenticatedOrRedirect();

  const params = await searchParams;
  const error = params.error;
  if (error === "INVALID_TOKEN") redirect("/auth/forgot-password?info=RESET_LINK_INVALID");

  return (
    <CenteredCardPage>
      <ResetPasswordForm />
    </CenteredCardPage>
  );
}
